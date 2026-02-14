import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay,
  useDroppable
} from '@dnd-kit/core';
import { 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Users, Mic2, RefreshCw, Settings, AlertCircle, 
  Trash2, PlusCircle, UploadCloud, LogIn, X, 
  Lock, Unlock, MessageSquare, Globe, Flag, Layout
} from 'lucide-react';

// --- CONFIGURATION ---
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const INBOX_ID = 'Inbox';

// --- STYLING CONSTANTS ---
const STATUS_COLORS = {
  '5_Vorschlag': 'border-yellow-400 bg-yellow-50',
  '2_Planung': 'border-blue-300 bg-white',
  '1_Zusage': 'border-green-400 bg-green-50',
  'Akzeptiert': 'border-green-500 bg-green-50',
  'Fixiert': 'border-red-500 bg-slate-100 ring-1 ring-red-500' 
};

const FORMAT_COLORS = {
  'Talk': 'bg-blue-50 text-blue-900',
  'Panel': 'bg-purple-50 text-purple-900',
  'Workshop': 'bg-orange-50 text-orange-900',
  'Lightning Talk': 'bg-cyan-50 text-cyan-900',
  'Pause': 'bg-gray-200 text-gray-600',
  'Keynote': 'bg-pink-50 text-pink-900'
};

// --- HELPER FUNCTIONS ---
const timeToMinutes = (timeStr) => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const calculateEndTime = (startStr, durationMin) => {
  if (!startStr || startStr === '-') return '-';
  const startMin = timeToMinutes(startStr);
  return minutesToTime(startMin + parseInt(durationMin || 0));
};

// --- COMPONENTS ---

const Card = ({ children, className = "", onClick, style, status }) => {
  const statusClass = STATUS_COLORS[status] || 'border-slate-200 bg-white';
  return (
    <div 
      onClick={onClick} 
      style={style} 
      className={`rounded-lg shadow-sm border-l-4 p-2 overflow-hidden transition-all ${statusClass} ${className}`}
    >
      {children}
    </div>
  );
};

// Droppable Stage Container
const DroppableStage = ({ id, children, className }) => {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
};

