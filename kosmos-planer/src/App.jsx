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
  Download, DownloadCloud, Loader2, Key, LogOut, Mail, LayoutDashboard, Shield, User, Heart
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
import SpeakerProfile from './SpeakerProfile';
import ProductionTimeline from './ProductionTimeline';

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
async function fetchSheets(body, token, n8nBaseUrl) {
  if (!n8nBaseUrl) {
    return { ok: false, error: "Keine n8n API Base URL konfiguriert." };
  }

  const cleanBaseUrl = n8nBaseUrl.replace(/\/$/, '').replace(/\/api$/, '');
  const endpoint = '/api/data'; // ALL operations go through /api/data (has proper role-based checks)
  const reqUrl = `${cleanBaseUrl}${endpoint}`;

  let lastError = null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(reqUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const text = await res.text();
      if (!text) return { ok: true, data: {} };
      try {
        const data = JSON.parse(text);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: "Ungültige Server-Antwort", status: res.status };
      }
    }

    lastError = `HTTP ${res.status}`;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        const errorData = await res.json();
        lastError = errorData.error || lastError;
      } catch (e) { }
    }
    return { ok: false, error: lastError, status: res.status };

  } catch (err) {
    console.error('n8n fetch error:', err);
    return { ok: false, error: "Netzwerkfehler: " + err.message };
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

function SessionCardContent({ session, onClick, onToggleLock, isLocked, hasConflict, conflictTooltip, listeners, attributes, isDimmed, isFavorite, onToggleFavorite, userRole }) {
  const isEingeladen = session.status === 'Eingeladen';
  const canSeeEingeladen = userRole === 'ADMIN' || userRole === 'REVIEWER';
  const isMasked = isEingeladen && !canSeeEingeladen;
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
          {onToggleFavorite && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(session); }}
              className={`p-1 rounded hover:bg-black/5 transition-colors ${isFavorite ? 'text-pink-500' : 'text-slate-300 hover:text-pink-400'}`}
              title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              <Heart className={`w-3.5 h-3.5 transition-all ${isFavorite ? 'fill-pink-500' : ''}`} />
            </button>
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
      <div className="font-bold text-xs leading-snug mb-1 text-slate-800 line-clamp-2" title={isMasked ? 'Reserviert' : session.title}>
        {isMasked ? '🔒 Reserviert' : (session.title || 'Unbenannt')}
      </div>

      {/* People & Details */}
      {!isMasked && <div className="mt-auto space-y-1">
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
          {session.partner && session.partner !== 'FALSE' && (() => {
            const isPending = session.partner.startsWith('pending:');
            const displayName = isPending ? session.partner.replace(/^pending:/, '') : session.partner;
            return <span className={`flex items-center gap-0.5 truncate font-bold px-1 rounded border ${isPending ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-blue-600 bg-blue-50 border-blue-100'}`}><Flag className="w-2.5 h-2.5" /> {isPending ? '⏳' : ''}{displayName}</span>;
          })()}
          {session.notes && (
            <div
              className="ml-1 text-blue-500 cursor-help"
              onMouseEnter={() => setActiveOverlay('notes')}
            >
              <MessageSquare className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
      </div>}
      {isMasked && (
        <div className="mt-auto text-[10px] text-orange-500 italic">Nur für Admin/Reviewer sichtbar</div>
      )}
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

function DraggableTimelineItem({ session, onClick, style, onToggleLock, hasConflict, conflictTooltip, isDimmed, isFavorite, onToggleFavorite, userRole }) {
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
        isFavorite={isFavorite} onToggleFavorite={onToggleFavorite}
        userRole={userRole}
      />
    </div>
  );
};

function SortableInboxItem({ session, onClick, onToggleLock, hasConflict, conflictTooltip, isDimmed, isFavorite, onToggleFavorite, userRole }) {
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
        isFavorite={isFavorite} onToggleFavorite={onToggleFavorite}
        userRole={userRole}
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
    <div ref={setNodeRef} style={{ height: height + HEADER_HEIGHT }} className={`min-w-[280px] w-full max-w-[320px] border-r relative transition-colors ${stage.hidden ? 'border-dashed border-slate-300 opacity-50' : 'border-slate-200'} ${isOver ? 'bg-blue-50/30' : 'bg-white/30 odd:bg-slate-50/50'}`}>
      <div className={`backdrop-blur border-b p-2 text-center z-20 shadow-sm flex flex-col justify-center ${stage.hidden ? 'bg-slate-100/95 border-dashed border-slate-300' : 'bg-white/95 border-slate-200'}`} style={{ height: HEADER_HEIGHT }}>
        <div className="font-bold text-slate-700 text-sm truncate flex items-center justify-center gap-1.5">
          {stage.hidden && <span title="Versteckte Bühne (nur Admin)" className="text-slate-400">👻</span>}
          {stage.name}
        </div>
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

// Normalize legacy Programm_Export status values to canonical format
const normalizeStatus = (raw) => {
  const s = (raw || '').trim();
  const lower = s.toLowerCase();
  if (!s) return 'Vorschlag';
  if (lower === 'eingeladen') return 'Eingeladen';
  if (lower === 'fixiert') return 'Fixiert';
  if (lower === 'akzeptiert' || lower === '1_zusage' || lower.startsWith('1_')) return 'Akzeptiert';
  if (lower === '2_planung' || lower.startsWith('2_')) return 'Akzeptiert';
  if (lower === '3_absage' || lower.startsWith('3_')) return 'Abgelehnt';
  if (lower === '4_wartend' || lower.startsWith('4_')) return 'Vorschlag';
  if (lower === '5_vorschlag' || lower.startsWith('5_')) return 'Vorschlag';
  if (lower === 'vorschlag') return 'Vorschlag';
  if (lower === 'abgelehnt') return 'Abgelehnt';
  return s; // keep unknown values as-is
};

// Auto-generate a short unique Session ID
const generateSessionId = () => `S-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const parsePlannerBatch = (batch, config) => {
  const valRanges = batch.valueRanges;
  if (!valRanges || valRanges.length < 3) return { speakers: [], moderators: [], stages: [], program: [] };

  const allowedSpeakerStatus = ['zusage', 'interess', 'angefragt', 'eingeladen', 'vorschlag', 'cfp', 'cfp_dummy'];
  // 26_Kosmos_SprecherInnen columns (A-AJ):
  // A=Status_Einladung(0), B=Status_Backend(1), C=ID(2), D=Vorname(3), E=Nachname(4),
  // F=Pronomen(5), G=Organisation(6), H=Bio(7), I=Webseite(8), J=Update(9),
  // K=E-Mail(10), L=Telefon(11), M=Herkunft(12), N=Sprache(13),
  // O=Registriert_am(14), P=Registriert_von(15), Q=Honorar_netto(16), R-V=(reserved 17-21),
  // W=Hotel(22), X-Y=(reserved 23-24), Z=Briefing(25),
  // AA=Instagram(26), AB=LinkedIn(27), AC=Sonstige Social Media(28),
  // AD=Zeitstempel(29), AE=Status_Vertrag(30), AF=Adresse(31), AG=Ehrenamtsvergütung(32),
  // AH=Catering(33), AI=Anreise_Am(34), AJ=Abreise_Am(35), AK=Ansprache(36)
  const speakerMap = new Map();
  // Debug: log all status values to see what's in the sheet
  if (import.meta.env.DEV) {
    const allRows = valRanges[0].values || [];
    console.log(`[Speaker Debug] Total rows: ${allRows.length}`);
    allRows.forEach((r, i) => {
      const status = safeString(r[0]);
      const name = `${safeString(r[3])} ${safeString(r[4])}`.trim();
      if (name) console.log(`  Row ${i + 1}: status="${status}" name="${name}"`);
    });
  }
  (valRanges[0].values || []).filter(r => {
    // Must have at least a name (Vorname or Nachname)
    if (!safeString(r[3]) && !safeString(r[4])) return false;
    // Only include speakers with allowed statuses
    const s = safeString(r[0]).toLowerCase();
    const passes = allowedSpeakerStatus.some(k => s.includes(k));
    if (import.meta.env.DEV && !passes) {
      const name = `${safeString(r[3])} ${safeString(r[4])}`.trim();
      console.log(`  [FILTERED OUT] status="${safeString(r[0])}" name="${name}"`);
    }
    return passes;
  }).forEach(r => {
    const fullName = `${safeString(r[3])} ${safeString(r[4])}`.trim();
    const email = safeString(r[10]);
    // Use fullName as primary key — emails can be shared placeholders (e.g. Dummy@gmx.de)
    const key = fullName || email;
    if (key && !speakerMap.has(key)) {
      speakerMap.set(key, {
        id: safeString(r[2]) || `SPK-${String(speakerMap.size + 1).padStart(4, '0')}`,
        fullName,
        status: safeString(r[0]),
        statusBackend: safeString(r[1]),
        pronoun: safeString(r[5]),
        organisation: safeString(r[6]),
        bio: safeString(r[7]),
        webseite: safeString(r[8]),
        email,
        herkunft: safeString(r[12]),
        sprache: safeString(r[13]),
        instagram: safeString(r[26]),
        linkedin: safeString(r[27]),
        socialSonstiges: safeString(r[28]),
        telefon: safeString(r[11]),
        registeredBy: safeString(r[15]),
        honorar: safeString(r[16]),
        hotel: safeString(r[22]),
        briefing: safeString(r[25]),
        vertragStatus: safeString(r[30]),
        adresse: safeString(r[31]),
        ehrenamtsverguetung: safeString(r[32]).toLowerCase() === 'true',
        catering: safeString(r[33]),
        anreiseAm: safeString(r[34]),
        abreiseAm: safeString(r[35]),
        ansprache: safeString(r[36])
      });
    }
  });

  // --- Parse Moderators (valRanges[1]) and Stages (valRanges[2]) ---
  // Must be parsed BEFORE Master_Einreichungen so program builder can reference stages
  const mo = (valRanges[1].values || []).filter(r => r[0]).map((r, i) => ({ id: `mod-${i}`, fullName: safeString(r[1]), status: safeString(r[0]) }));

  const st = (valRanges[2].values || [])
    .map((r, i) => ({
      id: safeString(r[0]) || `st-${i}`,
      name: safeString(r[1]),
      capacity: safeString(r[2]),
      maxMics: parseInt(r[4]) || 4,
      hidden: safeString(r[5]).toUpperCase() === 'TRUE'
    }))
    .filter(s => s.name && s.name.toLowerCase() !== 'inbox');

  if (st.length === 0) st.push({ id: 'main', name: 'Main Stage', capacity: 200, maxMics: 4 });

  // --- Parse Master_Einreichungen (valRanges[4]) ---
  // Columns A-O: Submission data
  //   A=Zeitstempel, B=Submitter_Email, C=Submitter_Name, D=Status,
  //   E=Session_Titel, F=Kurzbeschreibung, G=Beschreibung, H=Format, I=Thema,
  //   J=Bereich, K=Sprache, L=Dauer, M=Speaker_IDs, N=Speaker_Names, O=Notizen
  // Columns P-V: Planning data (Solution A — single source of truth)
  //   P=Bühne, Q=Startzeit, R=Endzeit, S=Partner, T=Stage_Dispo, U=Tags, V=Moderators
  let submissions = [];
  let pr = []; // program items built from the same data
  if (valRanges[4] && valRanges[4].values) {
    const einreichRows = valRanges[4].values.filter(r => safeString(r[4])); // Must have a title (col E)
    submissions = einreichRows.map((r, i) => {
      const submitterEmail = safeString(r[1]);
      const submitterName = safeString(r[2]);
      const speakerIds = safeString(r[12]);
      const speakerNames = safeString(r[13]);
      const speakerDisplay = speakerNames || speakerIds || submitterName;

      return {
        id: safeString(r[22]) || generateSessionId(), // Col W = Session_ID, auto-generate if missing
        rowIndex: i + 2,
        timestamp: safeString(r[0]),
        submitterEmail,
        submitterName,
        title: safeString(r[4]),
        shortDescription: safeString(r[5]),
        description: safeString(r[6]),
        format: safeString(r[7]) || 'Talk',
        thema: safeString(r[8]),
        bereich: safeString(r[9]),
        language: safeString(r[10]),
        duration: parseInt(r[11]) || 60,
        speakerIds,
        speakers: speakerDisplay,
        notes: safeString(r[14]),
        status: normalizeStatus(r[3]),
        source: 'Einreichung'
      };
    });

    // Build program items from the same rows (using planning columns P-V)
    pr = einreichRows.map((r, i) => {
      const dur = parseInt(r[11]) || 60;
      const rawStage = safeString(r[15]); // Col P = Bühne
      let stage = INBOX_ID;
      if (rawStage) {
        const matchById = st.find(s => s.id === rawStage);
        if (matchById) { stage = matchById.id; }
        else {
          const matchByName = st.find(s => s.name === rawStage);
          if (matchByName) { stage = matchByName.id; }
        }
      }
      const rawStart = safeString(r[16]) || '-'; // Col Q = Startzeit
      let finalStart = rawStart;
      if (finalStart.length > 5 && (finalStart.includes('.') || finalStart.includes(' '))) {
        finalStart = '-';
      } else if (finalStart && !finalStart.includes(':')) {
        finalStart = '-';
      }

      const speakerNames = safeString(r[13]);
      const speakerIds = safeString(r[12]);
      // Only show actual speakers/dummies — NOT the submitter
      const speakerDisplay = speakerNames || speakerIds || '';

      return {
        id: safeString(r[22]) || generateSessionId(), // Col W = Session_ID, auto-generate if missing
        rowIndex: i + 2,
        title: safeString(r[4]),
        status: normalizeStatus(r[3]),
        partner: safeString(r[18]) || '', // Col S = Partner/Organisation name (string)
        format: safeString(r[7]) || 'Talk',
        stage: stage,
        start: finalStart,
        duration: dur,
        end: calculateEndTime(finalStart, dur),
        speakers: speakerDisplay,
        moderators: safeString(r[21]), // Col V = Moderators
        language: safeString(r[10]),
        notes: safeString(r[14]),
        stageDispo: safeString(r[19]), // Col T = Stage_Dispo
        shortDescription: safeString(r[5]),
        description: safeString(r[6]),
        bereich: safeString(r[9]),
        thema: safeString(r[8]),
        tags: safeString(r[20]), // Col U = Tags
        submitterEmail: safeString(r[1]),
        submitterName: safeString(r[2]),
        source: 'Einreichung'
      };
    });
  }

  const sp = Array.from(speakerMap.values());
  if (import.meta.env.DEV) {
    console.log(`[parsePlannerBatch] Final speaker count: ${sp.length} (from sheet: ${(valRanges[0].values || []).length} rows, submissions: ${valRanges[4]?.values?.length || 0} rows)`);
    sp.forEach(s => console.log(`  Speaker: "${s.fullName}" status="${s.status}" id="${s.id}"`));
  }




  // --- Parse Config_Themen (valRanges[5]) ---
  // Columns: A=Bereiche, B=Themen, C=Tags, D=Formate, E=MaxSubmissions
  const configRows = (valRanges[5] && valRanges[5].values) ? valRanges[5].values : [];
  const configThemen = {
    bereiche: [...new Set(configRows.map(r => safeString(r[0])).filter(Boolean))],
    themen: [...new Set(configRows.map(r => safeString(r[1])).filter(Boolean))],
    tags: [...new Set(configRows.map(r => safeString(r[2])).filter(Boolean))],
    formate: [...new Set(configRows.map(r => safeString(r[3])).filter(Boolean))],
    maxSubmissions: (() => { const v = configRows.find(r => safeString(r[4])); return v ? (parseInt(safeString(v[4])) || 5) : 5; })(),
  };

  // --- Parse Config_Organisations (valRanges[9]) ---
  // Columns: A=Email, B=Name, C=Beschreibung, D=Webseite, E=Logo_URL, F=Instagram, G=LinkedIn, H=Social_Sonstiges, I=Status
  const orgRows = (valRanges[9] && valRanges[9].values) ? valRanges[9].values : [];
  const organisations = orgRows.filter(r => r[0]).map((r, i) => ({
    rowIndex: i + 2,
    email: safeString(r[0]),
    name: safeString(r[1]),
    beschreibung: safeString(r[2]),
    webseite: safeString(r[3]),
    logoUrl: safeString(r[4]),
    instagram: safeString(r[5]),
    linkedin: safeString(r[6]),
    socialSonstiges: safeString(r[7]),
    status: safeString(r[8]) || 'ausstehend' // 'bestätigt' or 'ausstehend'
  }));

  // --- Parse Master_Ratings (valRanges[6]) ---
  // Columns: A=Zeitstempel, B=Session_ID, C=Reviewer_Email, D=Score, E=Kommentar, F=Kategorie
  const rawRatings = (valRanges[6] && valRanges[6].values) ? valRanges[6].values : [];
  const ratingsMap = {};
  rawRatings.forEach(r => {
    const sessionId = safeString(r[1]);
    if (!sessionId) return;
    if (!ratingsMap[sessionId]) ratingsMap[sessionId] = [];
    ratingsMap[sessionId].push({
      timestamp: safeString(r[0]),
      reviewer: safeString(r[2]),
      score: parseInt(r[3]) || 0,
      kommentar: safeString(r[4]),
      kategorie: safeString(r[5])
    });
  });

  return { speakers: sp, moderators: mo, stages: st, program: pr, submissions, configThemen, ratings: ratingsMap, organisations };
};
function App({ authenticatedUser }) {
  const [data, setData] = useState({ speakers: [], moderators: [], program: [], stages: [], submissions: [], organisations: [], configThemen: { bereiche: [], themen: [], tags: [], formate: [] }, ratings: {} });
  const [status, setStatus] = useState({ loading: false, error: null });

  // Simplified config - no more complex auth initialization
  const [config, setConfig] = useState({
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
    spreadsheetId: localStorage.getItem('kosmos_spreadsheet_id') || import.meta.env.VITE_SPREADSHEET_ID || '',

    sheetNameSpeakers: localStorage.getItem('kosmos_sheet_speakers') || '26_Kosmos_SprecherInnen',
    sheetNameMods: localStorage.getItem('kosmos_sheet_mods') || '26_Kosmos_Moderation',
    sheetNameStages: localStorage.getItem('kosmos_sheet_stages') || 'Bühnen_Import',
    curationApiUrl: import.meta.env.VITE_CURATION_API_URL || (localStorage.getItem('kosmos_curation_api_url')?.includes('script.google.com') ? '' : localStorage.getItem('kosmos_curation_api_url')) || '',
    n8nBaseUrl: import.meta.env.VITE_CURATION_API_URL || (localStorage.getItem('kosmos_n8nBaseUrl')?.includes('script.google.com') ? '' : localStorage.getItem('kosmos_n8nBaseUrl')) || '',
    startHour: parseInt(localStorage.getItem('kosmos_start_hour')) || 9,
    endHour: parseInt(localStorage.getItem('kosmos_end_hour')) || 22,
    bufferMin: parseInt(localStorage.getItem('kosmos_buffer_min')) || 5,
    maxSubmissions: 5 // default only — overridden by Config_Themen!E2 after load
  });

  const [viewMode, setViewMode] = useState('PLANNER'); // 'PLANNER' or 'CURATION'
  const [curationData, setCurationData] = useState({
    sessions: [],
    users: [],
    metadata: { bereiche: [], themen: [], tags: [], formate: [] },
    userRole: authenticatedUser?.role || 'GUEST'
  });

  const [activeDragItem, setActiveDragItem] = useState(null);
  const [productionData, setProductionData] = useState([]);

  // --- FAVORITES STATE (WebCal Heart) ---
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('kosmos_favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const toggleFavorite = useCallback((session) => {
    setFavorites(prev => {
      const next = new Set(prev);
      const action = next.has(session.id) ? 'remove' : 'add';
      if (action === 'add') next.add(session.id);
      else next.delete(session.id);
      localStorage.setItem('kosmos_favorites', JSON.stringify([...next]));

      // Fire webhook to n8n if configured
      if (config.n8nBaseUrl) {
        const token = authenticatedUser.accessToken || authenticatedUser.magicToken;
        fetch(`${config.n8nBaseUrl}/webcal/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            userId: authenticatedUser.email,
            sessionId: session.id,
            sessionTitle: session.title,
            action
          })
        }).catch(e => console.warn('[Favorites] Webhook error:', e));
      }

      return next;
    });
  }, [config.n8nBaseUrl, authenticatedUser.accessToken, authenticatedUser.magicToken, authenticatedUser.email]);

  // --- LIVE MODE STATE ---
  const [liveMode, setLiveMode] = useState(() => localStorage.getItem('kosmos_live_mode') === 'true');
  const toggleLiveMode = useCallback(() => {
    setLiveMode(prev => {
      const next = !prev;
      localStorage.setItem('kosmos_live_mode', String(next));
      return next;
    });
  }, []);

  // Sync userRole from authenticatedUser whenever it changes
  useEffect(() => {
    if (authenticatedUser?.role && authenticatedUser.role !== curationData.userRole) {
      setCurationData(prev => ({ ...prev, userRole: authenticatedUser.role }));
      if (import.meta.env.DEV) console.log('[App] Role synced from auth:', authenticatedUser.role);
    }
  }, [authenticatedUser?.role]);
  const [ghostPosition, setGhostPosition] = useState(null);
  const [toast, setToast] = useState(null);

  const [localChanges, setLocalChanges] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedOrgEmail, setExpandedOrgEmail] = useState(null);
  const [speakerDashFilter, setSpeakerDashFilter] = useState('ALL');
  const [expandedSpeakerId, setExpandedSpeakerId] = useState(null);
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
        if (s.partner && s.partner !== 'FALSE') partnerSessions++;

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

    const confirmedSessionStatus = ['Akzeptiert', 'Fixiert'];
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
      // Use the access token from AuthGate, or magicToken for magic link users
      const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';

      // Fire old curation API fetch non-blocking (don't await — prevents CORS from blocking navigation)
      if (config.curationApiUrl) {
        fetch(config.curationApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'getCurationData', includePlanner: true, email: authenticatedUser.email || '' })
        }).then(res => res.ok ? res.json() : null).then(result => {
          if (result) {
            setCurationData(prev => ({ ...prev, ...result, metadata: { ...prev.metadata, ...(result.metadata || {}) } }));
          }
        }).catch(e => console.warn('Could not fetch from Curation API:', e));
      }

      const ranges = [
        `'${config.sheetNameSpeakers}'!A2:AK`,       // index 0: Speakers (37 cols incl ansprache)
        `'${config.sheetNameMods}'!A2:C`,            // index 1: Moderators
        `'${config.sheetNameStages}'!A2:H`,          // index 2: Stages
      ];

      // index 3: placeholder (kept for valRanges index compatibility)
      ranges.push(`'${config.sheetNameStages}'!A1:A1`);

      ranges.push(`'Master_Einreichungen'!A2:W`);          // index 4: Submissions + Planning (A-O submission, P-V planning, W=Session_ID)
      ranges.push(`'Config_Themen'!A2:E`);                 // index 5: Bereiche/Themen/Tags/Formate/MaxSubmissions
      ranges.push(`'Master_Ratings'!A2:F`);                 // index 6: Ratings
      ranges.push(`'Config_Users'!A2:C`);                   // index 7: Users (email, role, name)
      ranges.push(`'Config_Users'!D1:D1`);                   // index 8: Open Call status
      ranges.push(`'Config_Organisations'!A2:I`);           // index 9: Organisations (incl status col I)

      if (import.meta.env.DEV) console.log('[loadData] Final ranges to fetch:', ranges);

      const { ok, data: batch, error, status: resStatus } = await fetchSheets({
        action: 'batchGet',
        spreadsheetId: config.spreadsheetId,
        ranges: ranges
      }, token, config.curationApiUrl);

      if (import.meta.env.DEV) console.log('[loadData] Result:', { ok, rangeCount: batch?.valueRanges?.length, error });

      if (!ok) {
        if (resStatus === 401 || resStatus === 403) {
          // Only force re-auth for Google users, not magic link users
          if (authenticatedUser.authType !== 'magic') {
            clearAuth();
            setIsAuthenticated(false);
            setAccessToken(null);
          }
          setStatus({ loading: false, error: "Zugriff verweigert. Bitte erneut einloggen." });
          return;
        }
        throw new Error(error || 'Sheets API Fehler');
      }

      const parsed = parsePlannerBatch(batch, config);

      // Parse users from Config_Users (index 7): A=Email, B=Role, C=Name
      // IMPORTANT: Merge duplicate email rows to prevent role corruption
      const usersRows = (batch.valueRanges?.[7]?.values || []);
      const userMap = new Map();
      usersRows.filter(r => r[0] && r[1]).forEach(r => {
        const email = safeString(r[0]).trim().toLowerCase();
        const rawRoles = safeString(r[1]).trim().toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
        const name = safeString(r[2]);
        if (userMap.has(email)) {
          const existing = userMap.get(email);
          // Merge roles from duplicate rows, deduplicate
          rawRoles.forEach(role => { if (!existing.roles.includes(role)) existing.roles.push(role); });
          if (name && !existing.name) existing.name = name;
        } else {
          userMap.set(email, { email: safeString(r[0]).trim(), roles: [...new Set(rawRoles)], name });
        }
      });
      const parsedUsers = Array.from(userMap.values()).map(u => ({
        email: u.email, role: u.roles.join(','), name: u.name || ''
      }));
      if (parsedUsers.length > 0) {
        // Derive the current user's role from Config_Users (overrides n8n GUEST fallback)
        const currentUserEntry = parsedUsers.find(u => u.email.toLowerCase() === authenticatedUser.email?.toLowerCase());
        const sheetRole = currentUserEntry?.role || curationData.userRole || 'GUEST';
        setCurationData(prev => ({ ...prev, users: parsedUsers, userRole: sheetRole }));
        if (import.meta.env.DEV) console.log('[loadData] userRole from Config_Users:', sheetRole);
      }
      // Read Open Call status from Config_Users D1 (index 8)
      const openCallVal = safeString(batch.valueRanges?.[8]?.values?.[0]?.[0]).toUpperCase();
      setOpenCallClosed(openCallVal === 'CLOSED');
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
  }, [authenticatedUser.accessToken, config.spreadsheetId, config.sheetNameSpeakers, config.sheetNameMods, config.sheetNameStages]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Fetch production data lazily when switching to PRODUCTION view
  const PRODUCTION_SHEET_ID = '1kTZDPAzvp9WIjZ1sbG8sDIl5-iYQMWfsZ3pMN4lnNLA';
  useEffect(() => {
    if (viewMode !== 'PRODUCTION') return;
    if (productionData.length > 0) return; // Already loaded

    const fetchProductionData = async () => {
      try {
        const token = authenticatedUser.accessToken;
        const { ok, data: batch, error } = await fetchSheets({
          action: 'batchGet',
          spreadsheetId: PRODUCTION_SHEET_ID,
          ranges: ["'26_Kosmos_Produktions_Export'!A2:M"]
        }, token, config.curationApiUrl);

        if (!ok) {
          console.warn('[Production] Failed to fetch production data:', error);
          return;
        }

        const rows = batch?.valueRanges?.[0]?.values || [];
        // Columns: A=Session_ID, B=Stage_Name, C=Start_Time, D=End_Time, E=Setup_Start,
        // F=Session_Title, G=Mic_Count_Wireless, H=Mic_Count_Headset, I=Audio_Feeds,
        // J=Visuals, K=Special_Requirements, L=Production_Status, M=Speaker_Contact_Link
        const parsed = rows.filter(r => safeString(r[0])).map(r => ({
          sessionId: safeString(r[0]),
          stageName: safeString(r[1]),
          startTime: safeString(r[2]),
          endTime: safeString(r[3]),
          setupStart: safeString(r[4]),
          sessionTitle: safeString(r[5]),
          micCountWireless: safeString(r[6]),
          micCountHeadset: safeString(r[7]),
          audioFeeds: safeString(r[8]),
          visuals: safeString(r[9]),
          specialRequirements: safeString(r[10]),
          productionStatus: safeString(r[11]),
          speakerContactLink: safeString(r[12]),
        }));
        setProductionData(parsed);
        if (import.meta.env.DEV) console.log('[Production] Loaded', parsed.length, 'rows');
      } catch (e) {
        console.warn('[Production] Fetch error:', e);
      }
    };
    fetchProductionData();
  }, [viewMode, productionData.length, authenticatedUser.accessToken, config.curationApiUrl]);

  const handleLogout = () => {
    // Revoke the Google OAuth token if possible
    const token = authenticatedUser?.accessToken;
    if (token && token !== 'mock_dev_token_123') {
      fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => { });
    }

    // Clear ALL auth-sensitive data from localStorage
    localStorage.removeItem('kosmos_user_session');
    localStorage.removeItem('kosmos_local_data');
    // Don't clear settings like spreadsheetId, sheetNames, curation_api_url — those are config, not auth

    // Hard reload to show AuthGate
    window.location.reload();
  };

  const [showProfileMenu, setShowProfileMenu] = useState(false);

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
      status: 'Vorschlag',
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

  // --- USER MANAGEMENT (Config_Users sheet: A=Email, B=Role, C=Name) ---
  const saveUsersToSheet = async (updatedUsers) => {
    // Only ADMIN can modify user roles
    if (effectiveRole !== 'ADMIN') {
      setToast({ msg: 'Nur Admins können Nutzerrollen ändern', type: 'error' });
      return;
    }
    const token = authenticatedUser.accessToken;
    // Normalize: deduplicate roles per user before writing
    const rows = updatedUsers.map(u => {
      const dedupedRole = [...new Set(u.role.split(',').map(r => r.trim().toUpperCase()).filter(Boolean))].join(',');
      return [u.email, dedupedRole, u.name || ''];
    });
    const { ok, error } = await fetchSheets({
      action: 'update',
      spreadsheetId: config.spreadsheetId,
      range: `'Config_Users'!A2:C`,
      values: rows,
    }, token, config.curationApiUrl);
    if (!ok) throw new Error(error || 'Fehler beim Speichern der Nutzerliste');
  };

  // Effective role: derived from Config_Users list (sheet source of truth)
  // Role priority (highest first) — used to pick the "primary" display role
  const ROLE_PRIORITY = ['ADMIN', 'CURATOR', 'REVIEWER', 'PRODUCTION', 'SPEAKER', 'ORGANISATION', 'TEILNEHMENDE', 'BAND', 'GUEST'];

  // Parse all roles from comma-separated string
  const userRoles = (() => {
    const email = authenticatedUser.email?.toLowerCase() || '';
    // 1. Check Config_Users for explicit role assignment (may be comma-separated)
    const fromUsers = curationData.users.find(u => u.email.toLowerCase() === email);
    let roles = [];
    if (fromUsers) {
      roles = [...new Set(fromUsers.role.split(',').map(r => r.trim().toUpperCase()).filter(Boolean))];
    }
    // 2. Add n8n-assigned role if not already present
    if (curationData.userRole && curationData.userRole !== 'GUEST') {
      const nRoles = curationData.userRole.split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
      nRoles.forEach(r => { if (!roles.includes(r)) roles.push(r); });
    }
    // 3. Auto-detect: is user a registered speaker?
    const isSpeaker = data.speakers.some(s => s.email?.toLowerCase() === email);
    if (isSpeaker && !roles.includes('SPEAKER')) roles.push('SPEAKER');
    // Normalize: merge SPRECHERIN into SPEAKER
    const spIdx = roles.indexOf('SPRECHERIN');
    if (spIdx >= 0) { roles[spIdx] = 'SPEAKER'; if (roles.filter(r => r === 'SPEAKER').length > 1) roles.splice(spIdx, 1); }
    // 4. Auto-detect: has user submitted sessions?
    const hasSubmissions = data.submissions.some(s => s.submitterEmail?.toLowerCase() === email);
    if (hasSubmissions && !roles.includes('TEILNEHMENDE')) roles.push('TEILNEHMENDE');
    // 5. Auto-detect: is user in Config_Organisations?
    const isOrg = data.organisations?.some(o => o.email?.toLowerCase() === email);
    if (isOrg && !roles.includes('ORGANISATION')) roles.push('ORGANISATION');
    // Normalize old PARTNER role to ORGANISATION
    const partnerIdx = roles.indexOf('PARTNER');
    if (partnerIdx >= 0) { roles[partnerIdx] = 'ORGANISATION'; }
    return roles.length > 0 ? roles : ['GUEST'];
  })();

  // Primary display role (highest priority)
  const effectiveRole = ROLE_PRIORITY.find(r => userRoles.includes(r)) || userRoles[0] || 'GUEST';

  // Permission check: does user have ANY of the specified roles?
  const hasRole = (...roles) => roles.some(r => userRoles.includes(r));

  // Find current user's speaker record (for profile)
  const mySpeakerRecord = useMemo(() => {
    const email = authenticatedUser.email?.toLowerCase() || '';
    return data.speakers.find(s => s.email?.toLowerCase() === email) || null;
  }, [data.speakers, authenticatedUser.email]);

  // My organisation record (for org profile editing)
  const myOrgRecord = useMemo(() => {
    const email = authenticatedUser.email?.toLowerCase() || '';
    return data.organisations?.find(o => o.email?.toLowerCase() === email) || null;
  }, [data.organisations, authenticatedUser.email]);

  // My submissions (for Einreichung dashboard)
  const mySubmissions = useMemo(() => {
    const email = authenticatedUser.email?.toLowerCase() || '';
    return data.submissions.filter(s => s.submitterEmail?.toLowerCase() === email);
  }, [data.submissions, authenticatedUser.email]);

  // My sessions (sessions where I'm listed as speaker)
  const mySessions = useMemo(() => {
    if (!mySpeakerRecord) return [];
    const myName = mySpeakerRecord.fullName?.toLowerCase() || '';
    const myId = mySpeakerRecord.id || '';
    return data.program.filter(session => {
      const speakers = (session.speakers || '').toLowerCase();
      return speakers.includes(myName) || speakers.includes(myId.toLowerCase());
    });
  }, [data.program, mySpeakerRecord]);

  // My org sessions (sessions where partner field matches my org name, including pending)
  const myOrgSessions = useMemo(() => {
    if (!myOrgRecord) return [];
    const orgName = myOrgRecord.name?.toLowerCase() || '';
    if (!orgName) return [];
    return data.program.filter(session => {
      const partner = (session.partner || '').toLowerCase();
      return partner === orgName || partner === `pending:${orgName}`;
    });
  }, [data.program, myOrgRecord]);

  // Set default view based on role (once data loaded)
  const [initialRedirectDone, setInitialRedirectDone] = useState(false);
  useEffect(() => {
    if (initialRedirectDone) return;
    // Force new users to profile page immediately (don't wait for data)
    if (authenticatedUser.isNewUser) {
      setViewMode('PROFILE');
      setInitialRedirectDone(true);
      return;
    }
    // TEILNEHMENDE → Profile first if no speaker record, otherwise SUBMIT
    if (hasRole('TEILNEHMENDE', 'SPEAKER')) {
      if (!mySpeakerRecord) {
        setViewMode('PROFILE');
      } else {
        setViewMode('SUBMIT');
      }
      setInitialRedirectDone(true);
      return;
    }
    // ORGANISATION → show org sessions
    if (hasRole('ORGANISATION') && !hasRole('ADMIN', 'CURATOR')) {
      setViewMode('ORG_SESSIONS');
      setInitialRedirectDone(true);
      return;
    }
    // Wait for data to determine role-based default
    if (!data.speakers.length) return;
    if (hasRole('SPEAKER')) { setViewMode('PROFILE'); setInitialRedirectDone(true); }
    else { setInitialRedirectDone(true); }
  }, [effectiveRole, data.speakers, mySpeakerRecord, initialRedirectDone, authenticatedUser.isNewUser]);

  const handleUpdateUserRole = async (email, newRole) => {
    if (!hasRole('ADMIN')) {
      setToast({ msg: 'Nur Admins können Rollen ändern.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const updated = curationData.users.map(u => u.email === email ? { ...u, role: newRole } : u);
    setCurationData(prev => ({ ...prev, users: updated }));
    try {
      await saveUsersToSheet(updated);
      setToast({ msg: `Rolle für ${email} auf ${newRole} gesetzt.`, type: 'success' });
    } catch (e) {
      setToast({ msg: 'Fehler beim Speichern der Rolle', type: 'error' });
      // Revert
      setCurationData(prev => ({ ...prev, users: curationData.users }));
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddUser = async (email, role) => {
    if (!hasRole('ADMIN')) {
      setToast({ msg: 'Nur Admins können Nutzer hinzufügen.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (curationData.users.some(u => u.email === email)) {
      setToast({ msg: `${email} ist bereits eingetragen.`, type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const updated = [...curationData.users, { email, role, name: '' }];
    setCurationData(prev => ({ ...prev, users: updated }));
    try {
      await saveUsersToSheet(updated);
      setToast({ msg: `${email} hinzugefügt (${role}).`, type: 'success' });
    } catch (e) {
      setToast({ msg: 'Fehler beim Hinzufügen', type: 'error' });
      setCurationData(prev => ({ ...prev, users: curationData.users }));
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteUser = async (email) => {
    if (!hasRole('ADMIN')) {
      setToast({ msg: 'Nur Admins können Nutzer entfernen.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (email === authenticatedUser.email) {
      setToast({ msg: 'Du kannst dich nicht selbst entfernen.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!window.confirm(`Nutzer ${email} wirklich entfernen?`)) return;
    const updated = curationData.users.filter(u => u.email !== email);
    setCurationData(prev => ({ ...prev, users: updated }));
    try {
      await saveUsersToSheet(updated);
      setToast({ msg: `${email} entfernt.`, type: 'success' });
    } catch (e) {
      setToast({ msg: 'Fehler beim Löschen', type: 'error' });
      setCurationData(prev => ({ ...prev, users: curationData.users }));
    }
    setTimeout(() => setToast(null), 3000);
  };

  // --- STAGE MANAGEMENT ---
  const handleSaveStages = async (updatedStages) => {
    if (!hasRole('ADMIN')) {
      setToast({ msg: 'Nur Admins können Bühnen bearbeiten.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const prevStages = data.stages;
    setData(prev => ({ ...prev, stages: updatedStages }));
    try {
      const token = authenticatedUser.accessToken;
      const rows = updatedStages.map(s => [
        s.id, s.name, s.capacity || '', '', String(s.maxMics || 4), s.hidden ? 'TRUE' : ''
      ]);
      const { ok, error } = await fetchSheets({
        action: 'update',
        spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameStages}'!A2:F`,
        values: rows,
      }, token, config.curationApiUrl);
      if (!ok) throw new Error(error || 'Fehler beim Speichern der Bühnen');
      setToast({ msg: 'Bühnen gespeichert!', type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ msg: 'Fehler beim Speichern der Bühnen', type: 'error' });
      setData(prev => ({ ...prev, stages: prevStages }));
    }
    setTimeout(() => setToast(null), 3000);
  };

  // --- CONFIG_THEMEN MANAGEMENT ---
  const handleSaveConfigThemen = async (updatedConfig) => {
    if (!hasRole('ADMIN')) {
      setToast({ msg: 'Nur Admins können Themen bearbeiten.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const prevConfig = data.configThemen;
    setData(prev => ({ ...prev, configThemen: updatedConfig }));
    try {
      const token = authenticatedUser.accessToken;
      // Build rows: each row has [Bereich, Thema, Tag, Format]
      const maxLen = Math.max(
        updatedConfig.bereiche.length, updatedConfig.themen.length,
        updatedConfig.tags.length, updatedConfig.formate.length
      );
      const rows = [];
      for (let i = 0; i < maxLen; i++) {
        rows.push([
          updatedConfig.bereiche[i] || '',
          updatedConfig.themen[i] || '',
          updatedConfig.tags[i] || '',
          updatedConfig.formate[i] || ''
        ]);
      }
      const { ok, error } = await fetchSheets({
        action: 'update',
        spreadsheetId: config.spreadsheetId,
        range: `'Config_Themen'!A2:D`,
        values: rows,
      }, token, config.curationApiUrl);
      if (!ok) throw new Error(error || 'Fehler beim Speichern der Themen');
      setToast({ msg: 'Themen-Konfiguration gespeichert!', type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ msg: 'Fehler beim Speichern der Themen', type: 'error' });
      setData(prev => ({ ...prev, configThemen: prevConfig }));
    }
    setTimeout(() => setToast(null), 3000);
  };

  // --- OPEN CALL TOGGLE ---
  const [openCallClosed, setOpenCallClosed] = useState(false);

  const handleToggleOpenCall = async () => {
    if (!hasRole('ADMIN')) {
      setToast({ msg: 'Nur Admins können den Open Call steuern.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const newValue = !openCallClosed;
    if (!window.confirm(newValue ? 'Open Call wirklich schließen? Keine neuen Einreichungen mehr möglich.' : 'Open Call wieder öffnen?')) return;
    setOpenCallClosed(newValue);
    try {
      const token = authenticatedUser.accessToken;
      const { ok, error } = await fetchSheets({
        action: 'update',
        spreadsheetId: config.spreadsheetId,
        range: `'Config_Users'!D1:D1`,
        values: [[newValue ? 'CLOSED' : 'OPEN']],
      }, token, config.curationApiUrl);
      if (!ok) throw new Error(error);
      setToast({ msg: newValue ? 'Open Call geschlossen.' : 'Open Call geöffnet.', type: 'success' });
    } catch (e) {
      console.error(e);
      setOpenCallClosed(!newValue); // revert
      setToast({ msg: 'Fehler beim Speichern', type: 'error' });
    }
    setTimeout(() => setToast(null), 3000);
  };

  // --- Helper: Remove a speaker from all linked sessions ---
  const removeSpeakerFromSessions = async (speakerId, speakerName, token) => {
    const affectedSubs = data.submissions.filter(s => {
      const ids = (s.speakerIds || '').split(',').map(x => x.trim());
      return ids.includes(speakerId);
    });
    for (const sub of affectedSubs) {
      const oldIds = (sub.speakerIds || '').split(',').map(x => x.trim()).filter(Boolean);
      const oldNames = (sub.speakers || '').split(',').map(x => x.trim()).filter(Boolean);
      const newIds = oldIds.filter(id => id !== speakerId).join(', ');
      const newNames = oldNames.filter(n => n.toLowerCase() !== speakerName.toLowerCase()).join(', ');
      // Update columns M (Speaker_IDs) and N (Speaker_Names) in Master_Einreichungen
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'Master_Einreichungen'!M${sub.rowIndex}:N${sub.rowIndex}`,
        values: [[newIds, newNames]],
      }, token, config.curationApiUrl).catch(e => console.warn('Session update failed:', e));
      // Notify session creator
      if (sub.submitterEmail) {
        const n8nBase = (config.curationApiUrl || '').replace(/\/$/, '').replace(/\/api$/, '');
        fetch(`${n8nBase}/api/notify-speaker-removed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ speakerName, sessionTitle: sub.title, submitterEmail: sub.submitterEmail }),
        }).catch(() => { });
      }
    }
    return affectedSubs.length;
  };

  // --- SPEAKER PROFILE SAVE ---
  const handleSaveSpeakerProfile = async (updatedSpeaker) => {
    if (!config.curationApiUrl || !updatedSpeaker) return;
    try {
      const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
      const allSpeakers = data.speakers;
      const idx = allSpeakers.findIndex(s => s.id === updatedSpeaker.id);
      if (idx < 0) throw new Error('Speaker nicht gefunden');
      const rowNum = idx + 2;
      const nameParts = (updatedSpeaker.fullName || '').split(' ');
      const vorname = nameParts[0] || '';
      const nachname = nameParts.slice(1).join(' ') || '';
      // Update status (A column) if changed
      const oldStatus = (allSpeakers[idx]?.status || '').toLowerCase();
      const newStatus = (updatedSpeaker.status || '').toLowerCase();
      const becameInvisible = !oldStatus.includes('teilnehm') && newStatus.includes('teilnehm');
      if (becameInvisible || oldStatus !== newStatus) {
        await fetchSheets({
          action: 'update', spreadsheetId: config.spreadsheetId,
          range: `'${config.sheetNameSpeakers}'!A${rowNum}`,
          values: [[updatedSpeaker.status || 'CFP']],
        }, token, config.curationApiUrl);
      }
      // Update name columns D-I
      const { ok: ok1, error: err1 } = await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!D${rowNum}:I${rowNum}`,
        values: [[vorname, nachname, updatedSpeaker.pronoun || '', updatedSpeaker.organisation || '', updatedSpeaker.bio || '', updatedSpeaker.webseite || '']],
      }, token, config.curationApiUrl);
      if (!ok1) throw new Error(err1);
      // Update herkunft (M) and sprache (N)
      const { ok: ok2, error: err2 } = await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!M${rowNum}:N${rowNum}`,
        values: [[updatedSpeaker.herkunft || '', updatedSpeaker.sprache || '']],
      }, token, config.curationApiUrl);
      if (!ok2) throw new Error(err2);
      // Update social media: AA-AC
      const { ok: ok3, error: err3 } = await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!AA${rowNum}:AC${rowNum}`,
        values: [[updatedSpeaker.instagram || '', updatedSpeaker.linkedin || '', updatedSpeaker.socialSonstiges || '']],
      }, token, config.curationApiUrl);
      if (!ok3) throw new Error(err3);
      // Update phone (L)
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!L${rowNum}`,
        values: [[updatedSpeaker.telefon || '']],
      }, token, config.curationApiUrl);
      // Update address (AF) — replace commas with semicolons for CSV safety
      const safeAddress = (updatedSpeaker.adresse || '').replace(/,/g, ';');
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!AF${rowNum}`,
        values: [[safeAddress]],
      }, token, config.curationApiUrl);
      // Update ansprache (AK)
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!AK${rowNum}`,
        values: [[updatedSpeaker.ansprache || '']],
      }, token, config.curationApiUrl);
      // If speaker became invisible, remove from all linked sessions
      if (becameInvisible) {
        const removed = await removeSpeakerFromSessions(updatedSpeaker.id, updatedSpeaker.fullName, token);
        if (removed > 0) {
          setToast({ msg: `Profil gespeichert! Du wurdest aus ${removed} Session(s) entfernt.`, type: 'success' });
        } else {
          setToast({ msg: 'Profil gespeichert!', type: 'success' });
        }
      } else {
        setToast({ msg: 'Profil gespeichert!', type: 'success' });
      }
      setTimeout(() => setToast(null), 3000);
      loadData({ manual: true });
      setViewMode('SUBMIT');
    } catch (e) {
      console.error('Profile save error:', e);
      setToast({ msg: 'Fehler beim Speichern des Profils', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // --- PROFILE DELETION (GDPR) ---
  const handleDeleteProfile = async () => {
    if (!config.curationApiUrl || !mySpeakerRecord) return;
    try {
      const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
      const allSpeakers = data.speakers;
      const idx = allSpeakers.findIndex(s => s.id === mySpeakerRecord.id);
      if (idx < 0) throw new Error('Speaker nicht gefunden');
      const rowNum = idx + 2;
      // 1) Remove speaker from all linked sessions + notify creators
      await removeSpeakerFromSessions(mySpeakerRecord.id, mySpeakerRecord.fullName, token);
      // 2) Clear personal data (D-N, AA-AC) and set status to "Gelöscht"
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!A${rowNum}:N${rowNum}`,
        values: [['Gelöscht', '', mySpeakerRecord.id, '', '', '', '', '', '', '', '', '', '', '']],
      }, token, config.curationApiUrl);
      // Clear social media columns
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!AA${rowNum}:AC${rowNum}`,
        values: [['', '', '']],
      }, token, config.curationApiUrl);
      // Clear address (AF) — GDPR personal data
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!AF${rowNum}`,
        values: [['']],
      }, token, config.curationApiUrl);
      // Clear ansprache (AK) — GDPR personal data
      await fetchSheets({
        action: 'update', spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!AK${rowNum}`,
        values: [['']],
      }, token, config.curationApiUrl);
      // 3) Remove from Config_Users — find row and clear it
      const email = authenticatedUser.email?.toLowerCase() || '';
      const configIdx = curationData.users.findIndex(u => u.email.toLowerCase() === email);
      if (configIdx >= 0) {
        const configRow = configIdx + 2; // 1-indexed + header row
        await fetchSheets({
          action: 'update', spreadsheetId: config.spreadsheetId,
          range: `'Config_Users'!A${configRow}:C${configRow}`,
          values: [['[gelöscht]', 'GELÖSCHT', '']],
        }, token, config.curationApiUrl);
      }
      // 4) Logout
      setToast({ msg: 'Dein Profil wurde gelöscht. Alle personenbezogenen Daten wurden entfernt.', type: 'success' });
      setTimeout(() => { handleLogout(); }, 2000);
    } catch (e) {
      console.error('Profile delete error:', e);
      setToast({ msg: 'Fehler beim Löschen des Profils', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // --- SPEAKER SELF-REGISTRATION ---
  const handleRegisterSpeakerProfile = async (newSpeaker) => {
    if (!config.curationApiUrl || !newSpeaker) return;
    try {
      const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
      const id = `SPK-${Date.now()}`;
      const registeredAm = new Date().toISOString();
      // Append to Kosmos_SprecherInnen:
      //   A=Status_Einladung, B=Status_Backend, C=ID, D=Vorname, E=Nachname,
      //   F=Pronomen, G=Organisation, H=Bio, I=Webseite, J=Update, K=E-Mail, L=Telefon,
      //   M=Herkunft, N=Sprache, O=Registriert_am, P=Registriert_von,
      //   Q-Z=Financial/Travel, AA=Instagram, AB=LinkedIn, AC=Sonstige, AD=Zeitstempel
      const nameParts = (newSpeaker.fullName || '').split(' ');
      const vorname = nameParts[0] || '';
      const nachname = nameParts.slice(1).join(' ') || '';
      const safeAddr = (newSpeaker.adresse || '').replace(/,/g, ';');
      const row = [
        newSpeaker.status || 'CFP',  // A - Status_Einladung
        '',                           // B - Status_Backend
        id,                           // C - ID
        vorname,                      // D
        nachname,                     // E
        newSpeaker.pronoun || '',     // F
        newSpeaker.organisation || '',// G
        newSpeaker.bio || '',         // H
        newSpeaker.webseite || '',    // I
        '',                           // J - Update
        newSpeaker.email || '',       // K - E-Mail
        newSpeaker.telefon || '',     // L - Telefon
        newSpeaker.herkunft || '',    // M
        newSpeaker.sprache || '',     // N
        registeredAm,                 // O
        authenticatedUser.email || '',// P
        '', '', '', '', '', '', '', '', '', '', // Q-Z (Q=Honorar, W=Hotel, Z=Briefing, rest reserved)
        newSpeaker.instagram || '',   // AA - Instagram
        newSpeaker.linkedin || '',    // AB - LinkedIn
        newSpeaker.socialSonstiges || '', // AC - Sonstige Social Media
        registeredAm,                 // AD - Zeitstempel
        'nicht benötigt',              // AE - Status_Vertrag (default)
        safeAddr,                     // AF - Adresse
        'FALSE',                      // AG - Ehrenamtsvergütung (default)
        '',                           // AH - Catering
        '',                           // AI - Anreise Am
        '',                           // AJ - Abreise Am
        newSpeaker.ansprache || ''    // AK - Ansprache
      ];
      const { ok, error } = await fetchSheets({
        action: 'append',
        spreadsheetId: config.spreadsheetId,
        range: `'${config.sheetNameSpeakers}'!A2:AK`,
        values: [row],
      }, token, config.curationApiUrl);
      if (!ok) throw new Error(error || 'Registrierung fehlgeschlagen');
      setToast({ msg: 'Profil angelegt!', type: 'success' });
      setTimeout(() => setToast(null), 3000);
      loadData({ manual: false });
      setViewMode('SUBMIT'); // redirect to dashboard after registration
    } catch (e) {
      console.error('Speaker registration error:', e);
      setToast({ msg: 'Fehler bei der Registrierung', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // --- CURATION ACTIONS ---
  const handleUpdateCurationStatus = async (sessionId, newStatus) => {
    if (!config.curationApiUrl) {
      setToast({ msg: "Keine n8n API URL konfiguriert!", type: "error" });
      return;
    }

    try {
      // Optimistic Update
      setCurationData(prev => prev.map(s => s.id === sessionId ? { ...s, status: newStatus } : s));

      const res = await fetch(config.curationApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authenticatedUser.accessToken}`,
        },
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

    // Map field names to Master_Einreichungen columns
    const FIELD_TO_COL = {
      status: 'D', format: 'H', thema: 'I', bereich: 'J',
      sprache: 'K', tags: 'U'
    };
    const col = FIELD_TO_COL[field];
    if (!col) {
      console.warn(`Unknown metadata field: ${field}`);
      return;
    }

    // Find the session's rowIndex from submissions (Master_Einreichungen)
    const session = data.submissions.find(s => s.id === sessionId);
    if (!session || !session.rowIndex) {
      console.warn(`Session ${sessionId} not found in submissions`);
      setToast({ msg: 'Session nicht gefunden', type: 'error' });
      return;
    }

    try {
      const token = authenticatedUser.accessToken;

      // Optimistic local update (submissions = source of truth)
      setData(prev => ({
        ...prev,
        submissions: prev.submissions.map(s => s.id === sessionId ? { ...s, [field]: newValue } : s),
        program: prev.program.map(s => s.id === sessionId ? { ...s, [field]: newValue } : s)
      }));

      // Write to Master_Einreichungen
      const { ok, error } = await fetchSheets({
        action: 'update',
        spreadsheetId: config.spreadsheetId,
        range: `'Master_Einreichungen'!${col}${session.rowIndex}`,
        values: [[newValue]],
      }, token, config.curationApiUrl);

      if (!ok) throw new Error(error || 'Speichern fehlgeschlagen');
      setToast({ msg: `${field} aktualisiert`, type: 'success' });
      setTimeout(() => setToast(null), 2000);
    } catch (e) {
      console.error('Metadata update failed:', e);
      setToast({ msg: `Fehler: ${e.message}`, type: 'error' });
      setTimeout(() => setToast(null), 3000);
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
      const token = authenticatedUser.accessToken;

      // --- Solution A: Write planning columns P-W to Master_Einreichungen ---
      // Build rows for columns P-W aligned to rowIndex
      // P=Bühne, Q=Startzeit, R=Endzeit, S=Partner, T=Stage_Dispo, U=Tags, V=Moderators, W=Session_ID
      const maxRow = Math.max(...data.program.map(p => p.rowIndex || 2), 2);
      const planningRows = [];
      for (let row = 2; row <= maxRow; row++) {
        const p = data.program.find(item => item.rowIndex === row);
        if (p) {
          const modsStr = Array.isArray(p.moderators) ? p.moderators.join(', ') : (p.moderators || '');
          planningRows.push([
            p.stage === INBOX_ID ? '' : safeString(p.stage),  // P: Bühne
            p.start === '-' ? '' : p.start,                   // Q: Startzeit
            p.start === '-' ? '' : calculateEndTime(p.start, p.duration), // R: Endzeit
            safeString(p.partner),                             // S: Partner/Org name
            safeString(p.stageDispo),                          // T: Stage_Dispo
            safeString(p.tags),                                // U: Tags
            modsStr,                                           // V: Moderators
            safeString(p.id)                                   // W: Session_ID
          ]);
        } else {
          planningRows.push(['', '', '', '', '', '', '', '']);
        }
      }

      const { ok, error } = await fetchSheets({
        action: 'update',
        spreadsheetId: config.spreadsheetId,
        range: `'Master_Einreichungen'!P2:W`,
        values: planningRows,
      }, token, config.curationApiUrl);

      if (!ok) throw new Error(error || 'Sheets API Fehler');



      setStatus({ loading: false, error: null });
      setLocalChanges(false);
      setToast({ msg: 'Programm gespeichert!', type: "success" });
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

    // --- SESSION FIXATION WEBHOOK ---
    // Fire webhook when status is "Fixiert" and n8n is configured
    if (finalSession.status === 'Fixiert' && config.n8nBaseUrl) {
      const stageName = data.stages.find(st => st.id === finalSession.stage)?.name || finalSession.stage || '';
      const endTime = calculateEndTime(finalSession.start, finalSession.duration);

      // Resolve speaker emails from data.speakers
      const speakerNames = safeString(typeof finalSession.speakers === 'string' ? finalSession.speakers : (finalSession.speakers || []).join(', '))
        .split(',').map(n => n.trim()).filter(Boolean);
      const speakerEmails = speakerNames
        .map(name => data.speakers.find(sp => sp.fullName.toLowerCase() === name.toLowerCase())?.email)
        .filter(Boolean);

      // Detect schedule change: was previously Fixiert and time/stage changed
      const wasFixiert = editingSession && editingSession.status === 'Fixiert';
      const timeChanged = editingSession && (editingSession.start !== finalSession.start || editingSession.stage !== finalSession.stage);
      const isScheduleChange = wasFixiert && timeChanged;

      if (isScheduleChange) {
        // --- SCHEDULE CHANGE NOTIFICATION ---
        const oldStageName = data.stages.find(st => st.id === editingSession.stage)?.name || editingSession.stage || '';
        const oldEnd = calculateEndTime(editingSession.start, editingSession.duration);

        const changePayload = {
          type: 'schedule_change',
          Session_Title: finalSession.title || '',
          Submitter_Email: finalSession.submitterEmail || '',
          Submitter_Name: finalSession.submitterName || '',
          Old_Start: editingSession.start || '',
          Old_End: oldEnd || '',
          Old_Stage: oldStageName,
          New_Start: finalSession.start || '',
          New_End: endTime || '',
          New_Stage: stageName,
          Speaker_Email: speakerEmails
        };

        fetch(`${config.n8nBaseUrl}/schedule-change`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changePayload)
        })
          .then(res => {
            if (res.ok) {
              setToast({ msg: `📧 Terminänderung an ${finalSession.submitterEmail || 'Einreicher·in'} gesendet!`, type: 'success' });
            } else {
              setToast({ msg: `⚠️ Terminänderungs-Mail fehlgeschlagen: HTTP ${res.status}`, type: 'error' });
            }
            setTimeout(() => setToast(null), 4000);
          })
          .catch(err => {
            console.warn('Schedule change webhook failed:', err);
            setToast({ msg: '⚠️ Terminänderungs-Mail konnte nicht gesendet werden.', type: 'error' });
            setTimeout(() => setToast(null), 4000);
          });
      } else {
        // --- FIRST-TIME FIXATION ---
        const webhookPayload = {
          Session_Title: finalSession.title || '',
          Description_Full: finalSession.description || finalSession.shortDescription || '',
          Start_Time: finalSession.start || '',
          End_Time: endTime || '',
          Stage_Name: stageName,
          Speaker_Email: speakerEmails
        };

        fetch(`${config.n8nBaseUrl}/session-fixation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload)
        })
          .then(res => {
            if (res.ok) {
              setToast({ msg: `📧 Fixierungs-Mail an ${speakerEmails.length} Speaker gesendet!`, type: 'success' });
            } else {
              setToast({ msg: `⚠️ Webhook-Fehler: HTTP ${res.status}`, type: 'error' });
            }
            setTimeout(() => setToast(null), 4000);
          })
          .catch(err => {
            console.warn('Session fixation webhook failed:', err);
            setToast({ msg: '⚠️ Fixierungs-Mail konnte nicht gesendet werden.', type: 'error' });
            setTimeout(() => setToast(null), 4000);
          });
      }
    }

    // --- LIVE MODE: Notify on ANY status change ---
    if (liveMode && config.n8nBaseUrl && editingSession) {
      const oldStatus = editingSession.status || '';
      const newStatus = finalSession.status || '';
      if (oldStatus !== newStatus) {
        const stageName = data.stages.find(st => st.id === finalSession.stage)?.name || '';
        fetch(`${config.n8nBaseUrl}/live-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: finalSession.id,
            sessionTitle: finalSession.title,
            oldStatus,
            newStatus,
            stageName,
            start: finalSession.start,
            end: calculateEndTime(finalSession.start, finalSession.duration),
            changedBy: authenticatedUser.email,
            timestamp: new Date().toISOString()
          })
        }).catch(e => console.warn('[LiveMode] Webhook error:', e));
      }
    }
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
                    {searchQuery && searchResults.length > 0 && (
                      <div className="text-[10px] text-indigo-500 font-bold px-2 mt-0.5">
                        🔍 {searchResults.length} Treffer ({searchResults.filter(id => data.program.find(p => p.id === id)?.stage !== INBOX_ID).length} auf Bühnen)
                      </div>
                    )}
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
                {curationData.userRole !== 'GUEST' && (
                  <button
                    onClick={handleSync}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all ${localChanges ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md animate-pulse' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Speichern</span>
                  </button>
                )}
                <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-slate-100 rounded text-slate-500">
                  <Settings className="w-4 h-4" />
                </button>

                {/* Profile Avatar & Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-slate-100 transition-colors"
                    title={`${authenticatedUser.name || authenticatedUser.email} (${curationData.userRole})`}
                  >
                    {authenticatedUser.picture ? (
                      <img src={authenticatedUser.picture} alt="Profile" className="w-7 h-7 rounded-full border-2 border-indigo-300" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                        {(authenticatedUser.name || authenticatedUser.email || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>

                  {showProfileMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-slate-200">
                          <div className="flex items-center gap-3">
                            {authenticatedUser.picture ? (
                              <img src={authenticatedUser.picture} alt="Profile" className="w-12 h-12 rounded-full border-2 border-white shadow-sm" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">
                                {(authenticatedUser.name || authenticatedUser.email || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 truncate">{authenticatedUser.name || 'User'}</p>
                              <p className="text-xs text-slate-500 truncate">{authenticatedUser.email}</p>
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${hasRole('ADMIN') ? 'bg-red-100 text-red-700' :
                                hasRole('CURATOR') ? 'bg-purple-100 text-purple-700' :
                                  hasRole('REVIEWER') ? 'bg-blue-100 text-blue-700' :
                                    hasRole('PRODUCTION') ? 'bg-orange-100 text-orange-700' :
                                      hasRole('SPEAKER') ? 'bg-emerald-100 text-emerald-700' :
                                        hasRole('TEILNEHMENDE', 'SPEAKER') ? 'bg-cyan-100 text-cyan-700' :
                                          hasRole('PARTNER') ? 'bg-amber-100 text-amber-700' :
                                            hasRole('BAND') ? 'bg-pink-100 text-pink-700' :
                                              'bg-slate-100 text-slate-600'
                                }`}>{userRoles.join(', ')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="p-2">
                          <button
                            onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                          >
                            <LogOut className="w-4 h-4" />
                            Abmelden & Konto wechseln
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
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
                                onToggleLock={(s) => updateSession(s.id, { status: s.status === 'Fixiert' ? 'Akzeptiert' : 'Fixiert' })}
                                isFavorite={favorites.has(p.id)}
                                onToggleFavorite={toggleFavorite}
                                userRole={effectiveRole}
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
                    <div className="w-10 bg-white border-r shrink-0 sticky left-0 z-30 shadow-sm" style={{ minHeight: timelineHeight + HEADER_HEIGHT }}>
                      {Array.from({ length: config.endHour - config.startHour }).map((_, i) => {
                        const hour = config.startHour + i;
                        return (
                          <div
                            key={hour}
                            className="absolute w-full border-t border-slate-200 text-[10px] font-bold text-slate-400 pl-1 pt-0.5"
                            style={{ top: HEADER_HEIGHT + i * 60 * PIXELS_PER_MINUTE }}
                          >
                            {hour}:00
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex min-w-full">
                      {data.stages.filter(s => hasRole('ADMIN') || !s.hidden).map(stage => {
                        const stageSessions = data.program.filter(p => p.stage === stage.id);
                        return (
                          <StageColumn key={stage.id} stage={stage} height={timelineHeight}>
                            {stageSessions.map(session => {
                              // Search Highlighting (Dimming + Glow)
                              let isDimmed = false;
                              let isMatch = false;
                              if (searchQuery) {
                                const q = searchQuery.toLowerCase();
                                const matches =
                                  safeString(session.title).toLowerCase().includes(q) ||
                                  safeString(session.id).toLowerCase().includes(q) ||
                                  safeString(session.speakers).toLowerCase().includes(q) ||
                                  safeString(session.moderators).toLowerCase().includes(q) ||
                                  safeString(session.partner).replace(/^pending:/, '').toLowerCase().includes(q);
                                if (!matches) isDimmed = true;
                                else isMatch = true;
                              }

                              return (
                                <DraggableTimelineItem
                                  key={session.id}
                                  session={session}
                                  style={{
                                    ...getPos(session.start, session.duration),
                                    opacity: isDimmed ? 0.08 : 1,
                                    filter: isDimmed ? 'grayscale(1) blur(1px)' : 'none',
                                    boxShadow: isMatch ? '0 0 0 3px #6366f1, 0 0 12px rgba(99,102,241,0.4)' : '',
                                    zIndex: isMatch ? 50 : undefined,
                                    transition: 'opacity 0.3s, filter 0.3s, box-shadow 0.3s'
                                  }}
                                  onClick={() => { setEditingSession(session); setIsModalOpen(true) }}
                                  onToggleLock={(s) => updateSession(s.id, { status: s.status === 'Fixiert' ? 'Akzeptiert' : 'Fixiert' })}
                                  isFavorite={favorites.has(session.id)}
                                  onToggleFavorite={toggleFavorite}
                                  userRole={effectiveRole}
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
                ...data.submissions
              ]}
              metadata={{ ...curationData.metadata, ...data.configThemen }}
              userRole={effectiveRole}
              userEmail={authenticatedUser.email || ''}
              ratings={data.ratings}
              speakers={data.speakers}
              users={curationData.users || []}
              onUpdateMetadata={handleUpdateCurationMetadata}
              onAddTag={async (newTag) => {
                if (!config.curationApiUrl) return;
                try {
                  const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
                  // Find the row to write: next empty row in column C
                  // Config_Themen rows start at row 2, tags are in column C
                  const existingTags = data.configThemen.tags || [];
                  const tagRow = existingTags.length + 2; // row 2 is first data row
                  const { ok, error } = await fetchSheets({
                    action: 'update',
                    spreadsheetId: config.spreadsheetId,
                    range: `'Config_Themen'!C${tagRow}`,
                    values: [[newTag]],
                  }, token, config.curationApiUrl);
                  if (!ok) throw new Error(error);
                  // Optimistic: add tag to local config
                  setData(prev => ({
                    ...prev,
                    configThemen: {
                      ...prev.configThemen,
                      tags: [...prev.configThemen.tags, newTag]
                    }
                  }));
                  setToast({ msg: `Tag "${newTag}" hinzugefügt`, type: 'success' });
                  setTimeout(() => setToast(null), 2000);
                } catch (e) {
                  console.error('Tag add failed:', e);
                  setToast({ msg: 'Tag konnte nicht gespeichert werden', type: 'error' });
                  setTimeout(() => setToast(null), 3000);
                }
              }}
              onSaveRating={async (sessionId, score, kommentar) => {
                if (!config.curationApiUrl) return;
                try {
                  const token = authenticatedUser.accessToken;
                  const timestamp = new Date().toISOString();
                  const reviewerEmail = authenticatedUser.email || '';
                  if (import.meta.env.DEV) console.log('[onSaveRating]', { sessionId, score, reviewerEmail });
                  const { ok, error } = await fetchSheets({
                    action: 'append',
                    spreadsheetId: config.spreadsheetId,
                    range: `'Master_Ratings'!A2:F`,
                    values: [[timestamp, sessionId, reviewerEmail, String(score), kommentar || '', 'relevanz']],
                  }, token, config.curationApiUrl);
                  if (!ok) throw new Error(error || 'Rating save failed');
                  setToast({ msg: `Bewertung gespeichert (${score}★)`, type: 'success' });
                  setTimeout(() => setToast(null), 3000);
                  loadData({ manual: false }); // quietly reload to show updated ratings
                } catch (e) {
                  console.error('Rating save failed:', e);
                  setToast({ msg: 'Bewertung fehlgeschlagen', type: 'error' });
                  setTimeout(() => setToast(null), 3000);
                }
              }}
            />
          </div>
        )}

        {viewMode === 'ADMIN' && hasRole('ADMIN', 'REVIEWER') && (
          <div className="flex flex-col h-full overflow-hidden">
            <header className="bg-indigo-900 text-white px-4 py-2 flex justify-between items-center shadow-lg shrink-0">
              <h1 className="font-bold flex items-center gap-2"><Shield className="w-5 h-5" /> Admin Control Panel</h1>
              <div className="flex items-center gap-3">
                {/* Live Mode Toggle */}
                <button
                  onClick={toggleLiveMode}
                  className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full transition-all font-bold uppercase tracking-wider border ${liveMode
                    ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/30 animate-pulse'
                    : 'bg-indigo-800 border-indigo-600 text-indigo-200 hover:bg-indigo-700'
                    }`}
                >
                  <span className={`w-2 h-2 rounded-full ${liveMode ? 'bg-white' : 'bg-indigo-400'}`} />
                  {liveMode ? '🔴 LIVE' : 'Live Mode'}
                </button>
                <button onClick={() => setViewMode('PLANNER')} className="text-xs bg-indigo-800 hover:bg-indigo-700 px-3 py-1 rounded transition-colors uppercase font-bold tracking-widest">Planner View</button>
              </div>
            </header>
            <AdminDashboard
              users={curationData.users || []}
              stages={data.stages}
              config={config}
              configThemen={data.configThemen}
              curationApiUrl={config.curationApiUrl}
              userEmail={authenticatedUser.email || ''}
              readOnly={!hasRole('ADMIN')}
              onUpdateUserRole={handleUpdateUserRole}
              onAddUser={handleAddUser}
              onDeleteUser={handleDeleteUser}
              onSaveStages={handleSaveStages}
              onSaveConfigThemen={handleSaveConfigThemen}
              openCallClosed={openCallClosed}
              onToggleOpenCall={handleToggleOpenCall}
              onInviteUser={async (email) => {
                if (!config.curationApiUrl) { setToast({ msg: 'API nicht konfiguriert', type: 'error' }); return; }
                try {
                  const baseUrl = config.curationApiUrl.replace(/\/$/, '').replace(/\/api$/, '');
                  const res = await fetch(`${baseUrl}/auth/request-magic-link`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authenticatedUser.accessToken || authenticatedUser.magicToken}` },
                    body: JSON.stringify({ email: email.toLowerCase().trim(), adminInvite: true })
                  });
                  const data = await res.json();
                  if (data.ok) {
                    setToast({ msg: `Magic Link an ${email} gesendet!`, type: 'success' });
                  } else {
                    setToast({ msg: data.error || 'Fehler beim Senden', type: 'error' });
                  }
                } catch (e) {
                  console.error('Invite error:', e);
                  setToast({ msg: 'Verbindungsfehler', type: 'error' });
                }
                setTimeout(() => setToast(null), 3000);
              }}
              onUpdateConfig={(newSettings) => {
                setConfig(prev => ({ ...prev, ...newSettings }));
                if (newSettings.startHour !== undefined) localStorage.setItem('kosmos_start_hour', String(newSettings.startHour));
                if (newSettings.endHour !== undefined) localStorage.setItem('kosmos_end_hour', String(newSettings.endHour));
                if (newSettings.bufferMin !== undefined) localStorage.setItem('kosmos_buffer_min', String(newSettings.bufferMin));
                if (newSettings.maxSubmissions !== undefined) {
                  localStorage.setItem('kosmos_max_submissions', String(newSettings.maxSubmissions));
                  // Also persist to Config_Themen column E (single source of truth)
                  const token = authenticatedUser.accessToken;
                  fetchSheets({
                    action: 'update',
                    spreadsheetId: config.spreadsheetId,
                    range: `'Config_Themen'!E2`,
                    values: [[String(newSettings.maxSubmissions)]],
                  }, token, config.curationApiUrl).then(({ ok }) => {
                    if (ok) {
                      setData(prev => ({
                        ...prev,
                        configThemen: { ...prev.configThemen, maxSubmissions: newSettings.maxSubmissions }
                      }));
                    }
                  }).catch(console.error);
                }
                setToast({ msg: 'Programmeinstellungen gespeichert!', type: 'success' });
                setTimeout(() => setToast(null), 3000);
              }}
            />
          </div>
        )}

        {viewMode === 'ORG_DASHBOARD' && hasRole('ADMIN', 'REVIEWER') && (
          <div className="flex flex-col h-full overflow-hidden">
            <header className="bg-blue-900 text-white px-4 py-2 flex justify-between items-center shadow-lg shrink-0">
              <h1 className="font-bold flex items-center gap-2">🏢 Organisations-Dashboard</h1>
              <span className="text-xs text-blue-300">{(data.organisations || []).length} Organisationen</span>
            </header>
            <div className="flex-1 overflow-auto p-4">
              <div className="max-w-5xl mx-auto">
                {(data.organisations || []).length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-400">
                    <p className="text-sm">Noch keine Organisationen in Config_Organisations hinterlegt.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">Organisation</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">E-Mail</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">Sessions</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">Links</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.organisations || []).map((org, i) => {
                          const orgSessions = data.program.filter(s => (s.partner || '').toLowerCase() === (org.name || '').toLowerCase());
                          const isConfirmed = org.status === 'bestätigt';
                          const isExpanded = expandedOrgEmail === org.email;
                          return (
                            <React.Fragment key={org.email || i}>
                              <tr className={`border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''}`} onClick={() => setExpandedOrgEmail(isExpanded ? null : org.email)}>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    {org.logoUrl && <img src={org.logoUrl} alt="" className="w-8 h-8 rounded object-cover border" />}
                                    <div>
                                      <div className="font-bold text-slate-800">{org.name || '—'}</div>
                                      {org.beschreibung && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{org.beschreibung}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-slate-600 text-xs">{org.email}</td>
                                <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                  {hasRole('ADMIN') ? (
                                    <button
                                      onClick={async () => {
                                        const newStatus = isConfirmed ? 'ausstehend' : 'bestätigt';
                                        const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
                                        try {
                                          const { ok, error } = await fetchSheets({
                                            action: 'update', spreadsheetId: config.spreadsheetId,
                                            range: `'Config_Organisations'!I${org.rowIndex}`,
                                            values: [[newStatus]]
                                          }, token, config.curationApiUrl);
                                          if (!ok) throw new Error(error);
                                          setData(prev => ({
                                            ...prev,
                                            organisations: prev.organisations.map(o => o.email === org.email ? { ...o, status: newStatus } : o)
                                          }));
                                          setToast({ msg: `${org.name}: ${newStatus}`, type: 'success' });
                                          setTimeout(() => setToast(null), 2000);
                                        } catch (e) {
                                          setToast({ msg: `Fehler: ${e.message}`, type: 'error' });
                                          setTimeout(() => setToast(null), 3000);
                                        }
                                      }}
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${isConfirmed
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                        }`}
                                    >
                                      {isConfirmed ? '✓ Bestätigt' : '⏳ Ausstehend'}
                                    </button>
                                  ) : (
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${isConfirmed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                      {isConfirmed ? '✓ Bestätigt' : '⏳ Ausstehend'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`text-xs font-bold ${orgSessions.length > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                                    {isExpanded ? '▼' : '▶'} {orgSessions.length} Session{orgSessions.length !== 1 ? 's' : ''}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2 text-[10px]">
                                    {org.webseite && <a href={org.webseite} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline" onClick={e => e.stopPropagation()}>🌐</a>}
                                    {org.instagram && <span className="text-pink-500">📷</span>}
                                    {org.linkedin && <span className="text-blue-600">💼</span>}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && orgSessions.length > 0 && (
                                <tr>
                                  <td colSpan="5" className="bg-slate-50 px-4 py-3">
                                    <div className="space-y-2 max-w-3xl">
                                      {orgSessions.map((session, si) => {
                                        const statusLower = (session.status || '').toLowerCase();
                                        const isFixed = statusLower === 'fixiert';
                                        const isAccepted = statusLower === 'akzeptiert';
                                        const stageName = data.stages.find(s => s.id === session.stage)?.name || '';
                                        return (
                                          <div key={session.id || si}
                                            onClick={() => { setEditingSession(session); setIsModalOpen(true); }}
                                            className={`border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow ${isFixed ? 'border-green-200 bg-green-50/50' : isAccepted ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white'}`}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <h4 className="text-sm font-bold text-slate-800">{session.title || 'Ohne Titel'}</h4>
                                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${isFixed ? 'bg-green-100 text-green-700' : isAccepted ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {session.status || 'Vorschlag'}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                                              {stageName && <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">{stageName}</span>}
                                              {session.start && session.start !== '-' && <span>🕐 {session.start} – {session.end || ''}</span>}
                                              {session.speakers && <span>🎤 {session.speakers}</span>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'SPRECHERIN_DASHBOARD' && hasRole('ADMIN', 'REVIEWER') && (() => {
          const allSpeakers = data.speakers || [];
          const filterMap = {
            'ALL': () => true,
            'VORSCHLAG': s => (s.status || '').toLowerCase().includes('vorschlag'),
            'AKZEPTIERT': s => (s.status || '').toLowerCase().includes('zusage') || (s.status || '').toLowerCase().includes('akzeptiert'),
            'FIXIERT': s => (s.status || '').toLowerCase().includes('fixiert') || (s.status || '').toLowerCase().includes('eingeladen'),
            'CFP': s => (s.status || '').toLowerCase().includes('cfp') && !(s.status || '').toLowerCase().includes('dummy'),
            'DUMMY': s => (s.status || '').toLowerCase().includes('dummy'),
          };
          const filtered = allSpeakers.filter(filterMap[speakerDashFilter] || (() => true));
          const filterTabs = [
            { key: 'ALL', label: 'Alle', count: allSpeakers.length },
            { key: 'CFP', label: 'CFP', count: allSpeakers.filter(filterMap.CFP).length },
            { key: 'AKZEPTIERT', label: 'Zugesagt', count: allSpeakers.filter(filterMap.AKZEPTIERT).length },
            { key: 'FIXIERT', label: 'Fixiert/Eingeladen', count: allSpeakers.filter(filterMap.FIXIERT).length },
            { key: 'DUMMY', label: 'Dummies', count: allSpeakers.filter(filterMap.DUMMY).length },
          ];

          const updateSpeakerField = async (speaker, col, value) => {
            const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
            const idx = allSpeakers.findIndex(s => s.id === speaker.id);
            if (idx < 0) return;
            const rowNum = idx + 2;
            try {
              const { ok, error } = await fetchSheets({
                action: 'update', spreadsheetId: config.spreadsheetId,
                range: `'${config.sheetNameSpeakers}'!${col}${rowNum}`,
                values: [[value]]
              }, token, config.curationApiUrl);
              if (!ok) throw new Error(error);
              // Optimistic update
              const fieldMap = { Q: 'honorar', W: 'hotel', Z: 'briefing', AE: 'vertragStatus', AG: 'ehrenamtsverguetung', AH: 'catering', AI: 'anreiseAm', AJ: 'abreiseAm' };
              const field = fieldMap[col];
              if (field) {
                const parsedVal = col === 'AG' ? (value === 'TRUE') : value;
                setData(prev => ({
                  ...prev,
                  speakers: prev.speakers.map(s => s.id === speaker.id ? { ...s, [field]: parsedVal } : s)
                }));
              }
              setToast({ msg: `${speaker.fullName}: aktualisiert`, type: 'success' });
              setTimeout(() => setToast(null), 2000);
            } catch (e) {
              setToast({ msg: `Fehler: ${e.message}`, type: 'error' });
              setTimeout(() => setToast(null), 3000);
            }
          };

          return (
            <div className="flex flex-col h-full overflow-hidden">
              <header className="bg-purple-900 text-white px-4 py-2 flex justify-between items-center shadow-lg shrink-0">
                <h1 className="font-bold flex items-center gap-2">🎤 SprecherInnen-Dashboard</h1>
                <span className="text-xs text-purple-300">{filtered.length} / {allSpeakers.length} SprecherInnen</span>
              </header>
              <div className="flex-1 overflow-auto p-4">
                <div className="max-w-6xl mx-auto">
                  {/* Filter tabs */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {filterTabs.map(tab => (
                      <button key={tab.key} onClick={() => { setSpeakerDashFilter(tab.key); setExpandedSpeakerId(null); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${speakerDashFilter === tab.key ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {tab.label} ({tab.count})
                      </button>
                    ))}
                  </div>

                  {filtered.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-400">
                      <p className="text-sm">Keine SprecherInnen in dieser Kategorie.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Name</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Status</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Briefing</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Sessions</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Profil</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Reise</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Honorar</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Catering</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Vertrag</th>
                              <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-500 uppercase">Ehrenamt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((spk, i) => {
                              const isDummy = (spk.status || '').toLowerCase().includes('dummy');
                              const isCreatedByOther = spk.registeredBy && spk.email && spk.registeredBy.toLowerCase() !== spk.email.toLowerCase();
                              const profileComplete = Boolean(spk.bio && spk.telefon && spk.adresse);
                              const spkSessions = data.program.filter(s => {
                                const names = (s.speakers || '').toLowerCase();
                                return names.includes((spk.fullName || '').toLowerCase()) || names.includes((spk.id || '').toLowerCase());
                              });
                              const isExpanded = expandedSpeakerId === spk.id;
                              const isAdmin = hasRole('ADMIN');
                              // Calculate hotel nights from dates
                              const calcNights = () => {
                                if (!spk.anreiseAm || !spk.abreiseAm) return null;
                                const a = new Date(spk.anreiseAm), b = new Date(spk.abreiseAm);
                                if (isNaN(a) || isNaN(b)) return null;
                                return Math.max(0, Math.round((b - a) / 86400000));
                              };
                              const nights = calcNights();
                              // Briefing pills
                              const briefingItems = (spk.briefing || '').split(',').map(s => s.trim()).filter(Boolean);

                              return (
                                <React.Fragment key={spk.id || i}>
                                  <tr className={`border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer ${isExpanded ? 'bg-purple-50/30' : ''}`}
                                    onClick={() => setExpandedSpeakerId(isExpanded ? null : spk.id)}>
                                    {/* Name */}
                                    <td className="py-2 px-3">
                                      <div className="font-bold text-slate-800 text-xs">{spk.fullName || '—'}</div>
                                      <div className="text-[10px] text-slate-400">{spk.email}</div>
                                      {isDummy && isCreatedByOther && (
                                        <div className="text-[9px] text-amber-600 font-bold mt-0.5">🤖 Dummy · erstellt von {spk.registeredBy}</div>
                                      )}
                                    </td>
                                    {/* Status */}
                                    <td className="py-2 px-3">
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${isDummy ? 'bg-amber-100 text-amber-700' :
                                        (spk.status || '').toLowerCase().includes('fixiert') ? 'bg-green-100 text-green-700' :
                                          (spk.status || '').toLowerCase().includes('zusage') ? 'bg-blue-100 text-blue-700' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>{spk.status || '—'}</span>
                                    </td>
                                    {/* Briefing (read-only status — set by mailing automation) */}
                                    <td className="py-2 px-3">
                                      {briefingItems.length > 0 ? (
                                        <div className="flex flex-wrap gap-0.5 max-w-[140px]">
                                          <span className="text-[8px] text-slate-400 font-bold mr-1">{briefingItems.length}×</span>
                                          {briefingItems.map((b, bi) => (
                                            <span key={bi} className="px-1 py-0 rounded bg-indigo-50 text-indigo-700 text-[8px] font-bold">{b}</span>
                                          ))}
                                        </div>
                                      ) : <span className="text-[9px] text-slate-400">—</span>}
                                    </td>
                                    {/* Sessions */}
                                    <td className="py-2 px-3">
                                      <span className={`text-xs font-bold ${spkSessions.length > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                                        {isExpanded ? '▼' : '▶'} {spkSessions.length}
                                      </span>
                                    </td>
                                    {/* Profil */}
                                    <td className="py-2 px-3">
                                      {profileComplete ? (
                                        <span className="text-green-600 text-xs font-bold">✓</span>
                                      ) : (
                                        <span className="text-amber-600 text-xs font-bold" title={`${!spk.bio ? 'Bio fehlt ' : ''}${!spk.telefon ? 'Tel fehlt ' : ''}${!spk.adresse ? 'Adresse fehlt' : ''}`}>⚠️</span>
                                      )}
                                    </td>
                                    {/* Reise (Hotel + Anreise/Abreise + Nächte) */}
                                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                                      {isAdmin ? (
                                        <div className="space-y-1">
                                          <input type="text" defaultValue={spk.hotel || ''} placeholder="Hotel"
                                            onBlur={e => { if (e.target.value !== (spk.hotel || '')) updateSpeakerField(spk, 'W', e.target.value); }}
                                            className="w-20 text-[9px] border rounded px-1 py-0.5" />
                                          <div className="flex gap-0.5">
                                            <input type="date" defaultValue={spk.anreiseAm || ''}
                                              onBlur={e => { if (e.target.value !== (spk.anreiseAm || '')) updateSpeakerField(spk, 'AI', e.target.value); }}
                                              className="text-[8px] border rounded px-0.5 py-0.5 w-[72px]" title="Anreise" />
                                            <input type="date" defaultValue={spk.abreiseAm || ''}
                                              onBlur={e => { if (e.target.value !== (spk.abreiseAm || '')) updateSpeakerField(spk, 'AJ', e.target.value); }}
                                              className="text-[8px] border rounded px-0.5 py-0.5 w-[72px]" title="Abreise" />
                                          </div>
                                          {nights !== null && <div className="text-[8px] text-slate-500">{nights} Nächte</div>}
                                        </div>
                                      ) : (
                                        <div className="text-[9px] text-slate-500">
                                          {spk.hotel ? <div>🏨 {spk.hotel}</div> : '—'}
                                          {spk.anreiseAm && <div>{spk.anreiseAm} → {spk.abreiseAm || '?'}</div>}
                                          {nights !== null && <div>{nights}N</div>}
                                        </div>
                                      )}
                                    </td>
                                    {/* Honorar (Q) */}
                                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                                      {isAdmin ? (
                                        <input type="text" defaultValue={spk.honorar || ''} placeholder="€"
                                          onBlur={e => { if (e.target.value !== (spk.honorar || '')) updateSpeakerField(spk, 'Q', e.target.value); }}
                                          className="w-16 text-[10px] border rounded px-1 py-0.5" />
                                      ) : (
                                        <span className="text-[10px] text-slate-500">{spk.honorar || '—'}</span>
                                      )}
                                    </td>
                                    {/* Catering (AH) - multi-select */}
                                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                                      {isAdmin ? (
                                        <div>
                                          <select value="" onChange={e => {
                                            if (!e.target.value) return;
                                            const cur = (spk.catering || '').split(',').map(s => s.trim()).filter(Boolean);
                                            if (!cur.includes(e.target.value)) {
                                              updateSpeakerField(spk, 'AH', [...cur, e.target.value].join(', '));
                                            }
                                            e.target.value = '';
                                          }} className="text-[9px] border rounded px-1 py-0.5 w-16">
                                            <option value="">+ Meal</option>
                                            {['Tag 1 - Mittag', 'Tag 1 - Abend', 'Tag 2 - Mittag', 'Tag 2 - Abend', 'Tag 3 - Mittag', 'Tag 3 - Abend', 'Tag 4 - Mittag', 'Tag 4 - Abend'
                                            ].filter(v => !(spk.catering || '').includes(v)).map(v => <option key={v} value={v}>{v}</option>)}
                                          </select>
                                          {(spk.catering || '').split(',').map(s => s.trim()).filter(Boolean).map((c, ci) => (
                                            <span key={ci} className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-orange-50 text-orange-700 text-[8px] font-bold mr-0.5 mt-0.5">
                                              {c}
                                              <button onClick={(e) => { e.stopPropagation(); const upd = (spk.catering || '').split(',').map(s => s.trim()).filter((_, x) => x !== ci).join(', '); updateSpeakerField(spk, 'AH', upd); }} className="text-orange-400 hover:text-red-500">×</button>
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-[9px] text-slate-500">{spk.catering || '—'}</span>
                                      )}
                                    </td>
                                    {/* Vertrag (AE) */}
                                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                                      {isAdmin ? (
                                        <select value={spk.vertragStatus || 'nicht benötigt'} onChange={e => updateSpeakerField(spk, 'AE', e.target.value)}
                                          className={`text-[10px] border rounded px-1 py-0.5 font-bold ${spk.vertragStatus === 'unterschrieben' ? 'text-green-700' :
                                            spk.vertragStatus === 'Rechnung Gezahlt' ? 'text-green-700' :
                                              spk.vertragStatus === 'offen' || spk.vertragStatus === 'änderungen angefragt' ? 'text-amber-600' :
                                                'text-slate-500'
                                            }`}>
                                          <option value="nicht benötigt">nicht benötigt</option>
                                          <option value="offen">offen</option>
                                          <option value="Entwurf abgeschickt">Entwurf abgeschickt</option>
                                          <option value="änderungen angefragt">änderungen angefragt</option>
                                          <option value="unterschrieben">unterschrieben</option>
                                          <option value="Rechnung Erhalten">Rechnung Erhalten</option>
                                          <option value="Rechnung Gezahlt">Rechnung Gezahlt</option>
                                        </select>
                                      ) : (
                                        <span className={`text-[10px] font-bold ${spk.vertragStatus === 'unterschrieben' || spk.vertragStatus === 'Rechnung Gezahlt' ? 'text-green-700' :
                                          spk.vertragStatus === 'offen' || spk.vertragStatus === 'änderungen angefragt' ? 'text-amber-600' :
                                            'text-slate-500'
                                          }`}>{spk.vertragStatus || 'nicht benötigt'}</span>
                                      )}
                                    </td>
                                    {/* Ehrenamt (AG) */}
                                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                                      {isAdmin ? (
                                        <button onClick={() => updateSpeakerField(spk, 'AG', spk.ehrenamtsverguetung ? 'FALSE' : 'TRUE')}
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${spk.ehrenamtsverguetung ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                          {spk.ehrenamtsverguetung ? '✓ Ja' : '—'}
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-slate-500">{spk.ehrenamtsverguetung ? 'Ja' : '—'}</span>
                                      )}
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan="10" className="bg-slate-50 px-3 py-3">
                                        <div className="grid grid-cols-2 gap-4 mb-3 text-[10px] text-slate-500">
                                          <div><strong>📞 Telefon:</strong> {spk.telefon || '—'}</div>
                                          <div><strong>🏠 Adresse:</strong> {spk.adresse || '—'}</div>
                                          <div><strong>🌐 Webseite:</strong> {spk.webseite || '—'}</div>
                                          <div><strong>🗣️ Sprache:</strong> {spk.sprache || '—'}</div>
                                        </div>
                                        {spkSessions.length > 0 ? (
                                          <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">Sessions ({spkSessions.length})</p>
                                            {spkSessions.map((session, si) => {
                                              const stageName = data.stages.find(s => s.id === session.stage)?.name || '';
                                              return (
                                                <div key={session.id || si}
                                                  onClick={() => { setEditingSession(session); setIsModalOpen(true); }}
                                                  className="border rounded-lg p-2 cursor-pointer hover:shadow-md transition-shadow bg-white border-slate-200">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold text-slate-800">{session.title || 'Ohne Titel'}</span>
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600">{session.status || 'Vorschlag'}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                                                    {stageName && <span className="bg-slate-100 px-1 py-0.5 rounded font-bold">{stageName}</span>}
                                                    {session.start && session.start !== '-' && <span>🕐 {session.start}</span>}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <p className="text-[10px] text-slate-400">Keine Sessions verknüpft.</p>
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {viewMode === 'PRODUCTION' && (
          <div className="flex flex-col h-full overflow-hidden">
            <header className="bg-orange-800 text-white px-4 py-2 flex justify-between items-center shadow-lg shrink-0">
              <h1 className="font-bold flex items-center gap-2">🎛️ Produktions-Timeline</h1>
              <button onClick={() => setViewMode('PLANNER')} className="text-xs bg-orange-700 hover:bg-orange-600 px-3 py-1 rounded transition-colors uppercase font-bold tracking-widest">Planner View</button>
            </header>
            <ProductionTimeline
              sessions={data.program}
              stages={data.stages}
              productionData={productionData}
              startHour={config.startHour}
              endHour={config.endHour}
            />
          </div>
        )}

        {/* Submit View */}
        {(viewMode === 'SUBMIT' || viewMode === 'ORG_SESSIONS' || viewMode === 'ORG_PROFILE') && (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
            {openCallClosed && !hasRole('ADMIN') ? (
              <div className="max-w-2xl mx-auto mt-20 text-center">
                <div className="bg-red-50 border border-red-200 rounded-xl p-8">
                  <h2 className="text-xl font-bold text-red-700 mb-2">Open Call geschlossen</h2>
                  <p className="text-sm text-red-600">Der Open Call für Einreichungen ist derzeit geschlossen. Bitte wende dich an das Admin-Team, wenn du eine Session einreichen möchtest.</p>
                </div>
              </div>
            ) : hasRole('SPEAKER') && !hasRole('ADMIN', 'TEILNEHMENDE') ? (
              /* SPEAKER: read-only session overview */
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
                  <span className="text-amber-600 text-lg">⚠️</span>
                  <p className="text-sm text-amber-800"><strong>Hinweis:</strong> Zeiten und Bühnen sind vorläufig, solange eine Session nicht den Status <strong className="text-green-700">fixiert</strong> hat. Erst dann sind die Angaben verbindlich.</p>
                </div>
                {mySessions.length > 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">📋 Meine Sessions ({mySessions.length})</h2>
                    <div className="space-y-3">
                      {mySessions.map((session, i) => {
                        const statusLower = (session.status || '').toLowerCase();
                        const isFixed = statusLower === 'fixiert' || statusLower.includes('fixiert');
                        const isAccepted = statusLower === 'akzeptiert' || statusLower.includes('akzeptiert');
                        const isVorschlag = !isFixed && !isAccepted;
                        const stageName = data.stages.find(s => s.id === session.stage)?.name || session.stage;
                        const showSchedule = !isVorschlag; // hide stage/time for Vorschlag
                        return (
                          <div key={session.id || i} className={`border rounded-lg p-4 ${isFixed ? 'border-green-200 bg-green-50/30' : isAccepted ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-bold text-sm text-slate-800">{session.title || 'Ohne Titel'}</h3>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${isFixed ? 'bg-green-100 text-green-700' :
                                isAccepted ? 'bg-blue-100 text-blue-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                {isFixed ? '✓ Fixiert' : isAccepted ? '✓ Akzeptiert' : session.status || 'Vorschlag'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                              {showSchedule && stageName && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{stageName}</span>}
                              {session.format && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{session.format}</span>}
                              {showSchedule && session.start && session.start !== '-' && (
                                <span className={`flex items-center gap-1 ${isFixed ? 'text-green-700 font-bold' : 'text-blue-600 italic'}`}>
                                  🕐 {session.start} – {session.end || ''} {!isFixed && '(Planungsstand)'}
                                </span>
                              )}
                              {session.duration && <span>{session.duration} min</span>}
                              {session.speakers && <span>🎤 {session.speakers}</span>}
                            </div>
                            {isAccepted && (
                              <p className="mt-2 text-[10px] text-blue-500 italic">
                                ℹ️ Zeiten und Bühne entsprechen dem aktuellen Planungsstand und können sich noch ändern.
                              </p>
                            )}
                            {isVorschlag && (
                              <p className="mt-2 text-[10px] text-slate-400 italic">
                                Bühne und Zeiten werden nach der Kuration zugewiesen.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-400">
                    <p className="text-sm">Du bist noch keiner Session als SprecherIn zugeordnet.</p>
                  </div>
                )}
              </div>
            ) : hasRole('ORGANISATION') && viewMode === 'ORG_SESSIONS' ? (
              /* ORGANISATION: sessions linked via partner field */
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Org Profile Card */}
                {myOrgRecord && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-4 mb-4">
                      {myOrgRecord.logoUrl && (
                        <img src={myOrgRecord.logoUrl} alt={myOrgRecord.name} className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                      )}
                      <div>
                        <h2 className="text-lg font-bold text-slate-800">{myOrgRecord.name || 'Meine Organisation'}</h2>
                        {myOrgRecord.webseite && <a href={myOrgRecord.webseite} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">{myOrgRecord.webseite}</a>}
                      </div>
                      <button onClick={() => setViewMode('ORG_PROFILE')} className="ml-auto px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">
                        Profil bearbeiten
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
                  <span className="text-amber-600 text-lg">⚠️</span>
                  <p className="text-sm text-amber-800"><strong>Hinweis:</strong> Zeiten und Bühnen sind vorläufig, solange eine Session nicht den Status <strong className="text-green-700">fixiert</strong> hat.</p>
                </div>
                {myOrgSessions.length > 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">🏢 Partner-Sessions ({myOrgSessions.length})</h2>
                    <div className="space-y-3">
                      {myOrgSessions.map((session, i) => {
                        const statusLower = (session.status || '').toLowerCase();
                        const isFixed = statusLower === 'fixiert';
                        const isAccepted = statusLower === 'akzeptiert';
                        const isVorschlag = !isFixed && !isAccepted;
                        const stageName = data.stages.find(s => s.id === session.stage)?.name || session.stage;
                        const showSchedule = !isVorschlag;
                        return (
                          <div key={session.id || i} className={`border rounded-lg p-4 ${isFixed ? 'border-green-200 bg-green-50/30' : isAccepted ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-bold text-sm text-slate-800">{session.title || 'Ohne Titel'}</h3>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${isFixed ? 'bg-green-100 text-green-700' : isAccepted ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                {isFixed ? '✓ Fixiert' : isAccepted ? '✓ Akzeptiert' : session.status || 'Vorschlag'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                              {showSchedule && stageName && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{stageName}</span>}
                              {session.format && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{session.format}</span>}
                              {showSchedule && session.start && session.start !== '-' && (
                                <span className={`flex items-center gap-1 ${isFixed ? 'text-green-700 font-bold' : 'text-blue-600 italic'}`}>
                                  🕐 {session.start} – {session.end || ''} {!isFixed && '(Planungsstand)'}
                                </span>
                              )}
                              {session.duration && <span>{session.duration} min</span>}
                              {session.speakers && <span>🎤 {session.speakers}</span>}
                            </div>
                            {isAccepted && (
                              <p className="mt-2 text-[10px] text-blue-500 italic">ℹ️ Zeiten und Bühne können sich noch ändern.</p>
                            )}
                            {isVorschlag && (
                              <p className="mt-2 text-[10px] text-slate-400 italic">Bühne und Zeiten werden nach der Kuration zugewiesen.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-400">
                    <p className="text-sm">Noch keine Sessions mit deiner Organisation verknüpft.</p>
                  </div>
                )}
              </div>
            ) : hasRole('ORGANISATION') && viewMode === 'ORG_PROFILE' ? (
              /* ORGANISATION: Profile editing */
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">🏢 Organisations-Profil</h2>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.target);
                    const row = [
                      authenticatedUser.email || '',
                      fd.get('orgName') || '',
                      fd.get('orgBeschreibung') || '',
                      fd.get('orgWebseite') || '',
                      fd.get('orgLogoUrl') || '',
                      fd.get('orgInstagram') || '',
                      fd.get('orgLinkedin') || '',
                      fd.get('orgSocialSonstiges') || ''
                    ];
                    try {
                      const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
                      const rowIdx = myOrgRecord?.rowIndex || (data.organisations.length + 2);
                      const action = myOrgRecord ? 'update' : 'append';
                      const range = myOrgRecord
                        ? `'Config_Organisations'!A${rowIdx}:H${rowIdx}`
                        : `'Config_Organisations'!A2:H`;
                      const { ok, error } = await fetchSheets({
                        action, spreadsheetId: config.spreadsheetId, range, values: [row]
                      }, token, config.curationApiUrl);
                      if (!ok) throw new Error(error);
                      setToast({ msg: 'Profil gespeichert!', type: 'success' });
                      setTimeout(() => setToast(null), 3000);
                      // Optimistic update
                      setData(prev => {
                        const newOrg = { rowIndex: rowIdx, email: row[0], name: row[1], beschreibung: row[2], webseite: row[3], logoUrl: row[4], instagram: row[5], linkedin: row[6], socialSonstiges: row[7] };
                        const orgs = myOrgRecord
                          ? prev.organisations.map(o => o.email?.toLowerCase() === authenticatedUser.email?.toLowerCase() ? newOrg : o)
                          : [...prev.organisations, newOrg];
                        return { ...prev, organisations: orgs };
                      });
                      setViewMode('ORG_SESSIONS');
                    } catch (err) {
                      setToast({ msg: `Fehler: ${err.message}`, type: 'error' });
                      setTimeout(() => setToast(null), 3000);
                    }
                  }} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Name der Organisation</label>
                      <input name="orgName" defaultValue={myOrgRecord?.name || ''} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" required />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Beschreibung</label>
                      <textarea name="orgBeschreibung" defaultValue={myOrgRecord?.beschreibung || ''} rows={4} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Webseite</label>
                        <input name="orgWebseite" defaultValue={myOrgRecord?.webseite || ''} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" placeholder="https://..." />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Logo URL</label>
                        <input name="orgLogoUrl" defaultValue={myOrgRecord?.logoUrl || ''} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" placeholder="https://..." />
                        {myOrgRecord?.logoUrl && (
                          <div className="mt-2 flex items-center gap-3">
                            <img src={myOrgRecord.logoUrl} alt="Logo" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                            <span className="text-[10px] text-slate-400">Aktuelle Vorschau</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Instagram</label>
                        <input name="orgInstagram" defaultValue={myOrgRecord?.instagram || ''} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" placeholder="@handle" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">LinkedIn</label>
                        <input name="orgLinkedin" defaultValue={myOrgRecord?.linkedin || ''} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Sonstiges</label>
                        <input name="orgSocialSonstiges" defaultValue={myOrgRecord?.socialSonstiges || ''} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors">💾 Speichern</button>
                      <button type="button" onClick={() => setViewMode('ORG_SESSIONS')} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors">Abbrechen</button>
                    </div>
                  </form>
                </div>

                {/* Linked Sessions below profile form */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">📄 Verknüpfte Sessions ({myOrgSessions.length})</h2>
                  {myOrgSessions.length > 0 ? (
                    <div className="space-y-3">
                      {myOrgSessions.map((session, i) => {
                        const isPending = (session.partner || '').startsWith('pending:');
                        const statusLower = (session.status || '').toLowerCase();
                        const isFixed = statusLower === 'fixiert';
                        const isAccepted = statusLower === 'akzeptiert';
                        const stageName = data.stages.find(s => s.id === session.stage)?.name || '';
                        return (
                          <div key={session.id || i} className={`border rounded-lg p-4 ${isPending ? 'border-amber-200 bg-amber-50/30' : isFixed ? 'border-green-200 bg-green-50/30' : isAccepted ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-bold text-sm text-slate-800">{session.title || 'Ohne Titel'}</h3>
                              <div className="flex items-center gap-2 shrink-0">
                                {isPending && (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-700">⏳ Bestätigung ausstehend</span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${isFixed ? 'bg-green-100 text-green-700' : isAccepted ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {session.status || 'Vorschlag'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                              {stageName && <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">{stageName}</span>}
                              {session.format && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{session.format}</span>}
                              {session.start && session.start !== '-' && <span>🕐 {session.start} – {session.end || ''}</span>}
                              {session.speakers && <span>🎤 {session.speakers}</span>}
                            </div>
                            {isPending && (
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={async () => {
                                    const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
                                    const confirmedName = myOrgRecord.name;
                                    const sessionIdx = data.program.findIndex(p => p.id === session.id);
                                    if (sessionIdx < 0) return;
                                    const rowIndex = data.program[sessionIdx].rowIndex;
                                    try {
                                      const { ok, error } = await fetchSheets({
                                        action: 'update', spreadsheetId: config.spreadsheetId,
                                        range: `'Master_Einreichungen'!S${rowIndex}`,
                                        values: [[confirmedName]]
                                      }, token, config.curationApiUrl);
                                      if (!ok) throw new Error(error);
                                      setData(prev => ({
                                        ...prev,
                                        program: prev.program.map(p => p.id === session.id ? { ...p, partner: confirmedName } : p)
                                      }));
                                      setToast({ msg: `✓ Zuordnung bestätigt: ${session.title}`, type: 'success' });
                                      setTimeout(() => setToast(null), 3000);
                                    } catch (e) {
                                      setToast({ msg: `Fehler: ${e.message}`, type: 'error' });
                                      setTimeout(() => setToast(null), 3000);
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors"
                                >
                                  ✓ Bestätigen
                                </button>
                                <button
                                  onClick={async () => {
                                    const token = authenticatedUser.accessToken || authenticatedUser.magicToken || '';
                                    const sessionIdx = data.program.findIndex(p => p.id === session.id);
                                    if (sessionIdx < 0) return;
                                    const rowIndex = data.program[sessionIdx].rowIndex;
                                    try {
                                      const { ok, error } = await fetchSheets({
                                        action: 'update', spreadsheetId: config.spreadsheetId,
                                        range: `'Master_Einreichungen'!S${rowIndex}`,
                                        values: [['']]
                                      }, token, config.curationApiUrl);
                                      if (!ok) throw new Error(error);
                                      setData(prev => ({
                                        ...prev,
                                        program: prev.program.map(p => p.id === session.id ? { ...p, partner: '' } : p)
                                      }));
                                      setToast({ msg: `Zuordnung abgelehnt: ${session.title}`, type: 'info' });
                                      setTimeout(() => setToast(null), 3000);
                                    } catch (e) {
                                      setToast({ msg: `Fehler: ${e.message}`, type: 'error' });
                                      setTimeout(() => setToast(null), 3000);
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors"
                                >
                                  ✗ Ablehnen
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center">Noch keine Sessions verknüpft.</p>
                  )}
                </div>
              </div>
            ) : (
              <SessionSubmission
                speakers={hasRole('ADMIN', 'CURATOR', 'REVIEWER')
                  ? data.speakers
                  : data.speakers.filter(s => {
                    const st = (s.status || '').toLowerCase();
                    return st === 'cfp' || st.includes('cfp_dummy');
                  })
                }
                metadata={data.configThemen || curationData.metadata}
                maxSubmissions={data.configThemen?.maxSubmissions || config.maxSubmissions || 5}
                userRole={effectiveRole}
                submitterEmail={authenticatedUser.email}
                submitterName={mySpeakerRecord?.fullName || authenticatedUser.name || ''}
                mySubmissions={mySubmissions}
                mySessions={mySessions}
                stages={data.stages}
                fetchSheets={fetchSheets}
                spreadsheetId={config.spreadsheetId}
                apiUrl={config.curationApiUrl}
                accessToken={authenticatedUser.accessToken || authenticatedUser.magicToken || ''}
                onSuccess={(newTitle) => {
                  setToast({ msg: `Session "${newTitle || ''}" erfolgreich eingereicht!`, type: 'success' });
                  setTimeout(() => setToast(null), 3000);
                  // Optimistic local update: add the new submission immediately
                  setData(prev => ({
                    ...prev,
                    submissions: [...prev.submissions, {
                      id: `EINR-${String(prev.submissions.length + 1).padStart(4, '0')}`,
                      rowIndex: prev.submissions.length + 2,
                      timestamp: new Date().toISOString(),
                      submitterEmail: authenticatedUser.email,
                      submitterName: mySpeakerRecord?.fullName || authenticatedUser.name || '',
                      title: newTitle || 'Neue Session',
                      status: 'Vorschlag',
                      format: '', thema: '', bereich: '', language: 'DE', duration: 60,
                      speakers: '', shortDescription: '', description: '', notes: '', speakerIds: '',
                      source: 'Einreichung'
                    }]
                  }));
                  // Delayed reload from server (Google Sheets eventual consistency)
                  setTimeout(() => loadData({ manual: true }), 2500);
                }}
                onRegisterSpeaker={() => setViewMode('REGISTER')}
              />
            )}
          </div>
        )}

        {/* Speaker Registration View */}
        {viewMode === 'REGISTER' && (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
            <SpeakerRegistration
              n8nBaseUrl={config.n8nBaseUrl}
              accessToken={authenticatedUser.accessToken}
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

        {/* Speaker Profile View */}
        {viewMode === 'PROFILE' && (
          <SpeakerProfile
            speaker={mySpeakerRecord}
            userEmail={authenticatedUser.email || ''}
            onSave={handleSaveSpeakerProfile}
            onRegister={handleRegisterSpeakerProfile}
            onDelete={handleDeleteProfile}
          />
        )}
      </div>

      <div className="h-10 bg-slate-900 flex items-center justify-center gap-4 sm:gap-8 shrink-0 border-t border-slate-800 overflow-x-auto">
        {/* Planer: ADMIN, CURATOR, REVIEWER, PRODUCTION */}
        {hasRole('ADMIN', 'CURATOR', 'REVIEWER', 'PRODUCTION') && (
          <button onClick={() => setViewMode('PLANNER')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'PLANNER' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <Layout className="w-3.5 h-3.5" /> Planer
          </button>
        )}

        {/* Einreichung: ADMIN, TEILNEHMENDE, SPEAKER */}
        {hasRole('ADMIN', 'TEILNEHMENDE', 'SPEAKER') && (
          <button onClick={() => setViewMode('SUBMIT')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'SUBMIT' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <PlusCircle className="w-3.5 h-3.5" /> Einreichung
          </button>
        )}

        {/* Kuration: ADMIN, CURATOR only (not REVIEWER) */}
        {hasRole('ADMIN', 'CURATOR') && (
          <button onClick={() => setViewMode('CURATION')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'CURATION' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <LayoutDashboard className="w-3.5 h-3.5" /> Kuration
          </button>
        )}

        {/* Organisations: ADMIN, REVIEWER */}
        {hasRole('ADMIN', 'REVIEWER') && (
          <button onClick={() => setViewMode('ORG_DASHBOARD')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'ORG_DASHBOARD' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            🏢 Organisationen
          </button>
        )}

        {/* SprecherInnen Dashboard: ADMIN, REVIEWER */}
        {hasRole('ADMIN', 'REVIEWER') && (
          <button onClick={() => setViewMode('SPRECHERIN_DASHBOARD')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'SPRECHERIN_DASHBOARD' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            🎤 SprecherInnen
          </button>
        )}

        {/* Profil: SPEAKER, TEILNEHMENDE (+ ADMIN for own) */}
        {hasRole('ADMIN', 'SPEAKER', 'TEILNEHMENDE') && (
          <button onClick={() => setViewMode('PROFILE')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'PROFILE' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <User className="w-3.5 h-3.5" /> Profil
          </button>
        )}

        {/* Organisation: ORGANISATION role */}
        {hasRole('ORGANISATION') && (
          <button onClick={() => setViewMode('ORG_SESSIONS')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'ORG_SESSIONS' || viewMode === 'ORG_PROFILE' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            🏢 Organisation
          </button>
        )}

        {/* Admin: ADMIN + REVIEWER (read-only) */}
        {hasRole('ADMIN', 'REVIEWER') && (
          <button onClick={() => setViewMode('ADMIN')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'ADMIN' ? 'text-indigo-400' : 'text-slate-500 hover:text-white'}`}>
            <Shield className="w-3.5 h-3.5" /> Admin
          </button>
        )}

        {/* Production: ADMIN, PRODUCTION */}
        {hasRole('ADMIN', 'PRODUCTION') && (
          <button onClick={() => setViewMode('PRODUCTION')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === 'PRODUCTION' ? 'text-orange-400' : 'text-slate-500 hover:text-white'}`}>
            🎛️ Produktion
          </button>
        )}

        {/* Logout */}
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all whitespace-nowrap text-slate-500 hover:text-red-400" title="Abmelden">
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>

        {/* Live Mode indicator */}
        {liveMode && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 animate-pulse ml-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            LIVE
          </span>
        )}
      </div>

      {/* Settings Modal */}
      {
        showSettings && (
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
                  <label className="block text-xs">n8n API Base URL (z.B. https://n8n.domain.com/webhook)</label>
                  <input
                    type="text"
                    value={config.curationApiUrl}
                    onChange={e => setConfig({ ...config, curationApiUrl: e.target.value })}
                    placeholder="https://n8n.deine-domain.com/webhook"
                    className="w-full border rounded p-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="grid grid-cols-2 gap-2">

                    <div><label className="text-xs">Stages Sheet</label><input className="w-full border p-2 rounded" value={config.sheetNameStages} onChange={e => setConfig({ ...config, sheetNameStages: e.target.value })} /></div>
                  </div>
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
                  Object.keys(config).forEach(k => {
                    if (config[k]) {
                      localStorage.setItem(`kosmos_${k}`, config[k]);
                    } else {
                      localStorage.removeItem(`kosmos_${k}`);
                    }
                  });
                  window.location.reload();
                }} className="px-4 py-2 bg-blue-600 text-white rounded">Speichern & Reload</button>
              </div>
            </div>
          </div>
        )
      }

      <SessionModal
        isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingSession(null); }}
        onSave={handleSaveSession} onDelete={handleDeleteSession}
        initialData={editingSession} definedStages={data.stages}
        speakersList={data.speakers} moderatorsList={data.moderators}
        configThemen={data.configThemen}
        organisations={data.organisations || []}
        userRole={effectiveRole}
      />
    </div >
  );
}



export default App;
