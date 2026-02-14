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
  Lock, Unlock, MessageSquare, Globe, Flag, Layout, GripVertical, AlertTriangle
} from 'lucide-react';

// --- KONSTANTEN ---
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const INBOX_ID = 'Inbox';
const HEADER_HEIGHT = 56;
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
  'Panel': 'bg-purple-100 text-purple-900',
  'Workshop': 'bg-orange-100 text-orange-900',
  'Lightning Talk': 'bg-cyan-100 text-cyan-900',
  'Pause': 'bg-gray-200 text-gray-700',
  'Keynote': 'bg-pink-100 text-pink-900'
};

// --- HELPER FUNCTIONS ---
const timeToMinutes = (timeStr) => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  let h = Math.floor(totalMinutes / 60);
  let m = totalMinutes % 60;
  m = Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
  if (m === 60) { m = 0; h += 1; }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const calculateEndTime = (startStr, durationMin) => {
  if (!startStr || startStr === '-') return '-';
  const startMin = timeToMinutes(startStr);
  return minutesToTime(startMin + parseInt(durationMin || 0));
};

const checkOverlap = (startA, endA, startB, endB, buffer = 0) => {
  return (startA < endB + buffer) && (endA + buffer > startB);
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

const SessionCardContent = ({ session, onClick, onToggleLock, isLocked, hasConflict, conflictTooltip, listeners, attributes }) => {
  const formatColor = FORMAT_COLORS[session.format] || 'bg-slate-100 text-slate-700';

  return (
    <Card 
      status={session.status} 
      className={`h-full flex flex-col relative group hover:shadow-md select-none ${isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-grab active:cursor-grabbing'}`}
      onClick={(e) => onClick(session)}
      {...listeners} 
      {...attributes}
    >
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
              <div className="text-red-500 relative group/conflict mr-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-red-600 text-white text-xs rounded shadow-lg hidden group-hover/conflict:block z-50 pointer-events-none">
                  {conflictTooltip}
                </div>
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

       <div className="font-bold text-xs leading-snug mb-1 text-slate-800 line-clamp-2" title={session.title}>
         {session.title || 'Unbenannt'}
       </div>

       <div className="mt-auto space-y-1">
         {session.speakers && (
           <div className="text-[10px] text-slate-600 flex items-center gap-1 truncate" title={session.speakers}>
             <Users className="w-3 h-3 shrink-0 text-indigo-500"/> {session.speakers}
           </div>
         )}
         
         <div className="flex items-center gap-2 text-[9px] text-slate-400 pt-1 border-t border-black/5">
            {session.language && <span className="flex items-center gap-0.5">{session.language.toUpperCase()}</span>}
            {session.partner && <span className="flex items-center gap-0.5 truncate max-w-[60px]"><Flag className="w-2.5 h-2.5" /> {session.partner}</span>}
            {session.notes && (
              <div className="ml-auto relative group/notes">
                <span className="flex items-center gap-0.5 text-blue-500 cursor-help"><MessageSquare className="w-2.5 h-2.5" /></span>
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg hidden group-hover/notes:block z-50 pointer-events-none">
                  {session.notes}
                </div>
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

const DraggableTimelineItem = ({ session, onClick, style, onToggleLock, hasConflict, conflictTooltip }) => {
  const isLocked = session.status === 'Fixiert';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: session.id,
    data: session,
    disabled: isLocked
  });

  const baseStyle = { ...style, opacity: isDragging ? 0 : 1, touchAction: 'none' };

  return (
    <div ref={setNodeRef} style={baseStyle} className={`absolute w-full px-1 z-10 ${isLocked ? 'z-0' : ''}`}>
       <SessionCardContent 
          session={session} onClick={onClick} onToggleLock={onToggleLock} isLocked={isLocked}
          hasConflict={hasConflict} conflictTooltip={conflictTooltip}
          listeners={listeners} attributes={attributes}
       />
    </div>
  );
};

const SortableInboxItem = ({ session, onClick, onToggleLock, hasConflict, conflictTooltip }) => {
  const isLocked = session.status === 'Fixiert';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: session.id, data: session, disabled: isLocked 
  });

  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.3 : 1, touchAction: 'none' };

  return (
    <div ref={setNodeRef} style={style} className="w-[260px] shrink-0">
      <SessionCardContent 
          session={session} onClick={onClick} onToggleLock={onToggleLock} isLocked={isLocked}
          hasConflict={hasConflict} conflictTooltip={conflictTooltip}
          listeners={listeners} attributes={attributes}
       />
    </div>
  );
};

