import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Lock, Unlock, MessageSquare, Globe, Flag, Layout
} from 'lucide-react';

// --- KONFIGURATION & KONSTANTEN ---
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const INBOX_ID = 'Inbox';
const START_HOUR = 9; 
const END_HOUR = 22;
const PIXELS_PER_MINUTE = 2.5; 
const SNAP_MINUTES = 5; 
const HEADER_HEIGHT = 56; // 3.5rem (h-14)

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

// --- COMPONENTS ---

// Card Component (Visuals only)
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

// Shared Content for Session Card
const SessionCardContent = ({ session, onClick, onToggleLock, isLocked, listeners, attributes }) => {
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
         
         <div className="flex gap-1 shrink-0 z-10">
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

// Droppable Stage Container (Inbox)
const DroppableStage = ({ id, children, className }) => {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
};

// Draggable Item for Timeline
const DraggableTimelineItem = ({ session, onClick, style, onToggleLock }) => {
  const isLocked = session.status === 'Fixiert';
  
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: session.id,
    data: session,
    disabled: isLocked
  });

  const baseStyle = {
    ...style,
    opacity: isDragging ? 0 : 1, 
  };

  return (
    <div ref={setNodeRef} style={baseStyle} className={`absolute w-full px-1 z-10 ${isLocked ? 'z-0' : ''}`}>
       <SessionCardContent 
          session={session} 
          onClick={onClick} 
          onToggleLock={onToggleLock} 
          isLocked={isLocked}
          listeners={listeners}
          attributes={attributes}
       />
    </div>
  );
};

// Sortable Item for Inbox
const SortableInboxItem = ({ session, onClick, onToggleLock }) => {
  const isLocked = session.status === 'Fixiert';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: session.id, 
    data: session,
    disabled: isLocked 
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="w-[260px] shrink-0">
      <SessionCardContent 
          session={session} 
          onClick={onClick} 
          onToggleLock={onToggleLock} 
          isLocked={isLocked}
          listeners={listeners}
          attributes={attributes}
       />
    </div>
  );
};

// Stage Column (Timeline Column)
const StageColumn = ({ stage, children, activeDrag }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.name,
    data: { type: 'stage', name: stage.name }
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`min-w-[280px] w-full max-w-[320px] border-r border-slate-200 relative transition-colors ${isOver ? 'bg-blue-50/30' : 'bg-white/30 odd:bg-slate-50/50'}`}
    >
       {/* Stage Header - Fixed Height */}
       <div 
          className="bg-white/95 backdrop-blur border-b border-slate-200 p-2 text-center z-20 shadow-sm flex flex-col justify-center"
          style={{ height: HEADER_HEIGHT }}
       >
         <div className="font-bold text-slate-700 text-sm truncate">{stage.name}</div>
         <div className="text-[10px] text-slate-400 font-mono">{stage.capacity} PAX</div>
       </div>
       
       {/* Content Container - Absolute to match grid perfectly */}
       <div className="absolute w-full bottom-0 z-0" style={{ top: HEADER_HEIGHT }}>
          {/* Grid Background */}
          <div className="absolute inset-0 pointer-events-none">
              {Array.from({ length: (END_HOUR - START_HOUR) }).map((_, i) => (
                <div key={i} className="border-b border-slate-100 w-full" style={{ height: `${60 * PIXELS_PER_MINUTE}px` }}></div>
              ))}
          </div>
          
          {/* Sessions */}
          {children}
       </div>
    </div>
  );
};

