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
  Download, Loader2
} from 'lucide-react';

// --- KONSTANTEN ---
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const INBOX_ID = 'Inbox';
const HEADER_HEIGHT = 64; 
const PIXELS_PER_MINUTE = 2.5; 
const SNAP_MINUTES = 5; 

const STATUS_COLORS = {
  '5_Vorschlag': 'border-yellow-400 bg-yellow-50',
  '2_Planung': 'border-blue-300 bg-white',
  '1_Zusage': 'border-green-400 bg-green-50',
  'Akzeptiert': 'border-green-500 bg-green-50',
  'Fixiert': 'border-red-500 bg-slate-100 ring-1 ring-red-500' 
};

const FORMAT_COLORS = {
  'Talk': 'bg-blue-100 text-blue-900',
  'Vortrag': 'bg-blue-100 text-blue-900',
  'Panel': 'bg-purple-100 text-purple-900',
  'Workshop': 'bg-orange-100 text-orange-900',
  'Lightning Talk': 'bg-cyan-100 text-cyan-900',
  'Pause': 'bg-gray-200 text-gray-700',
  'Keynote': 'bg-pink-100 text-pink-900'
};

// --- HELPER FUNCTIONS ---
const generateId = () => Math.floor(10000 + Math.random() * 90000).toString();

const safeString = (val) => (val === null || val === undefined) ? '' : String(val).trim();