const SortableSessionItem = ({ session, onClick, style, onToggleLock }) => {
  const isLocked = session.status === 'Fixiert';
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: session.id, 
    data: session,
    disabled: isLocked 
  });

  const dndStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
    ...style
  };

  const formatColor = FORMAT_COLORS[session.format] || 'bg-slate-100 text-slate-700';

  return (
    <div ref={setNodeRef} style={dndStyle} {...attributes} {...listeners} className="touch-none mb-2 relative group">
       <Card 
         status={session.status} 
         className={`cursor-pointer hover:shadow-md relative ${isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-grab active:cursor-grabbing'}`}
         onClick={(e) => onClick(session)}
       >
          <div className="flex justify-between items-start mb-1">
            <div className="flex flex-col">
              <span className="font-mono text-xs font-bold text-slate-600">
                {session.stage === INBOX_ID ? `${session.duration} min` : `${session.start} - ${session.end}`}
              </span>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-1 rounded w-fit mt-0.5 ${formatColor}`}>
                {session.format}
              </span>
            </div>
            
            <button 
              onPointerDown={(e) => e.stopPropagation()} 
              onClick={(e) => { e.stopPropagation(); onToggleLock(session); }}
              className={`p-1 rounded hover:bg-black/10 transition-colors ${isLocked ? 'text-red-600' : 'text-slate-400'}`}
              title={isLocked ? "Entsperren" : "Fixieren"}
            >
               {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="font-bold text-sm leading-tight mb-1 text-slate-800 line-clamp-2">
            {session.title || 'Unbenannt'}
          </div>

          <div className="space-y-1">
            {session.speakers && (
              <div className="text-xs text-slate-600 flex items-center gap-1 truncate">
                <Users className="w-3 h-3 shrink-0 text-indigo-500"/> {session.speakers}
              </div>
            )}
            
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 pt-1 border-t border-black/5">
               {session.language && (
                 <span className="flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" /> {session.language}</span>
               )}
               {session.partner && (
                 <span className="flex items-center gap-0.5 truncate max-w-[80px]"><Flag className="w-2.5 h-2.5" /> {session.partner}</span>
               )}
               {/* Notes with Tooltip */}
               {session.notes && (
                 <div className="ml-auto relative group/notes">
                   <span className="flex items-center gap-0.5 text-blue-500 cursor-help">
                     <MessageSquare className="w-2.5 h-2.5" />
                   </span>
                   {/* Tooltip Content */}
                   <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg hidden group-hover/notes:block z-50 pointer-events-none">
                     {session.notes}
                     <div className="absolute top-full right-1 -mt-1 border-4 border-transparent border-t-slate-800"></div>
                   </div>
                 </div>
               )}
            </div>
          </div>
       </Card>
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h3 className="font-bold text-lg text-slate-800">{initialData ? 'Session bearbeiten' : 'Neue Session erstellen'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500"/></button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Editor Fields - Same as before */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Basis Informationen</h4>
            <div className="grid grid-cols-12 gap-4">
               <div className="col-span-8">
                  <label className="label-std">Titel der Session <span className="text-red-500">*</span></label>
                  <input type="text" className="input-std font-bold text-lg" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Titel eingeben..." />
               </div>
               <div className="col-span-4">
                  <label className="label-std">Status</label>
                  <select className="input-std" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                     <option value="5_Vorschlag">🟡 Vorschlag</option>
                     <option value="2_Planung">🔵 Planung</option>
                     <option value="1_Zusage">🟢 Zusage</option>
                     <option value="Fixiert">🔴 Fixiert</option>
                  </select>
               </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
               <div>
                  <label className="label-std">Format</label>
                  <input type="text" list="formats" className="input-std" value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})} />
                  <datalist id="formats"><option value="Talk"/><option value="Panel"/><option value="Workshop"/><option value="Pause"/></datalist>
               </div>
               <div>
                  <label className="label-std">Sprache</label>
                  <select className="input-std" value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})}>
                     <option value="de">Deutsch</option>
                     <option value="en">Englisch</option>
                  </select>
               </div>
               <div>
                  <label className="label-std">Partner</label>
                  <input type="text" className="input-std" value={formData.partner} onChange={e => setFormData({...formData, partner: e.target.value})} />
               </div>
            </div>
          </div>

          <div className="space-y-4">
             <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Zeit & Ort</h4>
             <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-4 gap-4">
               <div className="col-span-2">
                  <label className="label-std">Bühne</label>
                  <select className="input-std bg-white" value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})}>
                    <option value={INBOX_ID}>📥 Inbox</option>
                    {definedStages.map(s => (
                       <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
               </div>
               <div>
                  <label className="label-std">Startzeit</label>
                  <input type="time" className="input-std" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
               </div>
               <div>
                  <label className="label-std">Dauer (Min)</label>
                  <input type="number" className="input-std" value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} />
               </div>
             </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Personen</h4>
            <div className="grid grid-cols-2 gap-6">
               <div>
                  <label className="label-std mb-2 block">SprecherInnen</label>
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
                  <label className="label-std mb-2 block">Moderation</label>
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
            <textarea className="input-std h-20 bg-yellow-50/50 border-yellow-200" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="..." />
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

// --- SYNC MENU ---
const SyncMenu = ({ isOpen, onClose, onSync }) => {
  if (!isOpen) return null;
  return (
    <div className="absolute top-12 right-0 bg-white border border-slate-200 shadow-xl rounded-xl p-4 w-80 z-50">
       <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><UploadCloud className="w-4 h-4 text-blue-600"/> Synchronisierung</h4>
       <div className="text-xs text-amber-700 mb-4 bg-amber-50 p-2 rounded border border-amber-200 flex gap-2 items-start">
         <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>
         <span>Achtung: Überschreibt das Google Sheet mit dem App-Status.</span>
       </div>
       <div className="space-y-2">
         <button onClick={() => onSync('program')} className="w-full text-left px-3 py-3 bg-white hover:bg-blue-50 hover:border-blue-300 rounded-lg text-sm font-medium transition-all border border-slate-200 shadow-sm group">
            <span className="block text-slate-800 group-hover:text-blue-700">Programm speichern</span>
         </button>
       </div>
       <button onClick={onClose} className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600 underline">Abbrechen</button>
    </div>
  );
}


function App() {
  // --- STATE ---
  const [config, setConfig] = useState({
    googleClientId: localStorage.getItem('kosmos_google_client_id') || '',
    googleApiKey: localStorage.getItem('kosmos_google_api_key') || '',
    spreadsheetId: localStorage.getItem('kosmos_spreadsheet_id') || '',
    sheetNameProgram: localStorage.getItem('kosmos_sheet_program') || 'Programm_Export',
    sheetNameSpeakers: localStorage.getItem('kosmos_sheet_speakers') || '26_Kosmos_SprecherInnen',
    sheetNameMods: localStorage.getItem('kosmos_sheet_mods') || '26_Kosmos_Moderation',
    sheetNameStages: localStorage.getItem('kosmos_sheet_stages') || 'Bühnen_Import'
  });

  const [data, setData] = useState({ speakers: [], moderators: [], program: [], stages: [] });
  const [status, setStatus] = useState({ loading: false, error: null, lastUpdated: null });
  const [showSettings, setShowSettings] = useState(false);
  const [showSyncMenu, setShowSyncMenu] = useState(false);
  
  const [tokenClient, setTokenClient] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [gapiInited, setGapiInited] = useState(false);

  const [localChanges, setLocalChanges] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- GOOGLE AUTH ---
  useEffect(() => {
    const initGapi = async () => {
      if (window.gapi) {
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
          callback: (resp) => { if (resp.access_token) setIsAuthenticated(true); },
        });
        setTokenClient(client);
      };
      document.body.appendChild(script);
    }
  }, [config.googleApiKey, config.googleClientId]);

  // --- DATA LOADING ---
  const loadData = useCallback(async () => {
    if (!isAuthenticated || !gapiInited || !config.spreadsheetId) return;
    setStatus(s => ({ ...s, loading: true, error: null }));
    try {
      const batchGet = await window.gapi.client.sheets.spreadsheets.values.batchGet({
        spreadsheetId: config.spreadsheetId,
        ranges: [ 
            `${config.sheetNameSpeakers}!A2:E`, 
            `${config.sheetNameMods}!A2:C`, 
            `${config.sheetNameProgram}!A2:N`,
            `${config.sheetNameStages}!A2:H`
        ]
      });
      const valueRanges = batchGet.result.valueRanges;
      
      const parsedSpeakers = (valueRanges[0].values || []).filter(r => r[0]).map((r, i) => ({
           id: `sp-${i}`, fullName: `${r[2] || ''} ${r[3] || ''}`.trim(), status: r[0], pronoun: r[4] 
      }));
      const parsedMods = (valueRanges[1].values || []).filter(r => r[0]).map((r, i) => ({
           id: `mod-${i}`, fullName: r[1], status: r[0], function: r[2]
      }));
      
      const parsedStages = (valueRanges[3].values || []).map((r, i) => ({
          id: r[0] || `stage-${i}`, name: r[1] || `Bühne ${i+1}`, capacity: r[2] || '0', type: r[3] || 'standard'
      }));
      if (parsedStages.length === 0) parsedStages.push({ id: 'main', name: 'Main Stage', capacity: 200 });

      const parsedProgram = (valueRanges[2].values || []).map((r, i) => {
        let start = r[6] || '-';
        let duration = parseInt(r[8]);
        if (!duration || isNaN(duration)) duration = 60;
        let stage = r[5] || INBOX_ID;
        if (stage.trim() === '' || stage.toLowerCase() === 'inbox') stage = INBOX_ID;

        return {
          id: r[0] || `prog-gen-${i}`, title: r[1] || 'Ohne Titel', status: r[2] || '5_Vorschlag',
          partner: r[3] || '', format: r[4] || 'Talk', stage: stage,
          start: start, duration: duration, end: calculateEndTime(start, duration),
          speakers: r[9], moderators: r[10], language: r[11] || 'de', notes: r[12] || ''
        };
      });

      setData({ speakers: parsedSpeakers, moderators: parsedMods, program: parsedProgram, stages: parsedStages });
      setStatus(s => ({ ...s, loading: false, lastUpdated: new Date() }));
      setLocalChanges(false);
    } catch (err) {
      setStatus(s => ({ ...s, loading: false, error: err.result?.error?.message || err.message }));
    }
  }, [isAuthenticated, gapiInited, config]);

  const handleSync = async (type) => {
    if (!isAuthenticated) return;
    setStatus(s => ({ ...s, loading: true }));
    setShowSyncMenu(false);
    try {
      if (type === 'program') {
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
        setStatus(s => ({ ...s, loading: false, lastUpdated: new Date() }));
        alert(`Gespeichert!`);
      } 
    } catch (err) {
       setStatus(s => ({ ...s, loading: false, error: err.message }));
    }
  };

  const handleSaveSession = (session) => {
    let newProgram;
    if (editingSession) {
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

  const handleToggleLock = (session) => {
      const newStatus = session.status === 'Fixiert' ? '2_Planung' : 'Fixiert';
      handleSaveSession({ ...session, status: newStatus });
  };

  const handleDeleteSession = (id) => {
      if (window.confirm("Löschen?")) {
          setData(prev => ({ ...prev, program: prev.program.filter(p => p.id !== id) }));
          setLocalChanges(true);
          setIsModalOpen(false);
      }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    const activeItem = data.program.find(p => p.id === activeId);
    
    if (!activeItem || activeItem.status === 'Fixiert') return; 

    // Find Target Stage
    let targetStageName = overId; 
    
    // Check if dropping on another item
    const overItem = data.program.find(p => p.id === overId);
    if (overItem) targetStageName = overItem.stage;

    let updates = {};
    if (targetStageName === INBOX_ID) {
       updates = { stage: INBOX_ID, start: '-' };
    } else {
       if (activeItem.stage === INBOX_ID) updates = { start: '10:00' };
       updates = { ...updates, stage: targetStageName };
    }

    if (activeItem.stage !== targetStageName) {
      setData(prev => ({
        ...prev,
        program: prev.program.map(p => p.id === activeId ? { ...p, ...updates } : p)
      }));
      setLocalChanges(true);
    }
  };

  const stageColumns = useMemo(() => data.stages.map(s => s.name), [data.stages]);

  const START_HOUR = 9; 
  const PIXELS_PER_MINUTE = 2;
  const HEADER_HEIGHT = 56; // Fixed height for alignment

  const getPositionStyle = (start, duration) => {
    if (!start || start === '-') return { position: 'relative' }; 
    const startMin = timeToMinutes(start);
    const top = (startMin - (START_HOUR * 60)) * PIXELS_PER_MINUTE;
    const height = duration * PIXELS_PER_MINUTE;
    return { top: `${Math.max(0, top)}px`, height: `${Math.max(30, height)}px` };
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-900 font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center z-30 shadow-sm shrink-0">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            KOSMOS Planer
          </h1>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-wide font-bold mt-0.5">
             {status.loading ? <span className="text-blue-600 animate-pulse">Sync...</span> : <span>Bereit</span>}
             {localChanges && <span className="text-orange-600 bg-orange-100 px-1 rounded border border-orange-200">● Ungespeichert</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          {!isAuthenticated ? (
            <button onClick={() => tokenClient?.requestAccessToken({ prompt: '' })} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-md transition-all text-sm font-medium">
              <LogIn className="w-4 h-4" /> Login
            </button>
          ) : (
             <>
               <button onClick={loadData} className="p-2 hover:bg-slate-100 rounded text-slate-600" title="Neu laden"><RefreshCw className="w-4 h-4"/></button>
               <div className="relative">
                 <button 
                   onClick={() => setShowSyncMenu(!showSyncMenu)} 
                   disabled={!localChanges && !status.loading}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white shadow-md text-sm font-bold transition-all ${localChanges ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg' : 'bg-slate-400 cursor-not-allowed'}`}
                 >
                   <UploadCloud className="w-4 h-4" /> Speichern
                 </button>
                 <SyncMenu isOpen={showSyncMenu} onClose={() => setShowSyncMenu(false)} onSync={handleSync} />
               </div>
             </>
          )}
          <div className="h-8 w-px bg-slate-200 mx-1"></div>
          <button onClick={() => { setEditingSession(null); setIsModalOpen(true); }} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm"><PlusCircle className="w-5 h-5"/></button>
          <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"><Settings className="w-5 h-5"/></button>
        </div>
      </header>
      
      {status.error && <div className="bg-red-50 border-b border-red-200 text-red-700 p-2 text-xs text-center font-bold">{status.error}</div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 overflow-hidden">
            
            {isAuthenticated && (
              <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-md">
                 <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500"/> Datenbank
                 </div>
                 <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-2">
                    {data.speakers.map(s => (
                        <div key={s.id} className="text-xs p-2 bg-slate-50 border border-slate-100 rounded flex justify-between text-slate-700">
                            <span className="truncate">{s.fullName}</span>
                            <span className={`text-[9px] px-1 rounded ${s.status.includes('1') ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>{s.status.substring(0,1)}</span>
                        </div>
                    ))}
                 </div>
              </div>
            )}

            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                {/* INBOX */}
                <div className="bg-slate-100 border-b border-slate-300 p-4 shrink-0 max-h-[240px] flex flex-col shadow-inner">
                   <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 mb-3">
                     <div className="w-2 h-2 rounded-full bg-slate-400"></div> Inbox
                   </h3>
                   <div className="flex-1 overflow-x-auto custom-scrollbar">
                     <DroppableStage id={INBOX_ID} className="flex gap-3 min-w-max pb-4 h-full items-start px-1">
                        <SortableContext id={INBOX_ID} items={data.program.filter(p => p.stage === INBOX_ID).map(p => p.id)}>
                          {data.program.filter(p => p.stage === INBOX_ID).length === 0 && (
                            <div className="text-slate-400 text-xs italic border-2 border-dashed border-slate-300 rounded-lg px-6 py-4 flex items-center gap-2">
                                <Layout className="w-4 h-4"/> Leer
                            </div>
                          )}
                          {data.program.filter(p => p.stage === INBOX_ID).map(session => (
                            <div key={session.id} className="w-[260px] shrink-0">
                               <SortableSessionItem 
                                  session={session} 
                                  onClick={(s) => { setEditingSession(s); setIsModalOpen(true); }}
                                  onToggleLock={handleToggleLock}
                               />
                            </div>
                          ))}
                        </SortableContext>
                     </DroppableStage>
                   </div>
                </div>

                {/* TIMELINE */}
                <div className="flex-1 overflow-auto relative custom-scrollbar flex bg-slate-100">
                    {/* Time Scale - NOW ALIGNED */}
                    <div className="w-14 bg-white border-r border-slate-200 shrink-0 sticky left-0 z-10 min-h-[1400px] shadow-sm">
                        {/* Placeholder Header matching Stage Header Height */}
                        <div className="border-b border-slate-200 bg-white sticky top-0 z-20" style={{ height: `${HEADER_HEIGHT}px` }}></div>
                        
                        {Array.from({ length: 14 }).map((_, i) => {
                          const h = START_HOUR + i;
                          return (
                            <div key={h} className="absolute w-full text-right pr-2 text-[10px] font-mono text-slate-400 border-t border-slate-100 pt-1"
                                  style={{ top: `${i * 60 * PIXELS_PER_MINUTE}px`, height: '1px' }}>
                              {h}:00
                            </div>
                          )
                        })}
                    </div>

                    {/* Stage Columns */}
                    <div className="flex min-w-full">
                        {stageColumns.map((stageName) => (
                          <DroppableStage key={stageName} id={stageName} className="min-w-[280px] w-full max-w-[360px] border-r border-slate-200 relative bg-white/30 odd:bg-slate-50/50">
                              <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 p-3 text-center z-10 shadow-sm flex flex-col justify-center" style={{ height: `${HEADER_HEIGHT}px` }}>
                                <div className="font-bold text-slate-700 text-sm truncate">{stageName}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    {data.stages.find(s => s.name === stageName)?.capacity || '?'} PAX
                                </div>
                              </div>
                              <SortableContext id={stageName} items={data.program.filter(p => p.stage === stageName).map(p => p.id)} strategy={verticalListSortingStrategy}>
                                <div className="min-h-[1400px] relative w-full">
                                    {data.program.filter(p => p.stage === stageName).map(session => (
                                      <div key={session.id} className="absolute w-full px-1" style={getPositionStyle(session.start, session.duration)}>
                                        <SortableSessionItem 
                                            session={session}
                                            style={{ height: '100%' }}
                                            onClick={(s) => { setEditingSession(s); setIsModalOpen(true); }}
                                            onToggleLock={handleToggleLock}
                                        />
                                      </div>
                                    ))}
                                </div>
                              </SortableContext>
                          </DroppableStage>
                        ))}
                    </div>
                </div>
            </div>
        </div>
        <DragOverlay>
           <div className="w-[260px] opacity-90 rotate-2"><Card status="2_Planung" className="bg-blue-50 border-blue-400 h-24 shadow-xl">Verschiebe...</Card></div>
        </DragOverlay>
      </DndContext>

      {/* Settings Modal - kept same as before */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white p-8 rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
              <h2 className="font-bold text-xl mb-6 flex items-center gap-2 border-b pb-4">
                  <Settings className="w-6 h-6 text-slate-600"/> Konfiguration
              </h2>
              <div className="space-y-6">
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Google Authentifizierung</h3>
                    <div><label className="label-std">Google Client ID</label><input type="text" className="input-std font-mono text-xs" value={config.googleClientId} onChange={e => setConfig({...config, googleClientId: e.target.value})} /></div>
                    <div><label className="label-std">Google API Key</label><input type="text" className="input-std font-mono text-xs" value={config.googleApiKey} onChange={e => setConfig({...config, googleApiKey: e.target.value})} /></div>
                 </div>
                 <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                    <h3 className="text-xs font-bold text-blue-600 uppercase">Google Sheets</h3>
                    <div><label className="label-std">Spreadsheet ID</label><input type="text" className="input-std font-mono text-xs" value={config.spreadsheetId} onChange={e => setConfig({...config, spreadsheetId: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div><label className="label-std">Blatt: Programm</label><input type="text" className="input-std" value={config.sheetNameProgram} onChange={e => setConfig({...config, sheetNameProgram: e.target.value})} /></div>
                        <div><label className="label-std">Blatt: Bühnen</label><input type="text" className="input-std" value={config.sheetNameStages} onChange={e => setConfig({...config, sheetNameStages: e.target.value})} /></div>
                        <div><label className="label-std">Blatt: Sprecher</label><input type="text" className="input-std" value={config.sheetNameSpeakers} onChange={e => setConfig({...config, sheetNameSpeakers: e.target.value})} /></div>
                        <div><label className="label-std">Blatt: Mod</label><input type="text" className="input-std" value={config.sheetNameMods} onChange={e => setConfig({...config, sheetNameMods: e.target.value})} /></div>
                    </div>
                 </div>
              </div>
              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
                 <button onClick={() => setShowSettings(false)} className="px-5 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors font-medium text-sm">Abbrechen</button>
                 <button onClick={() => {
                    Object.keys(config).forEach(k => localStorage.setItem(`kosmos_${k}`, config[k]));
                    setShowSettings(false);
                    window.location.reload(); 
                 }} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md font-bold text-sm">Speichern & Neustart</button>
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

const inputStd = "w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all placeholder:text-slate-300";
const labelStd = "block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wide";

export default App;
