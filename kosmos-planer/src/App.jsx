import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
  PointerSensor,
  KeyboardSensor
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Users, RefreshCw, Settings, AlertCircle,
  Trash2, PlusCircle, UploadCloud, LogIn, X,
  Lock, Unlock, MessageSquare, Globe, Flag, Layout,
  AlertTriangle, Mic2, PieChart, Search, CheckCircle2, Languages,
  Download, DownloadCloud, Loader2, Key, LogOut, Mail, LayoutDashboard, Shield
} from 'lucide-react';
import {
  INBOX_ID, HEADER_HEIGHT, PIXELS_PER_MINUTE, SNAP_MINUTES,
  STATUS_COLORS, FORMAT_COLORS, SCOPES, AUTH_STORAGE_KEY,
  generateId, safeString, cleanForCSV, timeToMinutes, minutesToTime,
  calculateEndTime, checkOverlap, getErrorMessage
} from './utils';
import SessionModal from './SessionModal';
import CurationDashboard from './CurationDashboard';
import AdminDashboard from './AdminDashboard';
import SpeakerRegistration from './SpeakerRegistration';
import SessionSubmission from './SessionSubmission';

// --- HELPERS IMPORTED FROM utils.js ---

// --- AUTH HELPERS ---
function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const auth = JSON.parse(raw);
    // Check if token is expired (with 60s buffer)
    if (auth.expiresAt && Date.now() > auth.expiresAt - 60000) {
      if (auth.refreshToken) return { ...auth, expired: true };
      localStorage.removeItem(AUTH_STORAGE_KEY); // Clear if expired and no refresh token
      return null;
    }
    return auth;
  } catch (e) {
    return null;
  }
}

function storeAuth(tokenData) {
  const expiresAt = Date.now() + (parseInt(tokenData.expires_in) || 3600) * 1000;
  const auth = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  return auth;
}

function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function parseAuthFromFragment() {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (accessToken) {
    return {
      access_token: accessToken,
      expires_in: parseInt(params.get('expires_in') || '3600'),
      refresh_token: params.get('refresh_token') || null,
    };
  }
  return null;
}

async function refreshAccessToken(refreshToken) {
  // Implicit flow doesn't have refresh tokens generally,
  // but if we had a server-side component we'd do it here.
  // For this client-side only app, we'll just throw an error.
  throw new Error("Refresh not implemented for implicit flow");
}

async function getValidAccessToken() {
  // If we have a manual token, return it directly
  const manualToken = localStorage.getItem('kosmos_manualToken');
  if (manualToken) return manualToken;

  const auth = getStoredAuth();
  if (!auth) return null;
  if (!auth.expired) return auth.accessToken;

  if (auth.refreshToken) {
    try {
      const newAuth = await refreshAccessToken(auth.refreshToken);
      storeAuth(newAuth); // Store the new token data
      return newAuth.accessToken;
    } catch (e) {
      clearAuth();
      return null;
    }
  }

  clearAuth();
  return null;
}

/**
 * Robust fetch wrapper for Sheets API that falls back to direct Google API calls
 * if the local proxy is not available.
 */
async function fetchSheets(body, token) {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  let lastError = null;

  // Try the internal proxy first
  try {
    const res = await fetch('/api/sheets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const text = await res.text();
      if (!text) {
        console.warn('[Direct Sheets Fallback] Empty response from proxy');
        if (isLocal) throw new Error("EmptyProxyResponse"); // Trigger catch block to fallback
        return { ok: true, data: {} };
      }
      try {
        const data = JSON.parse(text);
        return { ok: true, data };
      } catch (e) {
        console.warn('[Direct Sheets Fallback] Non-JSON response from proxy');
        if (isLocal) throw new Error("NonJsonResponse"); // Trigger catch block to fallback
        return { ok: false, error: "Ungültige Server-Antwort", status: res.status };
      }
    }

    // Capture error but maybe fallback
    let lastError = `HTTP ${res.status}`;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        const errorData = await res.json();
        lastError = errorData.error || lastError;
      } catch (e) { }
    }

    // Only fallback if it's a proxy connectivity issue or server error on localhost
    if (isLocal && (res.status === 404 || res.status === 500 || res.status === 502 || res.status === 504)) {
      console.warn(`[Direct Sheets Fallback] Proxy returned ${res.status}, attempting direct Google API call...`);
    } else {
      return { ok: false, error: lastError, status: res.status };
    }
  } catch (e) {
    console.warn('[Direct Sheets Fallback] Fetch failed (network error), attempting direct Google API call:', e);
    if (!isLocal) throw e;
  }

  // FALLBACK: Call Google Sheets API directly from the browser
  const { action, spreadsheetId, ranges, range, values } = body;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

  try {
    let url = '';
    let method = 'GET';
    let fetchBody = null;

    if (action === 'batchGet') {
      const params = new URLSearchParams();
      ranges.forEach(r => params.append('ranges', r));
      if (apiKey) params.append('key', apiKey);
      url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`;
    } else if (action === 'update') {
      const params = new URLSearchParams({ valueInputOption: 'USER_ENTERED' });
      if (apiKey) params.append('key', apiKey);
      url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${params.toString()}`;
      method = 'PUT';
      fetchBody = JSON.stringify({ values });
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: fetchBody
    });

    const text = await res.text();
    if (!text) return { ok: true, data: {} };

    try {
      const data = JSON.parse(text);
      if (!res.ok) {
        return { ok: false, error: data.error?.message || 'Sheets API Fehler', status: res.status };
      }
      return { ok: true, data };
    } catch (e) {
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
      return { ok: true, data: {} };
    }
  } catch (e) {
    return { ok: false, error: `Verbindung zu Google fehlgeschlagen: ${e.message}` };
  }
}