// Remove commas for CSV safety
const cleanForCSV = (text) => {
  if (!text) return '';
  return safeString(text).replace(/,/g, ' ').replace(/\n/g, ' ').replace(/"/g, '""'); 
};

const timeToMinutes = (timeStr) => {
  const t = safeString(timeStr);
  if (!t || !t.includes(':')) return 0;
  const [hours, minutes] = t.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const minutesToTime = (totalMinutes) => {
  let h = Math.floor(totalMinutes / 60);
  let m = totalMinutes % 60;
  m = Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
  if (m === 60) { m = 0; h += 1; }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const calculateEndTime = (startStr, durationMin) => {
  const s = safeString(startStr);
  if (!s || s === '-') return '-';
  const startMin = timeToMinutes(s);
  return minutesToTime(startMin + parseInt(durationMin || 0));
};

const checkOverlap = (startA, endA, startB, endB, buffer = 0) => {
  return (startA < endB + buffer) && (endA + buffer > startB);
};

const getErrorMessage = (e) => {
  if (typeof e === 'string') return e;
  return e?.result?.error?.message || e?.message || "Unbekannter Fehler beim Speichern";
};

// --- COMPONENTS ---

const Card = React.forwardRef(({ children, className = "", onClick, style, status, ...props }, ref) => {
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

const SessionCardContent = ({ session, onClick, onToggleLock, isLocked, hasConflict, conflictTooltip, listeners, attributes, isDimmed }) => {
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
             <Users className="w-3 h-3 shrink-0 text-indigo-500 mr-0.5"/> 
             {session.speakers.split(',').map((sp, i) => (
               <span key={i} className="after:content-[','] last:after:content-[''] mr-0.5">{sp.trim()}</span>
             ))}
           </div>
         )}
         {session.moderators && (
           <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1 leading-tight" title={`Mod: ${session.moderators}`}>
             <Mic2 className="w-3 h-3 shrink-0 text-pink-500 mr-0.5"/> 
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

const DroppableStage = ({ id, children, className }) => {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
};

const DraggableTimelineItem = ({ session, onClick, style, onToggleLock, hasConflict, conflictTooltip, isDimmed }) => {
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

const SortableInboxItem = ({ session, onClick, onToggleLock, hasConflict, conflictTooltip, isDimmed }) => {
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

const StageColumn = ({ stage, children, height }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id, 
    data: { type: 'stage', name: stage.name } 
  });

  return (
    <div ref={setNodeRef} style={{ height: height + HEADER_HEIGHT }} className={`min-w-[280px] w-full max-w-[320px] border-r border-slate-200 relative transition-colors ${isOver ? 'bg-blue-50/30' : 'bg-white/30 odd:bg-slate-50/50'}`}>
       <div className="bg-white/95 backdrop-blur border-b border-slate-200 p-2 text-center z-20 shadow-sm flex flex-col justify-center" style={{ height: HEADER_HEIGHT }}>
         <div className="font-bold text-slate-700 text-sm truncate">{stage.name}</div>
         <div className="flex justify-center gap-3 text-[10px] text-slate-400 font-mono mt-0.5">
            <span className="flex items-center gap-1"><Users className="w-3 h-3"/> {stage.capacity}</span>
            <span className="flex items-center gap-1"><Mic2 className="w-3 h-3"/> {stage.maxMics || '?'}</span>
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

function App() {
  const [data, setData] = useState({ speakers: [], moderators: [], program: [], stages: [] });
  const [status, setStatus] = useState({ loading: false, error: null });
  
  const [config, setConfig] = useState({
    googleClientId: localStorage.getItem('kosmos_google_client_id') || '',
    googleApiKey: localStorage.getItem('kosmos_google_api_key') || '',
    spreadsheetId: localStorage.getItem('kosmos_spreadsheet_id') || '',
    sheetNameProgram: localStorage.getItem('kosmos_sheet_program') || 'Programm_Export',
    sheetNameSpeakers: localStorage.getItem('kosmos_sheet_speakers') || '26_Kosmos_SprecherInnen',
    sheetNameMods: localStorage.getItem('kosmos_sheet_mods') || '26_Kosmos_Moderation',
    sheetNameStages: localStorage.getItem('kosmos_sheet_stages') || 'Bühnen_Import',
    startHour: parseInt(localStorage.getItem('kosmos_start_hour')) || 9,
    endHour: parseInt(localStorage.getItem('kosmos_end_hour')) || 22,
    bufferMin: parseInt(localStorage.getItem('kosmos_buffer_min')) || 5
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

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [gapiInited, setGapiInited] = useState(false);
  const [gsiScriptLoaded, setGsiScriptLoaded] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const timelineHeight = (config.endHour - config.startHour) * 60 * PIXELS_PER_MINUTE;

  // --- ANALYTICS ---
  const analysis = useMemo(() => {
    const genderCounts = { m: 0, w: 0, d: 0, u: 0 };
    const langCounts = { de: 0, en: 0, other: 0 };
    let partnerSessions = 0;
    let totalPlacedSessions = 0;

    data.program.forEach(s => {
        if (s.stage !== INBOX_ID && s.start !== '-') {
            totalPlacedSessions++;
            if (s.partner === 'TRUE') partnerSessions++;
            
            // Language
            const lang = (s.language || '').toLowerCase();
            if (lang === 'de') langCounts.de++;
            else if (lang === 'en') langCounts.en++;
            else langCounts.other++;

            // Speakers & Mods Analysis
            const sList = s.speakers ? (Array.isArray(s.speakers) ? s.speakers : s.speakers.split(',').map(n=>n.trim()).filter(Boolean)) : [];
            const mList = s.moderators ? (Array.isArray(s.moderators) ? s.moderators : s.moderators.split(',').map(n=>n.trim()).filter(Boolean)) : [];
            
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

    return { genderCounts, langCounts, partnerPercent: totalPlacedSessions ? Math.round((partnerSessions/totalPlacedSessions)*100) : 0, totalPlaced: totalPlacedSessions };
  }, [data.program, data.speakers, data.moderators]);

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

  // --- API & DATA ---
  useEffect(() => {
    // 1. GAPI (Sheets)
    const initGapi = async () => {
       if(window.gapi) {
         await window.gapi.client.init({ apiKey: config.googleApiKey, discoveryDocs: DISCOVERY_DOCS });
         setGapiInited(true);
       }
    };
    if (config.googleApiKey && !gapiInited) {
        if (!window.gapi) {
            const script = document.createElement('script');
            script.src = "https://apis.google.com/js/api.js";
            script.onload = () => window.gapi.load('client', initGapi);
            document.body.appendChild(script);
        } else {
            window.gapi.load('client', initGapi);
        }
    }

    // 2. GSI (Identity) - Force reload if client missing
    if (config.googleClientId && !tokenClient) {
        if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
            const script = document.createElement('script');
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.defer = true;
            script.onload = () => {
                setGsiScriptLoaded(true);
                try {
                    const client = window.google.accounts.oauth2.initTokenClient({
                        client_id: config.googleClientId,
                        scope: SCOPES,
                        callback: (r) => { 
                            if(r.access_token) setIsAuthenticated(true); 
                            else console.error("GSI: No access token");
                        },
                        error_callback: (err) => {
                            console.error("GSI Error", err);
                            setToast({ msg: "Login blockiert (Pop-up/AdBlocker?)", type: "error" });
                        }
                    });
                    setTokenClient(client);
                } catch(e) {
                    console.error("GSI Init Error", e);
                }
            };
            document.body.appendChild(script);
        }
    }
  }, [config.googleApiKey, config.googleClientId]);

  const handleLogin = () => {
      if (tokenClient) {
          // Force account selection to avoid hidden cookie issues in incognito
          tokenClient.requestAccessToken({ prompt: 'select_account' });
      } else {
          setToast({ msg: "Login-Dienst lädt noch... Bitte warten.", type: "error" });
      }
  };

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !gapiInited || !config.spreadsheetId) return;
    setStatus({ loading: true, error: null });
    try {
      const batch = await window.gapi.client.sheets.spreadsheets.values.batchGet({
        spreadsheetId: config.spreadsheetId,
        ranges: [
          `'${config.sheetNameSpeakers}'!A2:I`, 
          `'${config.sheetNameMods}'!A2:C`,
          `'${config.sheetNameProgram}'!A2:N`,
          `'${config.sheetNameStages}'!A2:H`
        ]
      });
      const ranges = batch.result.valueRanges;
      
      const allowedSpeakerStatus = ['zusage', 'interess', 'angefragt', 'eingeladen', 'vorschlag'];
      const sp = (ranges[0].values || []).filter(r => {
          const s = safeString(r[0]).toLowerCase();
          return allowedSpeakerStatus.some(k => s.includes(k));
      }).map((r,i) => ({
          id:`sp-${i}`, 
          fullName:`${safeString(r[2])} ${safeString(r[3])}`.trim(), 
          status:safeString(r[0]), 
          pronoun: safeString(r[4]),
          email: safeString(r[8])
      }));

      const mo = (ranges[1].values || []).filter(r=>r[0]).map((r,i) => ({id:`mod-${i}`, fullName:safeString(r[1]), status:safeString(r[0])}));
      
      const st = (ranges[3].values || [])
        .map((r,i) => ({
            id: safeString(r[0]) || `st-${i}`, 
            name: safeString(r[1]), 
            capacity: safeString(r[2]), 
            maxMics: parseInt(r[4]) || 4
        }))
        .filter(s => s.name && s.name.toLowerCase() !== 'inbox');
        
      if (st.length===0) st.push({id:'main', name:'Main Stage', capacity:200, maxMics: 4});

      const pr = (ranges[2].values || []).map((r,i) => {
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
           notes: safeString(r[12]), 
           stageDispo: safeString(r[13])
         };
      });
      setData({ speakers: sp, moderators: mo, stages: st, program: pr });
      setStatus({ loading: false, error: null });
      setLocalChanges(false);
    } catch(e) {
      setStatus({ loading: false, error: getErrorMessage(e) });
    }
  }, [isAuthenticated, gapiInited, config]);

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
    for(let i=1; i<=MAX_SESSIONS; i++) {
        csvContent += `,S${i}_Titel,S${i}_Zeit,S${i}_Bühne,S${i}_Status,S${i}_Rolle`;
    }
    csvContent += "\n";

    Object.values(personMap).forEach(p => {
        let row = `${cleanForCSV(p.name)},${cleanForCSV(p.email)}`;
        const sessions = p.sessions.slice(0, MAX_SESSIONS); 
        sessions.forEach(s => {
            row += `,${s.title},${s.start}-${s.end},${s.stage},${s.status},${s.role}`;
        });
        for(let i=sessions.length; i<MAX_SESSIONS; i++) {
            row += ",,,,,"; 
        }
        csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mail_merge_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSync = async () => {
    if (!isAuthenticated) return;
    setStatus({ loading: true, error: null });
    try {
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
                safeString(p.stageDispo)
            ];
        });

        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: config.spreadsheetId, 
            range: `'${config.sheetNameProgram}'!A2:N`,
            valueInputOption: 'USER_ENTERED', 
            resource: { values: rows }
        });
        setLocalChanges(false);
        setStatus({ loading: false, error: null });
        setToast({ msg: "Programm erfolgreich gespeichert!", type: "success" });
        setTimeout(() => setToast(null), 3000);
    } catch (e) {
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
    const clampedMinutes = Math.max(config.startHour*60, Math.min(config.endHour*60 - activeDragItem.duration, snappedMinutes));
    
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

    newStartMinutes = Math.max(config.startHour*60, Math.min(config.endHour*60 - session.duration, newStartMinutes));
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

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center shrink-0 z-40 shadow-sm">
        <div className="flex items-center gap-4">
           <div>
             <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">KOSMOS Planer</h1>
             <div className="flex gap-2 text-[10px] font-bold uppercase text-slate-400">
                {status.loading && <span className="text-blue-500 animate-pulse">Laden...</span>}
                {localChanges && <span className="text-orange-500 bg-orange-100 px-1 rounded">● Ungespeichert</span>}
             </div>
           </div>
           
           {/* Primary Action Group: Search & Create */}
           <div className="flex items-center gap-2">
               <div className={`flex items-center transition-all duration-300 ${isSearchOpen ? 'w-64 bg-slate-100' : 'w-8 bg-transparent'} rounded-full overflow-hidden border ${isSearchOpen ? 'border-blue-200' : 'border-transparent'}`}>
                  <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors">
                     <Search className="w-5 h-5" />
                  </button>
                  {isSearchOpen && (
                     <input 
                        autoFocus
                        className="w-full bg-transparent border-none outline-none text-sm p-1 placeholder:text-slate-400"
                        placeholder="Suchen..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                     />
                  )}
                  {isSearchOpen && searchQuery && (
                     <button onClick={() => setSearchQuery('')} className="p-2 text-slate-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                     </button>
                  )}
               </div>
               
               <button 
                  onClick={() => { setEditingSession(null); setIsModalOpen(true); }} 
                  className="flex items-center justify-center w-8 h-8 bg-green-600 text-white rounded-full hover:bg-green-700 shadow-sm transition-transform hover:scale-105"
                  title="Neue Session"
               >
                  <PlusCircle className="w-5 h-5" />
               </button>
           </div>
        </div>

        <div className="flex items-center gap-2">
            {!isAuthenticated ? (
               <button 
                 onClick={handleLogin} 
                 className={`bg-slate-900 text-white px-3 py-1.5 rounded text-sm flex gap-2 items-center ${!tokenClient ? 'opacity-50 cursor-not-allowed' : ''}`}
                 disabled={!tokenClient}
               >
                 {tokenClient ? <><LogIn className="w-3 h-3"/> Login</> : <><Loader2 className="w-3 h-3 animate-spin"/> Lade...</>}
               </button>
            ) : (
               <>
                 <button onClick={loadData} className="p-2 hover:bg-slate-100 rounded text-slate-500" title="Neu laden"><RefreshCw className="w-4 h-4"/></button>
                 
                 {/* New Export Button */}
                 <button onClick={handleExportMailMerge} className="p-2 hover:bg-slate-100 rounded text-slate-500" title="Mail Merge Export">
                    <Download className="w-4 h-4"/>
                 </button>

                 <button onClick={handleSync} disabled={!localChanges} className={`flex items-center gap-2 px-3 py-1.5 rounded text-white text-sm font-bold shadow-sm ${localChanges ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300'}`}>
                    <UploadCloud className="w-3 h-3"/> Speichern
                 </button>
               </>
            )}
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={()=>setShowSettings(true)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><Settings className="w-5 h-5"/></button>
        </div>
      </header>

      {status.error && <div className="bg-red-50 text-red-600 p-2 text-xs text-center border-b border-red-200 font-bold">{status.error}</div>}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 overflow-hidden">
          {/* SIDEBAR */}
          {isAuthenticated && (
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-30 shadow-lg">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                   <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><PieChart className="w-4 h-4"/> Analyse (Live)</h3>
                   <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white p-2 rounded border border-slate-200 text-center">
                         <div className="text-lg font-bold text-slate-800">{analysis.genderCounts.w}</div>
                         <div className="text-[9px] text-slate-400 uppercase">Weiblich</div>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200 text-center">
                         <div className="text-lg font-bold text-slate-800">{analysis.genderCounts.m}</div>
                         <div className="text-[9px] text-slate-400 uppercase">Männlich</div>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200 text-center">
                         <div className="text-lg font-bold text-slate-800">{analysis.genderCounts.d}</div>
                         <div className="text-[9px] text-slate-400 uppercase">Divers</div>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200 text-center">
                         <div className="text-lg font-bold text-slate-800">{analysis.partnerPercent}%</div>
                         <div className="text-[9px] text-slate-400 uppercase">Partner</div>
                      </div>
                   </div>
                   {/* Language Analysis */}
                   <div className="flex gap-2 mt-2 pt-2 border-t border-slate-200">
                      <div className="flex-1 bg-white p-1 rounded border border-slate-200 text-center">
                         <div className="text-xs font-bold text-blue-600">{analysis.langCounts.de}</div>
                         <div className="text-[8px] text-slate-400">DE</div>
                      </div>
                      <div className="flex-1 bg-white p-1 rounded border border-slate-200 text-center">
                         <div className="text-xs font-bold text-indigo-600">{analysis.langCounts.en}</div>
                         <div className="text-[8px] text-slate-400">EN</div>
                      </div>
                   </div>
                   <div className="text-[10px] text-slate-400 text-center mt-2">Basis: {analysis.totalPlaced} platzierte Sessions</div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                   <div className="text-xs font-bold text-slate-400 px-2 py-2 uppercase">SprecherInnen ({data.speakers.length})</div>
                   {data.speakers.map(s => {
                     const displayStatus = s.status.replace(/^[0-9]+[_\-]/, '');
                     return (
                       <div key={s.id} className="text-[11px] py-1.5 px-2 border-b border-slate-50 text-slate-700 truncate hover:bg-slate-50 flex justify-between items-center group">
                         <span className="truncate w-32">{s.fullName}</span>
                         <span className="text-[9px] text-slate-400 bg-slate-100 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity capitalize">{displayStatus}</span>
                       </div>
                     );
                   })}
                </div>
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden relative">
             {/* INBOX */}
             <div className="bg-slate-100 border-b border-slate-300 p-2 shrink-0 h-48 flex flex-col shadow-inner z-20">
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-2 px-2">
                   <Layout className="w-3 h-3"/> Inbox (Parkplatz)
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                   <SortableContext id={INBOX_ID} items={data.program.filter(p=>p.stage===INBOX_ID).map(p=>p.id)}>
                      <DroppableStage id={INBOX_ID} className="flex flex-wrap gap-2 min-h-full items-start content-start">
                         {data.program.filter(p=>p.stage===INBOX_ID).map(p => (
                            <SortableInboxItem 
                               key={p.id} session={p} 
                               onClick={()=> {setEditingSession(p); setIsModalOpen(true)}}
                               onToggleLock={(s)=>updateSession(s.id, {status: s.status==='Fixiert'?'2_Planung':'Fixiert'})}
                               hasConflict={!!sessionConflicts[p.id]}
                               conflictTooltip={sessionConflicts[p.id]?.join('\n')}
                               isDimmed={isSearchOpen && searchQuery && !searchResults.includes(p.id)}
                            />
                         ))}
                      </DroppableStage>
                   </SortableContext>
                </div>
             </div>

             {/* TIMELINE */}
             <div className="flex-1 overflow-auto relative custom-scrollbar flex bg-slate-50">
                {/* TIME AXIS */}
                <div className="w-12 bg-white border-r border-slate-200 shrink-0 sticky left-0 z-30 shadow-sm" style={{ minHeight: timelineHeight + HEADER_HEIGHT }}>
                   <div style={{height: HEADER_HEIGHT}} className="border-b border-slate-200 bg-white sticky top-0 z-40"></div> 
                   <div className="absolute w-full bottom-0 z-0" style={{ top: HEADER_HEIGHT }}>
                      {Array.from({length: config.endHour - config.startHour + 1}).map((_,i) => (
                          <div key={i} className="absolute w-full text-right pr-1 text-[10px] font-mono text-slate-400 border-t border-slate-100 -mt-px pt-1"
                              style={{top: `${i*60*PIXELS_PER_MINUTE}px`}}>
                            {config.startHour+i}:00
                          </div>
                      ))}
                   </div>
                </div>

                {/* STAGES */}
                <div className="flex min-w-full">
                   {data.stages.map(stage => (
                      <StageColumn key={stage.id} stage={stage} height={timelineHeight}>
                         {ghostPosition && ghostPosition.stageId === stage.id && (
                            <div 
                               className={`absolute left-1 right-1 border-2 border-dashed rounded z-0 pointer-events-none flex items-center justify-center transition-colors
                                 ${ghostPosition.hasOverlap ? 'bg-red-500/20 border-red-500' : 'bg-blue-500/20 border-blue-500'}`}
                               style={{ top: ghostPosition.top, height: ghostPosition.height }}
                            >
                               <span className={`text-xs font-bold px-1 rounded ${ghostPosition.hasOverlap ? 'text-red-700 bg-red-100' : 'text-blue-700 bg-blue-100'}`}>
                                 {ghostPosition.timeLabel}
                               </span>
                            </div>
                         )}
                         {data.program.filter(p => p.stage === stage.id).map(session => (
                            <DraggableTimelineItem 
                               key={session.id}
                               session={session}
                               style={getPos(session.start, session.duration)}
                               onClick={()=>{setEditingSession(session); setIsModalOpen(true)}}
                               onToggleLock={(s)=>updateSession(s.id, {status: s.status==='Fixiert'?'2_Planung':'Fixiert'})}
                               hasConflict={!!sessionConflicts[session.id]}
                               conflictTooltip={sessionConflicts[session.id]?.join('\n')}
                               isDimmed={isSearchOpen && searchQuery && !searchResults.includes(session.id)}
                            />
                         ))}
                      </StageColumn>
                   ))}
                </div>
             </div>
          </div>
        </div>

        <DragOverlay>
           {activeDragItem ? (
              <div className="w-[240px] opacity-90 rotate-2">
                 <Card status={activeDragItem.status} className="bg-blue-600 text-white border-none shadow-2xl">
                    <div className="font-bold text-sm">{activeDragItem.title}</div>
                    <div className="text-xs">{activeDragItem.duration} min</div>
                 </Card>
              </div>
           ) : null}
        </DragOverlay>
      </DndContext>

      {/* Settings Modal */}
      {showSettings && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
               <h2 className="font-bold text-lg mb-4">Einstellungen</h2>
               <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                     <div><label className="text-xs block">Start (Std)</label><input type="number" className="border p-2 w-full rounded" value={config.startHour} onChange={e=>setConfig({...config, startHour: parseInt(e.target.value)||9})} /></div>
                     <div><label className="text-xs block">Ende (Std)</label><input type="number" className="border p-2 w-full rounded" value={config.endHour} onChange={e=>setConfig({...config, endHour: parseInt(e.target.value)||22})} /></div>
                     <div><label className="text-xs block">Puffer (Min)</label><input type="number" className="border p-2 w-full rounded" value={config.bufferMin} onChange={e=>setConfig({...config, bufferMin: parseInt(e.target.value)||0})} /></div>
                  </div>
                  <div className="space-y-2">
                     <h3 className="text-xs font-bold uppercase text-slate-500">Sheet Config</h3>
                     <label className="block text-xs">Spreadsheet ID</label>
                     <input className="w-full border p-2 rounded" value={config.spreadsheetId} onChange={e=>setConfig({...config, spreadsheetId:e.target.value})} />
                     <div className="grid grid-cols-2 gap-2">
                       <div><label className="text-xs">Prog Sheet</label><input className="w-full border p-2 rounded" value={config.sheetNameProgram} onChange={e=>setConfig({...config, sheetNameProgram:e.target.value})} /></div>
                       <div><label className="text-xs">Stages Sheet</label><input className="w-full border p-2 rounded" value={config.sheetNameStages} onChange={e=>setConfig({...config, sheetNameStages:e.target.value})} /></div>
                     </div>
                  </div>
                  <div className="space-y-2 border-t pt-2">
                     <h3 className="text-xs font-bold uppercase text-slate-500">Auth</h3>
                     <input className="w-full border p-2 rounded text-xs font-mono" placeholder="Client ID" value={config.googleClientId} onChange={e=>setConfig({...config, googleClientId:e.target.value})} />
                     <input className="w-full border p-2 rounded text-xs font-mono" placeholder="API Key" value={config.googleApiKey} onChange={e=>setConfig({...config, googleApiKey:e.target.value})} />
                  </div>
               </div>
               <div className="flex justify-end gap-2 mt-4">
                  <button onClick={()=>setShowSettings(false)} className="px-4 py-2 border rounded">Abbrechen</button>
                  <button onClick={()=>{
                     Object.keys(config).forEach(k=>localStorage.setItem(`kosmos_${k}`, config[k]));
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

// Session Modal logic remains same
const SessionModal = ({ isOpen, onClose, onSave, onDelete, initialData, definedStages, speakersList, moderatorsList }) => {
  // Initialize with INBOX as default for NEW sessions
  const [formData, setFormData] = useState({
    id: '', title: '', start: '10:00', duration: 60, stage: INBOX_ID,
    status: '5_Vorschlag', format: 'Vortrag', speakers: [], moderators: [], day: '20.09.',
    partner: 'FALSE', language: 'de', notes: '', stageDispo: ''
  });
  const [searchTermSp, setSearchTermSp] = useState('');
  const [searchTermMod, setSearchTermMod] = useState('');

  useEffect(() => {
    if (initialData) {
      const duration = initialData.duration || (initialData.end && initialData.start !== '-' ? timeToMinutes(initialData.end) - timeToMinutes(initialData.start) : 60);
      setFormData({
        ...initialData,
        duration: duration > 0 ? duration : 60,
        speakers: Array.isArray(initialData.speakers) ? initialData.speakers : (initialData.speakers ? initialData.speakers.split(',').map(s => s.trim()).filter(Boolean) : []),
        moderators: Array.isArray(initialData.moderators) ? initialData.moderators : (initialData.moderators ? initialData.moderators.split(',').map(s => s.trim()).filter(Boolean) : [])
      });
    } else {
      // DEFAULT FOR NEW: INBOX
      setFormData({
        id: generateId(), title: '', start: '10:00', duration: 60, stage: INBOX_ID,
        status: '5_Vorschlag', format: 'Vortrag', speakers: [], moderators: [], day: '20.09.',
        partner: 'FALSE', language: 'de', notes: '', stageDispo: ''
      });
    }
    setSearchTermSp('');
    setSearchTermMod('');
  }, [initialData, definedStages, isOpen]);

  const toggleListSelection = (field, name) => {
    if (field === 'speakers') {
        setFormData(prev => {
            const exists = prev.speakers.includes(name);
            return { ...prev, speakers: exists ? prev.speakers.filter(s => s !== name) : [...prev.speakers, name] };
        });
    } else if (field === 'moderators') {
        setFormData(prev => {
            const exists = prev.moderators.includes(name);
            return { ...prev, moderators: exists ? prev.moderators.filter(s => s !== name) : [...prev.moderators, name] };
        });
    }
  };

  const micWarning = useMemo(() => {
     if (formData.stage === INBOX_ID) return null;
     const stage = definedStages.find(s => s.id === formData.stage); // MATCH BY ID
     if (!stage || !stage.maxMics) return null;
     if (formData.speakers.length > stage.maxMics) {
         return `⚠️ Zu viele Sprecher: ${formData.speakers.length} (Max: ${stage.maxMics})`;
     }
     return null;
  }, [formData.stage, formData.speakers, definedStages]);

  const inputStd = "w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all placeholder:text-slate-300";
  const labelStd = "block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wide";

  const filteredSpeakers = speakersList.filter(s => s.fullName.toLowerCase().includes(searchTermSp.toLowerCase()));
  const filteredMods = moderatorsList.filter(m => m.fullName.toLowerCase().includes(searchTermMod.toLowerCase()));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h3 className="font-bold text-lg text-slate-800">{initialData ? 'Session bearbeiten' : 'Neue Session erstellen'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500"/></button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Basis Informationen</h4>
            <div className="grid grid-cols-12 gap-4">
               <div className="col-span-8">
                  <label className={labelStd}>Titel</label>
                  <input type="text" className={`${inputStd} font-bold text-lg`} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
               </div>
               <div className="col-span-4">
                  <label className={labelStd}>Status</label>
                  <select className={inputStd} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                     <option value="5_Vorschlag">🟡 Vorschlag</option>
                     <option value="2_Planung">🔵 Planung</option>
                     <option value="1_Zusage">🟢 Zusage</option>
                     <option value="Fixiert">🔴 Fixiert</option>
                  </select>
               </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
               <div>
                  <label className={labelStd}>Format</label>
                  <select className={inputStd} value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})}>
                     <option value="Vortrag">Vortrag</option>
                     <option value="Panel">Panel</option>
                     <option value="Workshop">Workshop</option>
                  </select>
               </div>
               <div><label className={labelStd}>Sprache</label><select className={inputStd} value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})}><option value="de">DE</option><option value="en">EN</option></select></div>
               <div className="flex flex-col justify-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-50 p-2 rounded border border-slate-200 hover:border-blue-300 transition-colors">
                     <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.partner === 'TRUE' ? 'bg-blue-600' : 'bg-slate-300'}`}>
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${formData.partner === 'TRUE' ? 'translate-x-5' : ''}`}></div>
                     </div>
                     <input type="checkbox" className="hidden" checked={formData.partner === 'TRUE'} onChange={e => setFormData({...formData, partner: e.target.checked ? 'TRUE' : 'FALSE'})} />
                     <span className="text-sm font-medium text-slate-700">Ist Partner-Session</span>
                  </label>
               </div>
            </div>
          </div>
          <div className="space-y-4 bg-slate-50 p-4 rounded border">
             <div className="grid grid-cols-4 gap-4">
               <div className="col-span-2"><label className={labelStd}>Bühne</label><select className={inputStd} value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})}>
                  <option value={INBOX_ID}>📥 Inbox (Parkplatz)</option>
                  {/* Using ID for value, Name for display */}
                  {definedStages.map(s=><option key={s.id} value={s.id}>{s.name} ({s.maxMics} Mics)</option>)}
               </select></div>
               <div><label className={labelStd}>Start</label><input type="time" className={inputStd} value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} /></div>
               <div><label className={labelStd}>Dauer (Min)</label><input type="number" className={inputStd} value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} /></div>
             </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className={labelStd}>Sprecher (Suche)</label>
                <div className="relative mb-2">
                   <Search className="w-3 h-3 absolute left-2 top-2.5 text-slate-400"/>
                   <input className="w-full pl-7 p-1.5 text-xs border rounded" placeholder="Filter..." value={searchTermSp} onChange={e=>setSearchTermSp(e.target.value)} />
                </div>
                <div className="h-32 border rounded overflow-auto p-1 bg-white">
                   {filteredSpeakers.map(s=><div key={s.id} onClick={()=>toggleListSelection('speakers',s.fullName)} className={`text-xs p-1.5 cursor-pointer rounded mb-0.5 flex items-center justify-between ${formData.speakers.includes(s.fullName)?'bg-indigo-100 text-indigo-700 font-bold':'hover:bg-slate-50'}`}><span>{s.fullName}</span>{formData.speakers.includes(s.fullName) && <CheckCircle2 className="w-3 h-3"/>}</div>)}
                </div>
                {micWarning && <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/> {micWarning}</div>}
             </div>
             <div>
                <label className={labelStd}>Moderation (Suche)</label>
                <div className="relative mb-2">
                   <Search className="w-3 h-3 absolute left-2 top-2.5 text-slate-400"/>
                   <input className="w-full pl-7 p-1.5 text-xs border rounded" placeholder="Filter..." value={searchTermMod} onChange={e=>setSearchTermMod(e.target.value)} />
                </div>
                <div className="h-32 border rounded overflow-auto p-1 bg-white">
                   {filteredMods.map(m=><div key={m.id} onClick={()=>toggleListSelection('moderators',m.fullName)} className={`text-xs p-1.5 cursor-pointer rounded mb-0.5 flex items-center justify-between ${formData.moderators.includes(m.fullName)?'bg-pink-100 text-pink-700 font-bold':'hover:bg-slate-50'}`}><span>{m.fullName}</span>{formData.moderators.includes(m.fullName) && <CheckCircle2 className="w-3 h-3"/>}</div>)}
                </div>
             </div>
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Notizen & Technik</h4>
            <textarea className={`${inputStd} h-16 bg-yellow-50/50 border-yellow-200`} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Notizen..." />
            <input className={`${inputStd} text-xs font-mono text-slate-500`} value={formData.stageDispo} readOnly placeholder="Stage Dispo (Automatisch)" />
          </div>
        </div>
        <div className="p-4 border-t flex justify-between bg-slate-50 rounded-b-xl">
           {initialData && <button onClick={()=>{if(window.confirm('Wirklich löschen?')) onDelete(formData.id)}} className="text-red-500 text-sm flex items-center gap-1 hover:bg-red-50 px-3 py-1 rounded transition-colors"><Trash2 className="w-4 h-4"/> Löschen</button>}
           <div className="flex gap-2 ml-auto">
             <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-slate-100 transition-colors">Abbrechen</button>
             <button onClick={()=>onSave({ ...formData, speakers: formData.speakers.join(', '), moderators: formData.moderators.join(', ') }, micWarning)} className="px-6 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 shadow-sm font-medium transition-colors">Speichern</button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;