// --- MODAL: SESSION EDITOR ---
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
          {/* Section 1: Core Info */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Basis Informationen</h4>
            <div className="grid grid-cols-12 gap-4">
               <div className="col-span-8">
                  <label className={labelStd}>Titel der Session <span className="text-red-500">*</span></label>
                  <input type="text" className={`${inputStd} font-bold text-lg`} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Titel eingeben..." />
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
                  <input type="text" list="formats" className={inputStd} value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})} />
                  <datalist id="formats"><option value="Talk"/><option value="Panel"/><option value="Workshop"/><option value="Pause"/></datalist>
               </div>
               <div>
                  <label className={labelStd}>Sprache</label>
                  <select className={inputStd} value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})}>
                     <option value="de">Deutsch</option>
                     <option value="en">Englisch</option>
                  </select>
               </div>
               <div>
                  <label className={labelStd}>Partner</label>
                  <input type="text" className={inputStd} value={formData.partner} onChange={e => setFormData({...formData, partner: e.target.value})} />
               </div>
            </div>
          </div>

          <div className="space-y-4">
             <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Zeit & Ort</h4>
             <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-4 gap-4">
               <div className="col-span-2">
                  <label className={labelStd}>Bühne</label>
                  <select className={`${inputStd} bg-white`} value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})}>
                    <option value={INBOX_ID}>📥 Inbox</option>
                    {definedStages.map(s => (
                       <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
               </div>
               <div>
                  <label className={labelStd}>Startzeit</label>
                  <input type="time" className={inputStd} value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
               </div>
               <div>
                  <label className={labelStd}>Dauer (Min)</label>
                  <input type="number" className={inputStd} value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} />
               </div>
             </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Personen</h4>
            <div className="grid grid-cols-2 gap-6">
               <div>
                  <label className={`${labelStd} mb-2 block`}>SprecherInnen</label>
                  <div className="border border-slate-300 rounded p-2 min-h-[40px] flex flex-wrap gap-2 bg-white mb-2 text-sm">
                     {formData.speakers.map(s => (
                       <span key={s} className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded flex items-center gap-1 border border-indigo-200">
                         {s} <button onClick={() => toggleListSelection('speakers', s)}><X className="w-3 h-3"/></button>
                       </span>
                     ))}
                  </div>
                  <div className="h-40 border border-slate-300 rounded overflow-y-auto bg-white p-1 space-y-1">
                     {speakersList.map(s => (
                        <div key={s.id} onClick={() => toggleListSelection('speakers', s.fullName)} 
                             className={`cursor-pointer px-2 py-1 rounded text-xs truncate transition-colors ${formData.speakers.includes(s.fullName) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}>
                           {s.fullName}
                        </div>
                     ))}
                  </div>
               </div>
               <div>
                  <label className={`${labelStd} mb-2 block`}>Moderation</label>
                  <div className="border border-slate-300 rounded p-2 min-h-[40px] flex items-center bg-white mb-2 text-sm">
                     {formData.moderators ? (
                       <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded flex items-center gap-1 border border-pink-200">
                         {formData.moderators} <button onClick={() => setFormData({...formData, moderators: ''})}><X className="w-3 h-3"/></button>
                       </span>
                     ) : <span className="text-slate-400 italic text-xs">Leer</span>}
                  </div>
                  <div className="h-40 border border-slate-300 rounded overflow-y-auto bg-white p-1 space-y-1">
                     {moderatorsList.map(m => (
                        <div key={m.id} onClick={() => toggleListSelection('moderators', m.fullName)} 
                             className={`cursor-pointer px-2 py-1 rounded text-xs truncate transition-colors ${formData.moderators === m.fullName ? 'bg-pink-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}>
                           {m.fullName}
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Notizen</h4>
            <textarea className={`${inputStd} h-20 bg-yellow-50/50 border-yellow-200`} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="..." />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-between bg-slate-50 rounded-b-xl">
          {initialData ? (
             <button onClick={() => onDelete(formData.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded flex items-center gap-2 text-sm"><Trash2 className="w-4 h-4"/> Löschen</button>
          ) : <div></div>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded text-sm">Abbrechen</button>
            <button onClick={() => onSave({ ...formData, speakers: formData.speakers.join(', ') })} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-md font-medium text-sm">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

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
    sheetNameStages: localStorage.getItem('kosmos_sheet_stages') || 'Bühnen_Import'
  });

  const [activeDragItem, setActiveDragItem] = useState(null);
  const [ghostPosition, setGhostPosition] = useState(null); 

  const [localChanges, setLocalChanges] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [gapiInited, setGapiInited] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
      
      const sp = (ranges[0].values || []).filter(r=>r[0]).map((r,i) => ({id:`sp-${i}`, fullName:`${r[2]||''} ${r[3]||''}`, status:r[0]}));
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
        alert('Gespeichert!');
    } catch (e) {
        setStatus({ loading: false, error: e.message });
    }
  };

  const handleSaveSession = (session) => {
    let newProgram;
    if (editingSession && editingSession.id === session.id) {
      newProgram = data.program.map(p => p.id === session.id ? session : p);
    } else {
      newProgram = [...data.program, { ...session, id: `NEW-${Math.floor(Math.random()*100000)}` }];
    }
    // Update calculated fields
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

  // --- DRAG & DROP LOGIC ---

  const handleDragStart = (event) => {
    const session = event.active.data.current;
    setActiveDragItem(session);
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
        currentStartMinutes = (START_HOUR * 60) + (delta.y / PIXELS_PER_MINUTE);
    } else {
        const originalMinutes = timeToMinutes(activeDragItem.start);
        currentStartMinutes = originalMinutes + (delta.y / PIXELS_PER_MINUTE);
    }
    
    const snappedMinutes = Math.round(currentStartMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    const clampedMinutes = Math.max(START_HOUR*60, Math.min(END_HOUR*60, snappedMinutes));
    
    const topPx = (clampedMinutes - (START_HOUR * 60)) * PIXELS_PER_MINUTE;
    const heightPx = activeDragItem.duration * PIXELS_PER_MINUTE;

    setGhostPosition({
        stageId: stageName,
        top: topPx,
        height: heightPx,
        timeLabel: minutesToTime(clampedMinutes)
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
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

    if (ghostPosition) {
         const timeStr = ghostPosition.timeLabel;
         updateSession(session.id, { stage: targetStage, start: timeStr });
    } else if (session.stage === INBOX_ID || session.start === '-') {
        updateSession(session.id, { stage: targetStage, start: '10:00' });
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
    const top = (min - (START_HOUR * 60)) * PIXELS_PER_MINUTE;
    const height = duration * PIXELS_PER_MINUTE;
    return { top: `${Math.max(0, top)}px`, height: `${Math.max(20, height)}px` };
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 font-sans overflow-hidden text-slate-900">
      
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

      <DndContext 
        sensors={sensors} 
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 overflow-hidden">
          
          {/* SIDEBAR (DB) */}
          {isAuthenticated && (
            <div className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0 z-30 shadow-lg">
                <div className="p-3 border-b border-slate-100 font-bold text-xs text-slate-500 uppercase">SprecherInnen ({data.speakers.length})</div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                   {data.speakers.map(s => (
                     <div key={s.id} className="text-[11px] py-1 px-2 border-b border-slate-50 text-slate-700 truncate hover:bg-slate-50">{s.fullName}</div>
                   ))}
                </div>
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden relative">
             
             {/* INBOX */}
             <div className="bg-slate-100 border-b border-slate-300 p-2 shrink-0 h-48 flex flex-col shadow-inner z-20">
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                   <Layout className="w-3 h-3"/> Inbox (Drag to Timeline)
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
                <div className="w-12 bg-white border-r border-slate-200 shrink-0 sticky left-0 z-30 shadow-sm min-h-[1600px]">
                   <div style={{height: HEADER_HEIGHT}} className="border-b border-slate-200 bg-white sticky top-0 z-40"></div> 
                   
                   <div className="absolute w-full bottom-0 z-0" style={{ top: HEADER_HEIGHT }}>
                      {Array.from({length: END_HOUR-START_HOUR + 1}).map((_,i) => (
                          <div key={i} className="absolute w-full text-right pr-1 text-[10px] font-mono text-slate-400 border-t border-slate-100 -mt-px pt-1"
                              style={{top: `${i*60*PIXELS_PER_MINUTE}px`}}>
                            {START_HOUR+i}:00
                          </div>
                      ))}
                   </div>
                </div>

                {/* STAGES */}
                <div className="flex min-w-full">
                   {data.stages.map(stage => (
                      <StageColumn key={stage.id} stage={stage} activeDrag={activeDragItem}>
                         {/* GHOST PREVIEW */}
                         {ghostPosition && ghostPosition.stageId === stage.name && (
                            <div 
                               className="absolute left-1 right-1 bg-blue-500/20 border-2 border-blue-500 border-dashed rounded z-0 pointer-events-none flex items-center justify-center"
                               style={{ top: ghostPosition.top, height: ghostPosition.height }}
                            >
                               <span className="text-xs font-bold text-blue-700 bg-white/80 px-1 rounded">{ghostPosition.timeLabel}</span>
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
                  <div className="space-y-2">
                     <h3 className="text-xs font-bold uppercase text-slate-500">Google Auth</h3>
                     <label className="block text-xs">Client ID</label>
                     <input className="w-full border p-2 rounded" value={config.googleClientId} onChange={e=>setConfig({...config, googleClientId:e.target.value})} />
                     <label className="block text-xs">API Key</label>
                     <input className="w-full border p-2 rounded" value={config.googleApiKey} onChange={e=>setConfig({...config, googleApiKey:e.target.value})} />
                  </div>
                  <div className="space-y-2">
                     <h3 className="text-xs font-bold uppercase text-slate-500">Sheet Config</h3>
                     <label className="block text-xs">Spreadsheet ID</label>
                     <input className="w-full border p-2 rounded" value={config.spreadsheetId} onChange={e=>setConfig({...config, spreadsheetId:e.target.value})} />
                     <label className="block text-xs">Blatt: Programm (Sync Target)</label>
                     <input className="w-full border p-2 rounded" value={config.sheetNameProgram} onChange={e=>setConfig({...config, sheetNameProgram:e.target.value})} />
                     <label className="block text-xs">Blatt: Bühnen</label>
                     <input className="w-full border p-2 rounded" value={config.sheetNameStages} onChange={e=>setConfig({...config, sheetNameStages:e.target.value})} />
                  </div>
               </div>
               <div className="flex justify-end gap-2 mt-4">
                  <button onClick={()=>setShowSettings(false)} className="px-4 py-2 border rounded">Abbrechen</button>
                  <button onClick={()=>{
                     Object.keys(config).forEach(k=>localStorage.setItem(`kosmos_${k}`, config[k]));
                     window.location.reload();
                  }} className="px-4 py-2 bg-blue-600 text-white rounded">Speichern</button>
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