function buildGoogleAuthUrl(clientId, serverClientId) {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('redirect_uri', window.location.origin + window.location.pathname);
  params.append('scope', SCOPES);
  params.append('include_granted_scopes', 'true');
  params.append('state', 'kosmos_auth');

  if (serverClientId) { // If serverClientId is provided, assume managed flow
    params.append('response_type', 'code');
    params.append('access_type', 'offline');
  } else { // Otherwise, implicit flow
    params.append('response_type', 'token');
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// --- COMPONENTS ---

const Card = React.forwardRef(function Card({ children, className = "", onClick, style, status, ...props }, ref) {
  const statusClass = STATUS_COLORS[status] || 'border-slate-200 bg-white';
  return (
    <div
      ref={ref}
      onClick={onClick}
      style={style}
      className={`rounded-lg shadow-sm border-l-4 p-2 overflow-hidden transition-all ${statusClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

function SessionCardContent({ session, onClick, onToggleLock, isLocked, hasConflict, conflictTooltip, listeners, attributes, isDimmed }) {
  const formatColor = FORMAT_COLORS[session.format] || 'bg-slate-100 text-slate-700';
  const [activeOverlay, setActiveOverlay] = useState(null);

  const handleMouseLeaveCard = () => {
    setActiveOverlay(null);
  };

  return (
    <Card
      status={session.status}
      className={`h-full flex flex-col relative group hover:shadow-md select-none transition-opacity duration-300
        ${isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-grab active:cursor-grabbing'}
        ${isDimmed ? 'opacity-20 grayscale' : 'opacity-100'}
      `}
      onClick={(e) => onClick(session)}
      onMouseLeave={handleMouseLeaveCard}
      {...listeners}
      {...attributes}
    >
      {/* Full Card Overlays */}
      {activeOverlay === 'conflict' && (
        <div className="absolute inset-0 bg-red-600/95 z-50 p-3 text-white flex flex-col justify-center items-center text-center backdrop-blur-sm rounded-r animate-in fade-in duration-200">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <span className="font-bold underline mb-1 text-xs">Achtung</span>
          <span className="text-[10px] leading-tight whitespace-pre-wrap">{conflictTooltip}</span>
        </div>
      )}

      {activeOverlay === 'notes' && session.notes && (
        <div className="absolute inset-0 bg-slate-800/95 z-50 p-3 text-white flex flex-col justify-start items-start text-left backdrop-blur-sm rounded-r animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 border-b border-slate-600 w-full pb-1 mb-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-xs">Notizen</span>
          </div>
          <span className="text-[11px] leading-snug whitespace-pre-wrap">{session.notes}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-1">
        <div className="flex flex-col overflow-hidden">
          <span className="font-mono text-[10px] font-bold text-slate-500 leading-none mb-1">
            {session.stage === INBOX_ID ? `${session.duration} min` : `${session.start} - ${session.end}`}
          </span>
          <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded w-fit ${formatColor}`}>
            {session.format}
          </span>
        </div>

        <div className="flex gap-1 shrink-0 z-10 items-center">
          {hasConflict && (
            <div
              className="text-red-500 mr-1 cursor-help hover:scale-110 transition-transform"
              onMouseEnter={() => setActiveOverlay('conflict')}
            >
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleLock(session); }}
            className={`p-1 rounded hover:bg-black/5 transition-colors ${isLocked ? 'text-red-500' : 'text-slate-300 hover:text-slate-500'}`}
            title={isLocked ? "Entsperren" : "Fixieren"}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="font-bold text-xs leading-snug mb-1 text-slate-800 line-clamp-2" title={session.title}>
        {session.title || 'Unbenannt'}
      </div>

      {/* People & Details */}
      <div className="mt-auto space-y-1">
        {session.speakers && (
          <div className="text-[10px] text-slate-600 flex flex-wrap items-center gap-1 leading-tight mb-1" title={`Speaker: ${session.speakers}`}>
            <Users className="w-3 h-3 shrink-0 text-indigo-500 mr-0.5" />
            {session.speakers.split(',').map((sp, i) => (
              <span key={i} className="after:content-[','] last:after:content-[''] mr-0.5">{sp.trim()}</span>
            ))}
          </div>
        )}
        {session.moderators && (
          <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1 leading-tight" title={`Mod: ${session.moderators}`}>
            <Mic2 className="w-3 h-3 shrink-0 text-pink-500 mr-0.5" />
            {session.moderators.split(',').map((mod, i) => (
              <span key={i} className="after:content-[','] last:after:content-[''] mr-0.5">{mod.trim()}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-[9px] text-slate-400 pt-1 border-t border-black/5 mt-1">
          <span className="font-mono text-slate-300 text-[8px]">{session.id}</span>
          {session.language && <span className="flex items-center gap-0.5 ml-auto font-bold text-slate-500">{session.language.toUpperCase()}</span>}
          {session.partner === 'TRUE' && <span className="flex items-center gap-0.5 truncate text-blue-600 font-bold bg-blue-50 px-1 rounded border border-blue-100"><Flag className="w-2.5 h-2.5" /> Partner</span>}
          {session.notes && (
            <div
              className="ml-1 text-blue-500 cursor-help"
              onMouseEnter={() => setActiveOverlay('notes')}
            >
              <MessageSquare className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

function DroppableStage({ id, children, className }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
};

function DraggableTimelineItem({ session, onClick, style, onToggleLock, hasConflict, conflictTooltip, isDimmed }) {
  const isLocked = session.status === 'Fixiert';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: session.id,
    data: session,
    disabled: isLocked
  });

  const baseStyle = {
    ...style,
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
    zIndex: isDragging ? 50 : 10
  };

  return (
    <div ref={setNodeRef} style={baseStyle} className={`absolute w-full px-1 ${isLocked ? 'z-0' : ''}`}>
      <SessionCardContent
        session={session} onClick={onClick} onToggleLock={onToggleLock} isLocked={isLocked}
        hasConflict={hasConflict} conflictTooltip={conflictTooltip}
        listeners={listeners} attributes={attributes}
        isDimmed={isDimmed}
      />
    </div>
  );
};

function SortableInboxItem({ session, onClick, onToggleLock, hasConflict, conflictTooltip, isDimmed }) {
  const isLocked = session.status === 'Fixiert';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: session.id, data: session, disabled: isLocked
  });

  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.3 : 1, touchAction: 'none' };

  return (
    <div ref={setNodeRef} style={style} className="w-[240px] mb-2 shrink-0">
      <SessionCardContent
        session={session} onClick={onClick} onToggleLock={onToggleLock} isLocked={isLocked}
        hasConflict={hasConflict} conflictTooltip={conflictTooltip}
        listeners={listeners} attributes={attributes}
        isDimmed={isDimmed}
      />
    </div>
  );
};

function StageColumn({ stage, children, height }) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: 'stage', name: stage.name }
  });

  return (
    <div ref={setNodeRef} style={{ height: height + HEADER_HEIGHT }} className={`min-w-[280px] w-full max-w-[320px] border-r border-slate-200 relative transition-colors ${isOver ? 'bg-blue-50/30' : 'bg-white/30 odd:bg-slate-50/50'}`}>
      <div className="bg-white/95 backdrop-blur border-b border-slate-200 p-2 text-center z-20 shadow-sm flex flex-col justify-center" style={{ height: HEADER_HEIGHT }}>
        <div className="font-bold text-slate-700 text-sm truncate">{stage.name}</div>
        <div className="flex justify-center gap-3 text-[10px] text-slate-400 font-mono mt-0.5">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {stage.capacity}</span>
          <span className="flex items-center gap-1"><Mic2 className="w-3 h-3" /> {stage.maxMics || '?'}</span>
        </div>
      </div>
      <div className="absolute w-full bottom-0 z-0" style={{ top: HEADER_HEIGHT, height: height }}>
        <div className="absolute inset-0 z-10">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- APP COMPONENT ---

const parsePlannerBatch = (batch, config) => {
  const valRanges = batch.valueRanges;
  if (!valRanges || valRanges.length < 3) return { speakers: [], moderators: [], stages: [], program: [] };

  const allowedSpeakerStatus = ['zusage', 'interess', 'angefragt', 'eingeladen', 'vorschlag'];
  const sp = (valRanges[0].values || []).filter(r => {
    const s = safeString(r[0]).toLowerCase();
    return allowedSpeakerStatus.some(k => s.includes(k));
  }).map((r, i) => ({
    id: `sp-${i}`,
    fullName: `${safeString(r[2])} ${safeString(r[3])}`.trim(),
    status: safeString(r[0]),
    pronoun: safeString(r[4]),
    email: safeString(r[8])
  }));

  const mo = (valRanges[1].values || []).filter(r => r[0]).map((r, i) => ({ id: `mod-${i}`, fullName: safeString(r[1]), status: safeString(r[0]) }));

  const st = (valRanges[2].values || [])
    .map((r, i) => ({
      id: safeString(r[0]) || `st-${i}`,
      name: safeString(r[1]),
      capacity: safeString(r[2]),
      maxMics: parseInt(r[4]) || 4
    }))
    .filter(s => s.name && s.name.toLowerCase() !== 'inbox');

  if (st.length === 0) st.push({ id: 'main', name: 'Main Stage', capacity: 200, maxMics: 4 });

  let pr = [];
  if (valRanges[3] && valRanges[3].values) {
    pr = valRanges[3].values
      .filter(r => safeString(r[0]) || safeString(r[1])) // Skip completely empty rows
      .map((r, i) => {
        const dur = parseInt(r[8]) || 60;
        const start = safeString(r[6]) || '-';
        const rawStage = safeString(r[5]);
        let stage = INBOX_ID;

        if (rawStage) {
          const matchById = st.find(s => s.id === rawStage);
          if (matchById) {
            stage = matchById.id;
          } else {
            const matchByName = st.find(s => s.name === rawStage);
            if (matchByName) {
              stage = matchByName.id;
            }
          }
        }

        const rawId = safeString(r[0]);
        const id = (rawId && rawId.length > 1) ? rawId : generateId();

        return {
          id: id,
          title: safeString(r[1]),
          status: safeString(r[2]) || '5_Vorschlag',
          partner: (safeString(r[3]) === 'TRUE' || safeString(r[3]) === 'P') ? 'TRUE' : 'FALSE',
          format: safeString(r[4]) || 'Talk',
          stage: stage,
          start: start,
          duration: dur,
          end: calculateEndTime(start, dur),
          speakers: safeString(r[9]),
          moderators: safeString(r[10]),
          language: safeString(r[11]),
          notes: safeString(r[12]), // Internal curation notes
          stageDispo: safeString(r[13]),
          shortDescription: safeString(r[14]), // New: Kurzbeschreibung
          description: safeString(r[15])        // New: Beschreibung
        };
      });
  }

  return { speakers: sp, moderators: mo, stages: st, program: pr };
};
function App({ authenticatedUser }) {
  const [data, setData] = useState({ speakers: [], moderators: [], program: [], stages: [] });
  const [status, setStatus] = useState({ loading: false, error: null });

  // Simplified config - no more complex auth initialization
  const [config, setConfig] = useState({
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
    spreadsheetId: localStorage.getItem('kosmos_spreadsheet_id') || import.meta.env.VITE_SPREADSHEET_ID || '',
    sheetNameProgram: localStorage.getItem('kosmos_sheet_program') || 'Programm_Export',
    sheetNameSpeakers: localStorage.getItem('kosmos_sheet_speakers') || '26_Kosmos_SprecherInnen',
    sheetNameMods: localStorage.getItem('kosmos_sheet_mods') || '26_Kosmos_Moderation',
    sheetNameStages: localStorage.getItem('kosmos_sheet_stages') || 'Bühnen_Import',
    curationApiUrl: localStorage.getItem('kosmos_curation_api_url') || '',
    n8nBaseUrl: localStorage.getItem('kosmos_n8nBaseUrl') || '',
    startHour: parseInt(localStorage.getItem('kosmos_start_hour')) || 9,
    endHour: parseInt(localStorage.getItem('kosmos_end_hour')) || 22,
    bufferMin: parseInt(localStorage.getItem('kosmos_buffer_min')) || 5
  });

  const [viewMode, setViewMode] = useState('PLANNER'); // 'PLANNER' or 'CURATION'
  const [curationData, setCurationData] = useState({
    sessions: [],
    users: [
      { email: 'viva@kosmos-festival.de', role: 'ADMIN' },
      { email: 'enrique@kosmos-festival.de', role: 'ADMIN' },
      { email: 'curator@kosmos-festival.de', role: 'CURATOR' }
    ],
    metadata: { bereiche: [], themen: [], tags: [], formate: [] },
    userRole: authenticatedUser?.role || 'GUEST'
  });

  const [activeDragItem, setActiveDragItem] = useState(null);
  const [ghostPosition, setGhostPosition] = useState(null);
  const [toast, setToast] = useState(null);

  const [localChanges, setLocalChanges] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Auth state is now simplified - user is already authenticated
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Always true since AuthGate handles this
  const [accessToken, setAccessToken] = useState(authenticatedUser.accessToken);
  const [userProfile] = useState({
    email: authenticatedUser.email,
    name: authenticatedUser.name,
    picture: authenticatedUser.picture
  });

  // Mobile & Sidebar state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [isInboxCollapsed, setIsInboxCollapsed] = useState(false);
  const [inboxSortBy, setInboxSortBy] = useState('DEFAULT'); // 'DEFAULT', 'TITLE', 'DURATION', 'SCORE'

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      // Auto-collapse sidebar when switching to mobile
      if (mobile) setIsSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const timelineHeight = (config.endHour - config.startHour) * 60 * PIXELS_PER_MINUTE;

  // --- LOCAL STORAGE BACKUP ---
  useEffect(() => {
    const savedData = localStorage.getItem('kosmos_local_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.program && parsed.program.length > 0) {
          setData(parsed);
          setLocalChanges(true);
        }
      } catch (e) { console.error("Local load failed", e); }
    }
  }, []);

  useEffect(() => {
    if (data.program.length > 0) {
      localStorage.setItem('kosmos_local_data', JSON.stringify(data));
    }
  }, [data]);

  // --- ANALYTICS ---
  const analysis = useMemo(() => {
    const genderCounts = { m: 0, w: 0, d: 0, u: 0 };
    const langCounts = { de: 0, en: 0, other: 0 };
    let partnerSessions = 0;
    let totalPlacedSessions = 0;

    // Stage occupancy tracking
    const stageMinutesUsed = {};
    data.stages.forEach(st => stageMinutesUsed[st.id] = 0);
    const totalPossibleMinutes = (config.endHour - config.startHour) * 60;

    data.program.forEach(s => {
      if (s.stage !== INBOX_ID && s.start !== '-') {
        totalPlacedSessions++;
        if (s.partner === 'TRUE') partnerSessions++;

        // Track occupancy
        if (stageMinutesUsed[s.stage] !== undefined) {
          stageMinutesUsed[s.stage] += (s.duration || 60);
        }

        const lang = (s.language || '').toLowerCase();
        if (lang === 'de') langCounts.de++;
        else if (lang === 'en') langCounts.en++;
        else langCounts.other++;

        const sList = s.speakers ? (Array.isArray(s.speakers) ? s.speakers : s.speakers.split(',').map(n => n.trim()).filter(Boolean)) : [];
        const mList = s.moderators ? (Array.isArray(s.moderators) ? s.moderators : s.moderators.split(',').map(n => n.trim()).filter(Boolean)) : [];

        [...sList, ...mList].forEach(name => {
          let personObj = data.speakers.find(dbSp => dbSp.fullName.toLowerCase() === name.toLowerCase());
          if (!personObj) personObj = data.moderators.find(dbMod => dbMod.fullName.toLowerCase() === name.toLowerCase());

          if (personObj) {
            const p = (personObj.pronoun || '').toLowerCase();
            if (p.includes('männ') || p.includes('man') || p.includes('he')) genderCounts.m++;
            else if (p.includes('weib') || p.includes('frau') || p.includes('she')) genderCounts.w++;
            else if (p.includes('div') || p.includes('non')) genderCounts.d++;
            else genderCounts.u++;
          } else {
            genderCounts.u++;
          }
        });
      }
    });

    // Calculate stage occupancy average
    const totalStages = data.stages.length;
    const occupancyPercent = totalStages > 0
      ? Math.round((Object.values(stageMinutesUsed).reduce((a, b) => a + b, 0) / (totalStages * totalPossibleMinutes)) * 100)
      : 0;

    return {
      genderCounts,
      langCounts,
      partnerPercent: totalPlacedSessions ? Math.round((partnerSessions / totalPlacedSessions) * 100) : 0,
      totalPlaced: totalPlacedSessions,
      occupancyPercent
    };
  }, [data.program, data.speakers, data.moderators, data.stages, config.startHour, config.endHour]);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const lowerQ = searchQuery.toLowerCase();
    return data.program.filter(s => {
      return (
        safeString(s.title).toLowerCase().includes(lowerQ) ||
        safeString(s.id).toLowerCase().includes(lowerQ) ||
        safeString(s.speakers).toLowerCase().includes(lowerQ) ||
        safeString(s.moderators).toLowerCase().includes(lowerQ)
      );
    }).map(s => s.id);
  }, [searchQuery, data.program]);

  const filteredAndSortedInbox = useMemo(() => {
    let items = data.program.filter(p => p.stage === INBOX_ID);

    // Apply Search Filter (same logic as timeline highlighting)
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      items = items.filter(s =>
        safeString(s.title).toLowerCase().includes(lowerQ) ||
        safeString(s.id).toLowerCase().includes(lowerQ) ||
        safeString(s.speakers).toLowerCase().includes(lowerQ) ||
        safeString(s.moderators).toLowerCase().includes(lowerQ)
      );
    }

    // Apply Sorting
    items.sort((a, b) => {
      if (inboxSortBy === 'TITLE') return safeString(a.title).localeCompare(safeString(b.title));
      if (inboxSortBy === 'DURATION') return (b.duration || 0) - (a.duration || 0);
      if (inboxSortBy === 'SCORE') {
        const scoreA = parseFloat(curationData.sessions.find(s => s.id === a.id)?.average_score || 0);
        const scoreB = parseFloat(curationData.sessions.find(s => s.id === b.id)?.average_score || 0);
        return scoreB - scoreA;
      }
      return 0; // DEFAULT
    });

    return items;
  }, [data.program, searchQuery, inboxSortBy, curationData.sessions]);

  // --- CONFLICTS ---
  const sessionConflicts = useMemo(() => {
    const usage = {};
    const conflicts = {};

    data.program.forEach(s => {
      if (s.stage === INBOX_ID || s.start === '-') return;

      const sStart = timeToMinutes(s.start);
      const sEnd = sStart + s.duration;

      const sStr = safeString(s.speakers);
      const mStr = safeString(s.moderators);
      const peopleList = [
        ...(sStr ? sStr.split(',').map(n => n.trim()).filter(Boolean) : []),
        ...(mStr ? mStr.split(',').map(n => n.trim()).filter(Boolean) : [])
      ];

      peopleList.forEach(sp => {
        if (!usage[sp]) usage[sp] = [];

        usage[sp].forEach(existing => {
          if (checkOverlap(sStart, sEnd, existing.start, existing.end, 0)) {
            if (!conflicts[s.id]) conflicts[s.id] = [];
            if (!conflicts[existing.id]) conflicts[existing.id] = [];

            const msg = `Termin: "${sp}" ist auch in "${existing.title}"`;
            const msgRev = `Termin: "${sp}" ist auch in "${s.title}"`;

            if (!conflicts[s.id].includes(msg)) conflicts[s.id].push(msg);
            if (!conflicts[existing.id].includes(msgRev)) conflicts[existing.id].push(msgRev);
          }
        });
        usage[sp].push({ id: s.id, title: s.title, start: sStart, end: sEnd });
      });
    });

    const confirmedSessionStatus = ['1_Zusage', 'Akzeptiert', 'Fixiert'];
    const confirmedSpeakerStatus = ['zusage'];

    data.program.forEach(s => {
      if (confirmedSessionStatus.includes(s.status)) {
        const sList = safeString(s.speakers).split(',').map(n => n.trim()).filter(Boolean);
        sList.forEach(name => {
          const spObj = data.speakers.find(dbSp => dbSp.fullName.toLowerCase() === name.toLowerCase());
          if (spObj) {
            const statusLower = (spObj.status || '').toLowerCase();
            const isConfirmed = confirmedSpeakerStatus.some(k => statusLower.includes(k));
            if (!isConfirmed) {
              if (!conflicts[s.id]) conflicts[s.id] = [];
              const msg = `Status: Session ist bestätigt, aber Sprecher "${name}" hat Status: "${spObj.status}"`;
              if (!conflicts[s.id].includes(msg)) conflicts[s.id].push(msg);
            }
          }
        });
      }
    });

    return conflicts;
  }, [data.program, data.speakers]);

  // Ref to gate loading frequency and prevent loops
  const lastLoadRef = React.useRef(0);

  // Simplified data loading function - uses authenticatedUser.accessToken directly
  // importProgram: if true, also fetches and overwrites the timeline data
  const loadData = useCallback(async (options = {}) => {
    const { manual = false, importProgram = false } = options;
    if (import.meta.env.DEV) console.log('[loadData] Invoked!', { manual, importProgram, timestamp: new Date().toLocaleTimeString() });
    if (!config.spreadsheetId) return;

    // Rate limit: prevent reloading more than once every 2 seconds unless manual
    const now = Date.now();
    if (!manual && now - lastLoadRef.current < 2000) return;
    lastLoadRef.current = now;

    setStatus({ loading: true, error: null });
    try {
      // Use the access token from AuthGate
      const token = authenticatedUser.accessToken;

      // If curationApiUrl is set, we fetch from there first for the program data
      if (config.curationApiUrl) {
        try {
          const emailParam = authenticatedUser.email ? `&email=${encodeURIComponent(authenticatedUser.email)}` : '';
          const res = await fetch(`${config.curationApiUrl}${config.curationApiUrl.includes('?') ? '&' : '?'}includePlanner=true${emailParam}`);
          if (res.ok) {
            const result = await res.json();
            // Deep merge to ensure all metadata keys exist
            setCurationData(prev => ({
              ...prev,
              ...result,
              metadata: {
                ...prev.metadata,
                ...(result.metadata || {})
              }
            }));

            // If the curation API also provided planner data, we use it!
            if (result.plannerData) {
              const pData = result.plannerData;
              const valRanges = [
                { values: pData.speakers?.values || [] },
                { values: pData.mods?.values || [] },
                { values: pData.stages?.values || [] },
                { values: pData.program?.values || [] }
              ];

              // Call the internal parsing logic (which we'll extract or replicate)
              const parsed = parsePlannerBatch({ valueRanges: valRanges }, config);
              setData(parsed);
              setStatus({ loading: false, error: null });
              return; // Done! No need for secondary fetch
            }
          }
        } catch (e) {
          console.warn("Could not fetch from Curation API:", e);
        }
      }

      const ranges = [
        `'${config.sheetNameSpeakers}'!A2:I`,
        `'${config.sheetNameMods}'!A2:C`,
        `'${config.sheetNameStages}'!A2:H`
      ];

      if (importProgram) {
        ranges.push(`'${config.sheetNameProgram}'!A2:P`);
      }

      if (import.meta.env.DEV) console.log('[loadData] Final ranges to fetch:', ranges);

      const { ok, data: batch, error, status: resStatus } = await fetchSheets({
        action: 'batchGet',
        spreadsheetId: config.spreadsheetId,
        ranges: ranges
      }, token);

      if (import.meta.env.DEV) console.log('[loadData] Result:', { ok, rangeCount: batch?.valueRanges?.length, error });

      if (!ok) {
        if (resStatus === 401 || resStatus === 403) {
          clearAuth();
          setIsAuthenticated(false);
          setAccessToken(null);
          setStatus({ loading: false, error: "Zugriff verweigert. Bitte erneut einloggen." });
          return;
        }
        throw new Error(error || 'Sheets API Fehler');
      }

      const parsed = parsePlannerBatch(batch, config);

      setData(prev => {
        const newData = { ...prev, ...parsed };
        // Only overwrite program if it was actually imported
        if (importProgram && parsed.program.length > 0) {
          newData.program = parsed.program;
        } else {
          // Keep existing program if not importing
          newData.program = prev.program;
        }
        return newData;
      });

      setStatus({ loading: false, error: null });
      if (importProgram && parsed.program.length > 0) setLocalChanges(false);

      if (manual) {
        const msg = importProgram ? "Programm & Stammdaten importiert!" : "Stammdaten (Sprecher/Bühnen) aktualisiert!";
        setToast({ msg, type: "success" });
        setTimeout(() => setToast(null), 3000);
      }

    } catch (e) {
      console.error(e);
      setStatus({ loading: false, error: getErrorMessage(e) });
    }
  }, [authenticatedUser.accessToken, config.spreadsheetId, config.sheetNameSpeakers, config.sheetNameMods, config.sheetNameProgram, config.sheetNameStages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load data when app mounts
  useEffect(() => {
    if (config.spreadsheetId) {
      loadData({ manual: false, importProgram: true }); // Load everything on mount
    }
  }, [config.spreadsheetId, loadData]);

  // Fetch curation data whenever switching to curation view if not already loaded
  useEffect(() => {
    if (viewMode === 'CURATION' && curationData.sessions.length === 0 && config.curationApiUrl) {
      loadData({ manual: false });
    }
  }, [viewMode, config.curationApiUrl, curationData.sessions.length, loadData]);

  const handleLogout = () => {
    // Clear all auth data and reload to show AuthGate
    localStorage.removeItem('kosmos_local_data');
    localStorage.removeItem('kosmos_user_session');
    window.location.reload();
  };

  const generateMockCurationData = () => {
    const mockSessions = [
      { id: 'MOCK-1', timestamp: new Date().toISOString(), title: 'Modern Dance Performance', description: 'A bold new vision for contemporary movement.', format: 'Performance', thema: 'Kultur', bereich: 'Bühne', status: 'Vorschlag', average_score: '4.5', review_count: 3 },
      { id: 'MOCK-2', timestamp: new Date().toISOString(), title: 'AI in Music Workshop', description: 'Learn how to use AI to compose your next hit.', format: 'Workshop', thema: 'Technologie', bereich: 'Innovation', status: 'Vorschlag', average_score: '3.8', review_count: 5 },
      { id: 'MOCK-3', timestamp: new Date().toISOString(), title: 'Climate Justice Talk', description: 'Discussion on intersectional environmentalism.', format: 'Talk', thema: 'Nachhaltigkeit', bereich: 'Politik', status: 'Vorschlag', average_score: '4.9', review_count: 8 },
      { id: 'MOCK-4', timestamp: new Date().toISOString(), title: 'Late Night Jam Session', description: 'Open mic for everyone.', format: 'Performance', thema: 'Musik', bereich: 'Bühne', status: 'Akzeptiert', average_score: '4.2', review_count: 2 },
      { id: 'MOCK-5', timestamp: new Date().toISOString(), title: 'Zen Meditation', description: 'Morning mindfulness.', format: 'Workshop', thema: 'Wellness', bereich: 'Health', status: 'Vorschlag', average_score: '3.0', review_count: 1 }
    ];

    setCurationData({
      sessions: mockSessions,
      metadata: {
        bereiche: ['Bühne', 'Innovation', 'Politik', 'Health'],
        themen: ['Kultur', 'Technologie', 'Nachhaltigkeit', 'Musik', 'Wellness'],
        tags: ['Live', 'Interactive', 'Panel'],
        formate: ['Talk', 'Workshop', 'Performance']
      },
      userRole: 'ADMIN'
    });

    // Also add them to the planner as "Vorschlag" so they show in the inbox
    const newProgramItems = mockSessions.map(s => ({
      id: s.id,
      title: s.title,
      status: '5_Vorschlag',
      format: s.format,
      stage: INBOX_ID,
      start: '-',
      duration: 60,
      end: '-',
      speakers: 'Mock Speaker',
      notes: s.description
    }));

    setData(prev => ({
      ...prev,
      program: [...prev.program.filter(p => !p.id.startsWith('MOCK-')), ...newProgramItems]
    }));

    setToast({ msg: "Mock-Daten geladen!", type: "success" });
    setTimeout(() => setToast(null), 3000);
  };

  // --- CURATION ACTIONS ---
  const handleUpdateCurationStatus = async (sessionId, newStatus) => {
    if (!config.curationApiUrl) {
      setToast({ msg: "Keine Curation API URL konfiguriert!", type: "error" });
      return;
    }

    try {
      // Optimistic Update
      setCurationData(prev => prev.map(s => s.id === sessionId ? { ...s, status: newStatus } : s));

      const res = await fetch(config.curationApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateStatus',
          id: sessionId,
          status: newStatus,
          email: authenticatedUser.email
        })
      });

      if (res.ok) {
        setToast({ msg: `Status für ${sessionId} auf "${newStatus}" gesetzt.`, type: "success" });
      } else {
        throw new Error("API Fehler");
      }
    } catch (e) {
      console.error(e);
      setToast({ msg: "Status konnte nicht synchronisiert werden.", type: "error" });
    }
  };

  const handleUpdateCurationMetadata = async (sessionId, field, newValue) => {
    if (!config.curationApiUrl) return;

    try {
      // Optimistic locally
      setCurationData(prev => ({
        ...prev,
        sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, [field]: newValue } : s)
      }));

      const res = await fetch(config.curationApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateMetadata',
          id: sessionId,
          field: field,
          value: newValue,
          email: authenticatedUser.email
        })
      });

      if (!res.ok) throw new Error("Sync Fehler");
      setToast({ msg: `${field} aktualisiert & synchronisiert.`, type: "success" });
    } catch (e) {
      console.error("Fehler beim Metadata-Update:", e);
      setToast({ msg: "Synchronisierung fehlgeschlagen.", type: "error" });
    }
  };

  // --- MAIL MERGE EXPORT ---
  const handleExportMailMerge = () => {
    const personMap = {};

    data.program.forEach(s => {
      if (s.stage === INBOX_ID || s.start === '-') return;

      const stageName = data.stages.find(st => st.id === s.stage)?.name || s.stage;
      const sList = safeString(s.speakers).split(',').map(n => n.trim()).filter(Boolean);
      const mList = safeString(s.moderators).split(',').map(n => n.trim()).filter(Boolean);
      const allPeople = [...new Set([...sList, ...mList])];

      allPeople.forEach(name => {
        if (!personMap[name]) {
          const spObj = data.speakers.find(dbSp => dbSp.fullName.toLowerCase() === name.toLowerCase());
          const email = spObj?.email || '';

          personMap[name] = {
            name: name,
            email: email,
            sessions: []
          };
        }
        personMap[name].sessions.push({
          title: cleanForCSV(s.title),
          start: s.start,
          end: s.end,
          stage: cleanForCSV(stageName),
          format: s.format,
          role: sList.includes(name) ? 'Speaker' : 'Moderator',
          status: s.status
        });
      });
    });

    const MAX_SESSIONS = 5;
    let csvContent = "Name,Email";
    for (let i = 1; i <= MAX_SESSIONS; i++) {
      csvContent += `,S${i}_Titel,S${i}_Zeit,S${i}_Bühne,S${i}_Status,S${i}_Rolle`;
    }
    csvContent += "\n";

    Object.values(personMap).forEach(p => {
      let row = `${cleanForCSV(p.name)},${cleanForCSV(p.email)}`;
      const sessions = p.sessions.slice(0, MAX_SESSIONS);
      sessions.forEach(s => {
        row += `,${s.title},${s.start}-${s.end},${s.stage},${s.status},${s.role}`;
      });
      for (let i = sessions.length; i < MAX_SESSIONS; i++) {
        row += ",,,,,";
      }
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mail_merge_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSync = async () => {
    setStatus({ loading: true, error: null });
    try {
      // Use the access token from AuthGate
      const token = authenticatedUser.accessToken;

      const rows = data.program.map(p => {
        const speakersStr = Array.isArray(p.speakers) ? p.speakers.join(', ') : (p.speakers || '');
        const modsStr = Array.isArray(p.moderators) ? p.moderators.join(', ') : (p.moderators || '');

        return [
          safeString(p.id),
          safeString(p.title),
          safeString(p.status),
          p.partner === 'TRUE' ? 'TRUE' : 'FALSE',
          safeString(p.format),
          p.stage === INBOX_ID ? '' : safeString(p.stage),
          p.start === '-' ? '' : p.start,
          p.start === '-' ? '' : calculateEndTime(p.start, p.duration),
          p.duration || 60,
          speakersStr,
          modsStr,
          safeString(p.language),
          safeString(p.notes),
          safeString(p.stageDispo),
          safeString(p.shortDescription),
          safeString(p.description)
        ];
      });

      const { ok, data: result, error } = await fetchSheets({
        action: 'update',
        spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameProgram}'!A2:P`,
        values: rows,
      }, token);

      if (!ok) {
        throw new Error(error || 'Sheets API Fehler');
      }

      setStatus({ loading: false, error: null });
      setLocalChanges(false);
      setToast({ msg: `${result.updatedCells || 0} Zellen gespeichert!`, type: "success" });
      setTimeout(() => setToast(null), 3000);

    } catch (e) {
      console.error(e);
      setStatus({ loading: false, error: getErrorMessage(e) });
    }
  };

  // --- DRAG LOGIC ---
  const handleDragStart = (event) => {
    setActiveDragItem(event.active.data.current);
  };

  const handleDragMove = (event) => {
    const { over, delta } = event;
    if (!over || !activeDragItem) {
      setGhostPosition(null);
      return;
    }

    const stageId = over.id;
    if (stageId === INBOX_ID) {
      setGhostPosition(null);
      return;
    }

    let currentStartMinutes;
    if (activeDragItem.stage === INBOX_ID || activeDragItem.start === '-') {
      currentStartMinutes = (config.startHour * 60) + (delta.y / PIXELS_PER_MINUTE);
    } else {
      const originalMinutes = timeToMinutes(activeDragItem.start);
      currentStartMinutes = originalMinutes + (delta.y / PIXELS_PER_MINUTE);
    }

    const snappedMinutes = Math.round(currentStartMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    const clampedMinutes = Math.max(config.startHour * 60, Math.min(config.endHour * 60 - activeDragItem.duration, snappedMinutes));

    const topPx = (clampedMinutes - (config.startHour * 60)) * PIXELS_PER_MINUTE;
    const heightPx = activeDragItem.duration * PIXELS_PER_MINUTE;

    const ghostStart = clampedMinutes;
    const ghostEnd = clampedMinutes + activeDragItem.duration;
    const hasOverlap = data.program.some(p =>
      p.id !== activeDragItem.id &&
      p.stage === stageId &&
      p.stage !== INBOX_ID &&
      checkOverlap(ghostStart, ghostEnd, timeToMinutes(p.start), timeToMinutes(p.start) + p.duration, config.bufferMin)
    );

    setGhostPosition({
      stageId: stageId,
      top: topPx,
      height: heightPx,
      timeLabel: minutesToTime(clampedMinutes),
      hasOverlap
    });
  };

  const handleDragEnd = (event) => {
    const { active, over, delta } = event;
    setActiveDragItem(null);
    setGhostPosition(null);

    if (!over) return;
    const targetStageId = over.id;
    const session = active.data.current;

    if (targetStageId === INBOX_ID) {
      if (session.stage !== INBOX_ID) {
        updateSession(session.id, { stage: INBOX_ID, start: '-' });
      }
      return;
    }

    let newStartMinutes;
    if (session.stage === INBOX_ID || session.start === '-') {
      if (ghostPosition) newStartMinutes = timeToMinutes(ghostPosition.timeLabel);
      else newStartMinutes = config.startHour * 60 + 60;
    } else {
      const originalMinutes = timeToMinutes(session.start);
      const rawNewMinutes = originalMinutes + (delta.y / PIXELS_PER_MINUTE);
      newStartMinutes = Math.round(rawNewMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    }

    newStartMinutes = Math.max(config.startHour * 60, Math.min(config.endHour * 60 - session.duration, newStartMinutes));
    const newEndMinutes = newStartMinutes + session.duration;

    const collisions = data.program.filter(p =>
      p.id !== session.id &&
      p.stage === targetStageId &&
      p.stage !== INBOX_ID &&
      checkOverlap(newStartMinutes, newEndMinutes, timeToMinutes(p.start), timeToMinutes(p.start) + p.duration, config.bufferMin)
    );

    if (collisions.length > 0) {
      if (collisions.some(c => c.status === 'Fixiert')) {
        setToast({ msg: "Konflikt mit fixierter Session!", type: "error" });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      const swapCandidate = collisions.find(c => c.duration === session.duration);
      if (swapCandidate && collisions.length === 1) {
        setData(prev => {
          const newProg = prev.program.map(p => {
            if (p.id === session.id) return { ...p, stage: targetStageId, start: minutesToTime(newStartMinutes), end: calculateEndTime(minutesToTime(newStartMinutes), p.duration) };
            if (p.id === swapCandidate.id) return { ...p, stage: session.stage, start: session.start, end: session.end };
            return p;
          });
          return { ...prev, program: newProg };
        });
        setLocalChanges(true);
        return;
      }

      const collisionIds = collisions.map(c => c.id);
      setData(prev => {
        const newProg = prev.program.map(p => {
          if (p.id === session.id) {
            return { ...p, stage: targetStageId, start: minutesToTime(newStartMinutes), end: calculateEndTime(minutesToTime(newStartMinutes), p.duration) };
          }
          if (collisionIds.includes(p.id)) {
            return { ...p, stage: INBOX_ID, start: '-' };
          }
          return p;
        });
        return { ...prev, program: newProg };
      });
      setLocalChanges(true);
      setToast({ msg: `${collisions.length} Session(s) verschoben.`, type: "info" });
      setTimeout(() => setToast(null), 3000);

    } else {
      const newTimeStr = minutesToTime(newStartMinutes);
      if (session.start !== newTimeStr || session.stage !== targetStageId) {
        updateSession(session.id, { stage: targetStageId, start: newTimeStr });
      }
    }
  };

  const updateSession = (id, updates) => {
    setData(prev => ({
      ...prev,
      program: prev.program.map(p => p.id === id ? { ...p, ...updates, end: calculateEndTime(updates.start || p.start, p.duration) } : p)
    }));
    setLocalChanges(true);
  };

  const getPos = (start, duration) => {
    if (!start || start === '-') return {};
    const min = timeToMinutes(start);
    const top = (min - (config.startHour * 60)) * PIXELS_PER_MINUTE;
    const height = duration * PIXELS_PER_MINUTE;
    return { top: `${Math.max(0, top)}px`, height: `${Math.max(20, height)}px` };
  };

  // --- ADMIN ACTIONS ---
  const handleUpdateUserRole = async (email, newRole) => {
    if (!config.curationApiUrl) return;
    try {
      const res = await fetch(config.curationApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateUserRole', email, role: newRole })
      });
      if (res.ok) {
        setToast({ msg: `Rolle für ${email} auf ${newRole} gesetzt.`, type: 'success' });
        loadData({ manual: true }); // Refresh to get updated user list
      }
    } catch (e) { console.error(e); }
  };

  const handleAddUser = async (email, role) => {
    if (!config.curationApiUrl) return;
    try {
      const res = await fetch(config.curationApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addUser', email, role })
      });
      if (res.ok) {
        setToast({ msg: `${email} als ${role} hinzugefügt.`, type: 'success' });
        loadData({ manual: true });
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteUser = async (email) => {
    if (!window.confirm(`Benutzer ${email} wirklich löschen?`)) return;
    if (!config.curationApiUrl) return;
    try {
      const res = await fetch(config.curationApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteUser', email })
      });
      if (res.ok) {
        setToast({ msg: `${email} gelöscht.`, type: 'success' });
        loadData({ manual: true });
      }
    } catch (e) { console.error(e); }
  };

  const handleSaveSession = (session, micWarning = '') => {
    const cleanWarning = micWarning ? micWarning.replace(/,/g, ' ') : '';
    const finalSession = {
      ...session,
      stageDispo: cleanWarning
    };

    let newProgram;
    if (editingSession && editingSession.id === session.id) {
      newProgram = data.program.map(p => p.id === session.id ? finalSession : p);
    } else {
      newProgram = [...data.program, { ...finalSession, id: generateId() }];
    }

    newProgram = newProgram.map(p => ({ ...p, end: calculateEndTime(p.start, p.duration) }));
    setData(prev => ({ ...prev, program: newProgram }));
    setLocalChanges(true);
    setIsModalOpen(false);
    setEditingSession(null);
  };

  const handleDeleteSession = (id) => {
    if (window.confirm("Löschen?")) {
      setData(prev => ({ ...prev, program: prev.program.filter(p => p.id !== id) }));
      setLocalChanges(true);
      setIsModalOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 font-sans overflow-hidden text-slate-900">
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg z-50 text-sm font-bold text-white
           ${toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* VIEW MODE CONTENT */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {viewMode === 'PLANNER' && (
          <div className="flex flex-col h-full overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center shrink-0 z-40 shadow-sm">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={`p-2 rounded-full transition-colors ${isSidebarOpen ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  <Layout className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {isMobile ? 'KOSMOS' : 'KOSMOS Planer'}
                  </h1>
                </div>
                {!isMobile && (
                  <div className="flex items-center gap-2 ml-4 flex-1 max-w-md">
                    <div className="relative w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Search sessions, speakers, IDs..."
                        className="w-full pl-9 pr-4 py-1.5 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {!isMobile && (
                  <button
                    onClick={() => { setEditingSession(null); setIsModalOpen(true); }}
                    className="ml-2 flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Create Session</span>
                  </button>
                )}
                <button
                  onClick={() => loadData({ manual: true, importProgram: true })}
                  disabled={status.loading}
                  className={`ml-2 flex items-center justify-center p-1.5 rounded transition-colors ${status.loading ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
                  title="Daten aktualisieren"
                >
                  <RefreshCw className={`w-5 h-5 ${status.loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportMailMerge}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-sm font-medium transition-all"
                  title="CSV Export für MailMerge"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={handleSync}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all ${localChanges ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md animate-pulse' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Speichern</span>
                </button>
                <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-slate-100 rounded text-slate-500">
                  <Settings className="w-4 h-4" />
                </button>
                <button onClick={handleLogout} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded text-sm flex gap-2 items-center transition-colors">
                  <LogOut className="w-3 h-3" /> Logout
                </button>
              </div>
            </header>

            {status.error && <div className="bg-red-50 text-red-600 p-2 text-xs text-center border-b border-red-200 font-bold">{status.error}</div>}

            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
              <div className="flex flex-1 overflow-hidden">
                <div className={`${isSidebarOpen ? 'w-64 border-r' : 'w-0 border-r-0'} bg-white flex flex-col shrink-0 z-30 transition-all duration-300 overflow-hidden`}>
                  <div className="p-4 border-b bg-slate-50/50">
                    <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><PieChart className="w-4 h-4" /> Analyse</h3>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="bg-white p-2 rounded border text-center text-xs font-bold">
                        <div className="text-indigo-600">{analysis.genderCounts.w}</div>
                        <div className="text-[8px] text-slate-400 uppercase">Frauen (W)</div>
                      </div>
                      <div className="bg-white p-2 rounded border text-center text-xs font-bold">
                        <div className="text-indigo-600">{analysis.genderCounts.m}</div>
                        <div className="text-[8px] text-slate-400 uppercase">Männer (M)</div>
                      </div>
                      <div className="bg-white p-2 rounded border text-center text-xs font-bold col-span-2">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[8px] text-slate-400 uppercase">Partner-Anteil:</span>
                          <span className="text-indigo-600">{analysis.partnerPercent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1 mt-1 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full" style={{ width: `${analysis.partnerPercent}%` }}></div>
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded border text-center text-xs font-bold col-span-2">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[8px] text-slate-400 uppercase">Bühnen-Belegung:</span>
                          <span className="text-indigo-600">{analysis.occupancyPercent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1 mt-1 rounded-full overflow-hidden">
                          <div className="bg-green-500 h-full" style={{ width: `${analysis.occupancyPercent}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase p-2 tracking-widest">SprecherInnen ({data.speakers.length})</div>
                    {data.speakers.slice(0, 50).map(s => <div key={s.id} className="text-[10px] py-1 px-2 hover:bg-slate-100 rounded truncate">{s.fullName}</div>)}
                  </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {/* INBOX */}
                  <div className={`bg-slate-50 border-b flex flex-col transition-all duration-300 ease-in-out ${isInboxCollapsed ? 'h-10' : 'h-48'}`}>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b bg-white/50 shrink-0">
                      <div className="flex items-center gap-3">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <PlusCircle className="w-3.5 h-3.5 text-indigo-500" />
                          Inbox ({filteredAndSortedInbox.length})
                        </h3>
                        {!isInboxCollapsed && (
                          <div className="flex items-center gap-2 border-l pl-3 ml-1">
                            <span className="text-[9px] text-slate-400 font-bold uppercase">Sort:</span>
                            <select
                              className="text-[9px] bg-transparent border-none focus:ring-0 font-bold text-slate-600 cursor-pointer"
                              value={inboxSortBy}
                              onChange={(e) => setInboxSortBy(e.target.value)}
                            >
                              <option value="DEFAULT">Eingang</option>
                              <option value="TITLE">Alphabet</option>
                              <option value="DURATION">Dauer</option>
                              <option value="SCORE">Bewertung</option>
                            </select>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setIsInboxCollapsed(!isInboxCollapsed)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-400 hover:text-slate-600"
                        title={isInboxCollapsed ? "Aufklappen" : "Einklappen"}
                      >
                        {isInboxCollapsed ? <PlusCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>

                    {!isInboxCollapsed && (
                      <div className="flex-1 overflow-x-auto p-2 custom-scrollbar">
                        <SortableContext id={INBOX_ID} items={filteredAndSortedInbox.map(p => p.id)}>
                          <DroppableStage id={INBOX_ID} className="flex gap-2 min-h-full items-start">
                            {filteredAndSortedInbox.map(p => (
                              <SortableInboxItem
                                key={p.id}
                                session={p}
                                onClick={() => { setEditingSession(p); setIsModalOpen(true) }}
                                onToggleLock={(s) => updateSession(s.id, { status: s.status === 'Fixiert' ? '2_Planung' : 'Fixiert' })}
                              />
                            ))}
                            {filteredAndSortedInbox.length === 0 && (
                              <div className="flex flex-col items-center justify-center w-full h-full text-slate-400 animate-pulse">
                                <Search className="w-5 h-5 mb-1 opacity-20" />
                                <span className="text-[10px] uppercase font-bold tracking-widest">Keine Übereinstimmung</span>
                              </div>
                            )}
                          </DroppableStage>
                        </SortableContext>
                      </div>
                    )}
                  </div>

                  {/* TIMELINE */}
                  <div className="flex-1 overflow-auto relative custom-scrollbar flex bg-slate-50">
                    <div className="w-10 bg-white border-r shrink-0 sticky left-0 z-30 shadow-sm" style={{ minHeight: timelineHeight }}>
                    </div>
                    <div className="flex min-w-full">
                      {data.stages.map(stage => {
                        const stageSessions = data.program.filter(p => p.stage === stage.id);
                        return (
                          <StageColumn key={stage.id} stage={stage} height={timelineHeight}>
                            {stageSessions.map(session => {
                              // Search Highlighting (Dimming)
                              let isDimmed = false;
                              if (searchQuery) {
                                const q = searchQuery.toLowerCase();
                                const matches =
                                  safeString(session.title).toLowerCase().includes(q) ||
                                  safeString(session.id).toLowerCase().includes(q) ||
                                  safeString(session.speakers).toLowerCase().includes(q) ||
                                  safeString(session.moderators).toLowerCase().includes(q);
                                if (!matches) isDimmed = true;
                              }

                              return (
                                <DraggableTimelineItem
                                  key={session.id}
                                  session={session}
                                  style={{
                                    ...getPos(session.start, session.duration),
                                    opacity: isDimmed ? 0.2 : 1,
                                    filter: isDimmed ? 'grayscale(1)' : 'none',
                                    transition: 'opacity 0.3s, filter 0.3s'
                                  }}
                                  onClick={() => { setEditingSession(session); setIsModalOpen(true) }}
                                  onToggleLock={(s) => updateSession(s.id, { status: s.status === 'Fixiert' ? '2_Planung' : 'Fixiert' })}
                                />
                              );
                            })}
                          </StageColumn>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <DragOverlay>
                {activeDragItem ? (
                  <Card status={activeDragItem.status} className="w-[200px] bg-indigo-600 text-white shadow-2xl">
                    <div className="font-bold text-xs">{activeDragItem.title}</div>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        )}

        {viewMode === 'CURATION' && (
          <div className="flex flex-col h-full overflow-hidden">
            <header className="bg-slate-800 text-white px-4 py-2 flex justify-between items-center shadow-lg shrink-0">
              <h1 className="font-bold flex items-center gap-2"><LayoutDashboard className="w-5 h-5" /> KOSMOS Curation Center</h1>
              <button onClick={() => setViewMode('PLANNER')} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded transition-colors uppercase font-bold tracking-widest">Planner View</button>
            </header>
            <CurationDashboard
              sessions={[
                ...curationData.sessions,
                ...data.program
                  .filter(p => (p.status || '').includes('Vorschlag') || (p.status || '').includes('Vorgeschlag'))
                  .map(p => ({
                    id: p.id,
                    title: p.title,
                    speakers: p.speakers,
                    status: 'Vorschlag', // Unified status for curation
                    format: p.format,
                    source: 'Planner'
                  }))
              ]}
              metadata={curationData.metadata}
              userRole={curationData.userRole}
              onUpdateStatus={handleUpdateCurationStatus}
              onUpdateMetadata={handleUpdateCurationMetadata}
            />
          </div>
        )}

        {viewMode === 'ADMIN' && (
          <div className="flex flex-col h-full overflow-hidden">
            <header className="bg-indigo-900 text-white px-4 py-2 flex justify-between items-center shadow-lg shrink-0">
              <h1 className="font-bold flex items-center gap-2"><Shield className="w-5 h-5" /> Admin Control Paner</h1>
              <button onClick={() => setViewMode('PLANNER')} className="text-xs bg-indigo-800 hover:bg-indigo-700 px-3 py-1 rounded transition-colors uppercase font-bold tracking-widest">Planner View</button>
            </header>
            <AdminDashboard
              users={curationData.users || []}
              stages={data.stages}
              onUpdateUserRole={handleUpdateUserRole}
              onAddUser={handleAddUser}
              onDeleteUser={handleDeleteUser}
            />
          </div>
        )}

        {/* Submit View */}
        {viewMode === 'SUBMIT' && (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
            <SessionSubmission
              n8nBaseUrl={config.n8nBaseUrl}
              metadata={curationData.metadata}
              submitterEmail={authenticatedUser.email}
              onSuccess={() => setToast({ msg: 'Session erfolgreich eingereicht!', type: 'success' })}
              onRegisterSpeaker={() => setViewMode('REGISTER')}
            />
          </div>
        )}

        {/* Speaker Registration View */}
        {viewMode === 'REGISTER' && (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
            <SpeakerRegistration
              n8nBaseUrl={config.n8nBaseUrl}
              registeredBy={authenticatedUser.email}
              onSuccess={() => setToast({ msg: 'Speaker registriert!', type: 'success' })}
            />
            <div className="text-center">
              <button
                onClick={() => setViewMode('SUBMIT')}
                className="text-sm text-indigo-600 hover:text-indigo-800 underline"
              >
                ← Zurück zur Einreichung
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="h-10 bg-slate-900 flex items-center justify-center gap-4 sm:gap-8 shrink-0 border-t border-slate-800 overflow-x-auto">
        <button onClick={() => setViewMode('PLANNER')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'PLANNER' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
          <Layout className="w-3.5 h-3.5" /> Planer
        </button>

        {['ADMIN', 'REVIEWER'].includes(curationData.userRole) && (
          <button onClick={() => setViewMode('SUBMIT')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'SUBMIT' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <PlusCircle className="w-3.5 h-3.5" /> Einreichung
          </button>
        )}

        {['ADMIN', 'CURATOR', 'REVIEWER'].includes(curationData.userRole) && (
          <button onClick={() => setViewMode('CURATION')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'CURATION' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <LayoutDashboard className="w-3.5 h-3.5" /> Kuration
          </button>
        )}

        {curationData.userRole === 'ADMIN' && (
          <button onClick={() => setViewMode('ADMIN')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'ADMIN' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <Shield className="w-3.5 h-3.5" /> Admin
          </button>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <h2 className="font-bold text-lg mb-4">Einstellungen</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-xs block">Start (Std)</label><input type="number" className="border p-2 w-full rounded" value={config.startHour} onChange={e => setConfig({ ...config, startHour: parseInt(e.target.value) || 9 })} /></div>
                <div><label className="text-xs block">Ende (Std)</label><input type="number" className="border p-2 w-full rounded" value={config.endHour} onChange={e => setConfig({ ...config, endHour: parseInt(e.target.value) || 22 })} /></div>
                <div><label className="text-xs block">Puffer (Min)</label><input type="number" className="border p-2 w-full rounded" value={config.bufferMin} onChange={e => setConfig({ ...config, bufferMin: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase text-slate-500">Sheet Config</h3>
                <label className="block text-xs">Spreadsheet ID</label>
                <input className="w-full border p-2 rounded" value={config.spreadsheetId} onChange={e => setConfig({ ...config, spreadsheetId: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs">Prog Sheet</label><input className="w-full border p-2 rounded" value={config.sheetNameProgram} onChange={e => setConfig({ ...config, sheetNameProgram: e.target.value })} /></div>
                  <div><label className="text-xs">Stages Sheet</label><input className="w-full border p-2 rounded" value={config.sheetNameStages} onChange={e => setConfig({ ...config, sheetNameStages: e.target.value })} /></div>
                </div>
                <label className="block text-xs">Curation API URL (optional)</label>
                <input className="w-full border p-2 rounded text-xs font-mono" placeholder="https://script.google.com/macros/s/.../exec" value={config.curationApiUrl} onChange={e => setConfig({ ...config, curationApiUrl: e.target.value })} />
                <label className="block text-xs mt-2">n8n Webhook Base URL</label>
                <input className="w-full border p-2 rounded text-xs font-mono" placeholder="https://n8n.deine-domain.de/webhook" value={config.n8nBaseUrl} onChange={e => setConfig({ ...config, n8nBaseUrl: e.target.value })} />
              </div>
              <div className="space-y-2 border-t pt-2">
                <h3 className="text-xs font-bold uppercase text-slate-500">Auth</h3>

                <div className={`p-2 rounded border text-xs mb-2 ${config.googleClientId === localStorage.getItem('kosmos_server_client_id') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                  {config.googleClientId === localStorage.getItem('kosmos_server_client_id') ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <div>
                        <strong>Managed Mode (Server)</strong>
                        <div className="text-[10px] opacity-75">Nutzt den zentral konfigurierten Google Client.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      <div>
                        <strong>Custom Mode (Eigener Client)</strong>
                        <div className="text-[10px] opacity-75">Nutzt deinen eigenen Google Client ID (Implicit Flow).</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input className="flex-1 border p-2 rounded text-xs font-mono" placeholder="Client ID (Optional: Eigener Client)" value={config.googleClientId} onChange={e => setConfig({ ...config, googleClientId: e.target.value })} />
                  {config.googleClientId !== localStorage.getItem('kosmos_server_client_id') && (
                    <button
                      onClick={() => setConfig({ ...config, googleClientId: localStorage.getItem('kosmos_server_client_id') || '' })}
                      className="px-2 py-2 bg-slate-100 border rounded text-[10px] hover:bg-slate-200"
                      title="Zurück zum Server-Standard"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {config.googleClientId !== localStorage.getItem('kosmos_server_client_id') && (
                  <div className="text-[10px] text-slate-500 mt-1 bg-slate-50 p-2 rounded">
                    <strong>Setup Info für Custom Client:</strong><br />
                    1. Authorized Javascript Origin: <code>{window.location.origin}</code><br />
                    2. Authorized Redirect URI: <code>{window.location.origin}</code><br />
                    (Implicit Flow benötigt kein Backend)
                  </div>
                )}

                <input className="w-full border p-2 rounded text-xs font-mono" placeholder="API Key (optional)" value={config.googleApiKey} onChange={e => setConfig({ ...config, googleApiKey: e.target.value })} />
                <div className="mt-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                  <label className="text-xs font-bold block mb-1 text-yellow-800 flex items-center gap-1"><Key className="w-3 h-3" /> Access Token (Manuell / Notfall)</label>
                  <input className="w-full border p-2 rounded text-xs font-mono" placeholder="Nur als Notfall-Fallback..." value={config.manualToken} onChange={e => setConfig({ ...config, manualToken: e.target.value })} />
                  <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline block mt-1">Token via Playground generieren (Scope: https://www.googleapis.com/auth/spreadsheets)</a>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t mt-4">
                  <button
                    onClick={generateMockCurationData}
                    className="text-[10px] bg-slate-800 text-white px-3 py-2 rounded hover:bg-slate-700 flex items-center gap-2 transition-all font-bold uppercase tracking-wider shadow-sm"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" /> Mock-Daten laden (Test)
                  </button>
                  <p className="text-[9px] text-slate-400 italic flex-1">Fügt temporäre Sessions hinzu, um das Dashboard zu testen.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 border rounded">Abbrechen</button>
              <button onClick={() => {
                Object.keys(config).forEach(k => localStorage.setItem(`kosmos_${k}`, config[k]));
                window.location.reload();
              }} className="px-4 py-2 bg-blue-600 text-white rounded">Speichern & Reload</button>
            </div>
          </div>
        </div>
      )}

      <SessionModal
        isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingSession(null); }}
        onSave={handleSaveSession} onDelete={handleDeleteSession}
        initialData={editingSession} definedStages={data.stages}
        speakersList={data.speakers} moderatorsList={data.moderators}
      />
    </div>
  );
}



export default App;