const StageColumn = ({ stage, children, height }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.name,
    data: { type: 'stage', name: stage.name }
  });

  return (
    <div ref={setNodeRef} style={{ height: height + HEADER_HEIGHT }} className={`min-w-[280px] w-full max-w-[320px] border-r border-slate-200 relative transition-colors ${isOver ? 'bg-blue-50/30' : 'bg-white/30 odd:bg-slate-50/50'}`}>
       <div className="bg-white/95 backdrop-blur border-b border-slate-200 p-2 text-center z-20 shadow-sm flex flex-col justify-center" style={{ height: HEADER_HEIGHT }}>
         <div className="font-bold text-slate-700 text-sm truncate">{stage.name}</div>
         <div className="text-[10px] text-slate-400 font-mono">{stage.capacity} PAX</div>
       </div>
       <div className="absolute w-full bottom-0 z-0" style={{ top: HEADER_HEIGHT, height: height }}>
          {/* Grid Background (Separate layer) */}
          <div className="absolute inset-0 pointer-events-none z-0">
             {/* Lines defined by parent or empty */}
          </div>
          {/* Content Layer (Interactive) */}
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
  
  // Settings State
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
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [gapiInited, setGapiInited] = useState(false);

  // Sensor Config: Distance 5px to distinguish click from drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const timelineHeight = (config.endHour - config.startHour) * 60 * PIXELS_PER_MINUTE;

  // Speaker Conflicts Analysis
  const speakerConflicts = useMemo(() => {
    const usage = {};
    const conflicts = {}; 

    data.program.forEach(s => {
      if (s.stage === INBOX_ID || s.start === '-') return;
      if (!s.speakers) return;
      
      const sStart = timeToMinutes(s.start);
      const sEnd = sStart + s.duration;
      const speakerList = s.speakers.split(',').map(n => n.trim()).filter(Boolean);

      speakerList.forEach(sp => {
        if (!usage[sp]) usage[sp] = [];
        
        usage[sp].forEach(existing => {
          if (checkOverlap(sStart, sEnd, existing.start, existing.end, 0)) { 
             if (!conflicts[s.id]) conflicts[s.id] = [];
             if (!conflicts[existing.id]) conflicts[existing.id] = [];
             
             const msg = `Terminkollision: ${sp} ist auch in "${existing.title}"`;
             const msgRev = `Terminkollision: ${sp} ist auch in "${s.title}"`;
             
             if (!conflicts[s.id].includes(msg)) conflicts[s.id].push(msg);
             if (!conflicts[existing.id].includes(msgRev)) conflicts[existing.id].push(msgRev);
          }
        });
        usage[sp].push({ id: s.id, title: s.title, start: sStart, end: sEnd });
      });
    });
    return conflicts;
  }, [data.program]);

  // --- API & DATA LOGIC ---
  useEffect(() => {
    const initGapi = async () => {
       if(window.gapi) {
         await window.gapi.client.init({ apiKey: config.googleApiKey, discoveryDocs: DISCOVERY_DOCS });
         setGapiInited(true);
       }
    };
    if (config.googleApiKey && !gapiInited) {
        const script = document.createElement('script');
        script.src = "https://apis.google.com/js/api.js";
        script.onload = () => window.gapi.load('client', initGapi);
        document.body.appendChild(script);
    }
    if (config.googleClientId && !tokenClient) {
        const script = document.createElement('script');
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = () => {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: config.googleClientId, scope: SCOPES,
                callback: (r) => { if(r.access_token) setIsAuthenticated(true); }
            });
            setTokenClient(client);
        };
        document.body.appendChild(script);
    }
  }, [config]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !gapiInited || !config.spreadsheetId) return;
    setStatus({ loading: true, error: null });
    try {
      const batch = await window.gapi.client.sheets.spreadsheets.values.batchGet({
        spreadsheetId: config.spreadsheetId,
        ranges: [
          `${config.sheetNameSpeakers}!A2:E`,
          `${config.sheetNameMods}!A2:C`,
          `${config.sheetNameProgram}!A2:N`,
          `${config.sheetNameStages}!A2:H`
        ]
      });
      const ranges = batch.result.valueRanges;
      
      // Filter Speaker by Status (Strict check with partial match)
      const allowedSpeakerStatus = ['zusage', 'interess', 'angefragt', 'eingeladen', 'vorschlag'];
      const sp = (ranges[0].values || []).filter(r => {
          const s = (r[0] || '').toLowerCase();
          return allowedSpeakerStatus.some(k => s.includes(k));
      }).map((r,i) => ({id:`sp-${i}`, fullName:`${r[2]||''} ${r[3]||''}`, status:r[0]}));

      const mo = (ranges[1].values || []).filter(r=>r[0]).map((r,i) => ({id:`mod-${i}`, fullName:r[1], status:r[0]}));
      const st = (ranges[3].values || []).map((r,i) => ({id:r[0]||`st-${i}`, name:r[1], capacity:r[2]}));
      if (st.length===0) st.push({id:'main', name:'Main Stage', capacity:200});

      const pr = (ranges[2].values || []).map((r,i) => {
         const dur = parseInt(r[8]) || 60;
         const start = r[6] || '-';
         let stage = r[5] || INBOX_ID;
         if(!st.find(s=>s.name === stage) && stage !== INBOX_ID) stage = INBOX_ID; 
         
         return {
           id: r[0] || `p-${i}`, title: r[1], status: r[2]||'5_Vorschlag', partner: r[3],
           format: r[4]||'Talk', stage: stage, start: start, duration: dur,
           end: calculateEndTime(start, dur), speakers: r[9], moderators: r[10], language: r[11], notes: r[12]
         };
      });
      setData({ speakers: sp, moderators: mo, stages: st, program: pr });
      setStatus({ loading: false, error: null });
      setLocalChanges(false);
    } catch(e) {
      setStatus({ loading: false, error: e.message });
    }
  }, [isAuthenticated, gapiInited, config]);

  const handleSync = async () => {
    if (!isAuthenticated) return;
    setStatus({ loading: true, error: null });
    try {
        const rows = data.program.map(p => [
            p.id, p.title, p.status, p.partner, p.format, 
            p.stage === INBOX_ID ? '' : p.stage, 
            p.start === '-' ? '' : p.start, 
            p.start === '-' ? '' : calculateEndTime(p.start, p.duration), 
            p.duration, p.speakers, p.moderators, p.language, p.notes
        ]);
        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: config.spreadsheetId, range: `${config.sheetNameProgram}!A2:N`,
            valueInputOption: 'USER_ENTERED', resource: { values: rows }
        });
        setLocalChanges(false);
        setStatus({ loading: false, error: null });
        setToast({ msg: "Programm erfolgreich gespeichert!", type: "success" });
        setTimeout(() => setToast(null), 3000);
    } catch (e) {
        setStatus({ loading: false, error: e.message });
    }
  };

  // --- DRAG & DROP LOGIC ---

  const handleDragStart = (event) => {
    setActiveDragItem(event.active.data.current);
  };

  const handleDragMove = (event) => {
    const { over, delta } = event;
    if (!over || !activeDragItem) {
        setGhostPosition(null);
        return;
    }

    const stageName = over.id; 
    if (stageName === INBOX_ID) {
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
       p.stage === stageName &&
       p.stage !== INBOX_ID &&
       checkOverlap(ghostStart, ghostEnd, timeToMinutes(p.start), timeToMinutes(p.start) + p.duration, config.bufferMin)
    );

    setGhostPosition({
        stageId: stageName,
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
    const targetStage = over.id;
    const session = active.data.current;

    if (targetStage === INBOX_ID) {
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
       p.stage === targetStage &&
       p.stage !== INBOX_ID &&
       checkOverlap(newStartMinutes, newEndMinutes, timeToMinutes(p.start), timeToMinutes(p.start) + p.duration, config.bufferMin)
    );

    if (collisions.length > 0) {
        if (collisions.some(c => c.status === 'Fixiert')) {
            setToast({ msg: "Konflikt mit fixierter Session! Verschieben nicht möglich.", type: "error" });
            setTimeout(() => setToast(null), 3000);
            return;
        }

        const swapCandidate = collisions.find(c => c.duration === session.duration);
        if (swapCandidate && collisions.length === 1) {
             setData(prev => {
               const newProg = prev.program.map(p => {
                 if (p.id === session.id) return { ...p, stage: targetStage, start: minutesToTime(newStartMinutes), end: calculateEndTime(minutesToTime(newStartMinutes), p.duration) };
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
                 return { ...p, stage: targetStage, start: minutesToTime(newStartMinutes), end: calculateEndTime(minutesToTime(newStartMinutes), p.duration) };
              }
              if (collisionIds.includes(p.id)) {
                 return { ...p, stage: INBOX_ID, start: '-' };
              }
              return p;
           });
           return { ...prev, program: newProg };
        });
        setLocalChanges(true);
        setToast({ msg: `${collisions.length} Session(s) in die Inbox verschoben.`, type: "info" });
        setTimeout(() => setToast(null), 3000);

    } else {
        const newTimeStr = minutesToTime(newStartMinutes);
        if (session.start !== newTimeStr || session.stage !== targetStage) {
            updateSession(session.id, { stage: targetStage, start: newTimeStr });
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

  const handleSaveSession = (session) => {
    let newProgram;
    if (editingSession && editingSession.id === session.id) {
      newProgram = data.program.map(p => p.id === session.id ? session : p);
    } else {
      newProgram = [...data.program, { ...session, id: `NEW-${Math.floor(Math.random()*100000)}` }];
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
      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg z-50 text-sm font-bold text-white
           ${toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
           {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center shrink-0 z-40 shadow-sm">
        <div>
           <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">KOSMOS Planer</h1>
           <div className="flex gap-2 text-[10px] font-bold uppercase text-slate-400">
              {status.loading && <span className="text-blue-500 animate-pulse">Laden...</span>}
              {localChanges && <span className="text-orange-500 bg-orange-100 px-1 rounded">● Ungespeichert</span>}
           </div>
        </div>
        <div className="flex items-center gap-2">
            {!isAuthenticated ? (
               <button onClick={()=>tokenClient?.requestAccessToken({prompt:''})} className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm flex gap-2 items-center"><LogIn className="w-3 h-3"/> Login</button>
            ) : (
               <>
                 <button onClick={loadData} className="p-2 hover:bg-slate-100 rounded text-slate-500"><RefreshCw className="w-4 h-4"/></button>
                 <button onClick={handleSync} disabled={!localChanges} className={`flex items-center gap-2 px-3 py-1.5 rounded text-white text-sm font-bold shadow-sm ${localChanges ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300'}`}>
                    <UploadCloud className="w-3 h-3"/> Speichern
                 </button>
               </>
            )}
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={()=>{setEditingSession(null);setIsModalOpen(true)}} className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"><PlusCircle className="w-5 h-5"/></button>
            <button onClick={()=>setShowSettings(true)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><Settings className="w-5 h-5"/></button>
        </div>
      </header>

      {status.error && <div className="bg-red-50 text-red-600 p-2 text-xs text-center border-b border-red-200">{status.error}</div>}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 overflow-hidden">
          {/* SIDEBAR */}
          {isAuthenticated && (
            <div className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0 z-30 shadow-lg">
                <div className="p-3 border-b border-slate-100 font-bold text-xs text-slate-500 uppercase">SprecherInnen ({data.speakers.length})</div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                   {data.speakers.map(s => (
                     <div key={s.id} className="text-[11px] py-1 px-2 border-b border-slate-50 text-slate-700 truncate hover:bg-slate-50 flex justify-between">
                       <span>{s.fullName}</span>
                       <span className="text-[9px] text-slate-400">{s.status.substring(0,3)}</span>
                     </div>
                   ))}
                </div>
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden relative">
             {/* INBOX */}
             <div className="bg-slate-100 border-b border-slate-300 p-2 shrink-0 h-48 flex flex-col shadow-inner z-20">
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                   <Layout className="w-3 h-3"/> Inbox
                </div>
                <div className="flex-1 overflow-x-auto custom-scrollbar">
                   <SortableContext id={INBOX_ID} items={data.program.filter(p=>p.stage===INBOX_ID).map(p=>p.id)}>
                      <div className="flex gap-2 h-full items-center px-2">
                         <DroppableStage id={INBOX_ID} className="flex gap-2 h-full items-center min-w-[50px]">
                            {data.program.filter(p=>p.stage===INBOX_ID).map(p => (
                               <SortableInboxItem 
                                  key={p.id} session={p} 
                                  onClick={()=> {setEditingSession(p); setIsModalOpen(true)}}
                                  onToggleLock={(s)=>updateSession(s.id, {status: s.status==='Fixiert'?'2_Planung':'Fixiert'})}
                                  hasConflict={!!speakerConflicts[p.id]}
                                  conflictTooltip={speakerConflicts[p.id]?.join(' | ')}
                               />
                            ))}
                         </DroppableStage>
                      </div>
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
                         {/* GHOST */}
                         {ghostPosition && ghostPosition.stageId === stage.name && (
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
                         {/* SESSIONS */}
                         {data.program.filter(p => p.stage === stage.name).map(session => (
                            <DraggableTimelineItem 
                               key={session.id}
                               session={session}
                               style={getPos(session.start, session.duration)}
                               onClick={()=>{setEditingSession(session); setIsModalOpen(true)}}
                               onToggleLock={(s)=>updateSession(s.id, {status: s.status==='Fixiert'?'2_Planung':'Fixiert'})}
                               hasConflict={!!speakerConflicts[session.id]}
                               conflictTooltip={speakerConflicts[session.id]?.join(' | ')}
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

// Session Modal (Complete)
const SessionModal = ({ isOpen, onClose, onSave, onDelete, initialData, definedStages, speakersList, moderatorsList }) => {
  const [formData, setFormData] = useState({
    id: '', title: '', start: '10:00', duration: 60, stage: 'Main Stage',
    status: '5_Vorschlag', format: 'Talk', speakers: [], moderators: '', day: '20.09.',
    partner: '', language: 'de', notes: ''
  });

  useEffect(() => {
    if (initialData) {
      const duration = initialData.duration || (initialData.end && initialData.start !== '-' ? timeToMinutes(initialData.end) - timeToMinutes(initialData.start) : 60);
      setFormData({
        ...initialData,
        duration: duration > 0 ? duration : 60,
        speakers: initialData.speakers ? initialData.speakers.split(',').map(s => s.trim()).filter(s => s) : []
      });
    } else {
      setFormData({
        id: '', title: '', start: '10:00', duration: 60, stage: definedStages[0]?.name || 'Main Stage',
        status: '5_Vorschlag', format: 'Talk', speakers: [], moderators: '', day: '20.09.',
        partner: '', language: 'de', notes: ''
      });
    }
  }, [initialData, definedStages, isOpen]);

  const toggleListSelection = (field, name) => {
    if (field === 'speakers') {
        setFormData(prev => {
            const exists = prev.speakers.includes(name);
            return { ...prev, speakers: exists ? prev.speakers.filter(s => s !== name) : [...prev.speakers, name] };
        });
    } else if (field === 'moderators') {
        setFormData(prev => ({ ...prev, moderators: name })); 
    }
  };

  const inputStd = "w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all placeholder:text-slate-300";
  const labelStd = "block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wide";

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
               <div><label className={labelStd}>Format</label><input type="text" list="formats" className={inputStd} value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})} /></div>
               <div><label className={labelStd}>Sprache</label><select className={inputStd} value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})}><option value="de">DE</option><option value="en">EN</option></select></div>
               <div><label className={labelStd}>Partner</label><input type="text" className={inputStd} value={formData.partner} onChange={e => setFormData({...formData, partner: e.target.value})} /></div>
            </div>
          </div>
          <div className="space-y-4 bg-slate-50 p-4 rounded border">
             <div className="grid grid-cols-4 gap-4">
               <div className="col-span-2"><label className={labelStd}>Bühne</label><select className={inputStd} value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})}>{definedStages.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
               <div><label className={labelStd}>Start</label><input type="time" className={inputStd} value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} /></div>
               <div><label className={labelStd}>Dauer (Min)</label><input type="number" className={inputStd} value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} /></div>
             </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div><label className={labelStd}>Sprecher</label><div className="h-32 border rounded overflow-auto p-1">{speakersList.map(s=><div key={s.id} onClick={()=>toggleListSelection('speakers',s.fullName)} className={`text-xs p-1 cursor-pointer hover:bg-slate-100 ${formData.speakers.includes(s.fullName)?'bg-indigo-100 text-indigo-700':''}`}>{s.fullName}</div>)}</div></div>
             <div><label className={labelStd}>Moderation</label><div className="h-32 border rounded overflow-auto p-1">{moderatorsList.map(m=><div key={m.id} onClick={()=>toggleListSelection('moderators',m.fullName)} className={`text-xs p-1 cursor-pointer hover:bg-slate-100 ${formData.moderators===m.fullName?'bg-pink-100 text-pink-700':''}`}>{m.fullName}</div>)}</div></div>
          </div>
        </div>
        <div className="p-4 border-t flex justify-between">
           {initialData && <button onClick={()=>onDelete(formData.id)} className="text-red-500 text-sm flex items-center gap-1"><Trash2 className="w-4 h-4"/> Löschen</button>}
           <div className="flex gap-2">
             <button onClick={onClose} className="px-4 py-2 border rounded text-sm">Abbrechen</button>
             <button onClick={()=>onSave({...formData, speakers: formData.speakers.join(', ')})} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Speichern</button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;
