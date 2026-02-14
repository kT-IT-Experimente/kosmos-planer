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
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Users, Mic2, RefreshCw, Settings, Save, AlertCircle, 
  Calendar, Clock, MapPin, Trash2, PlusCircle, UploadCloud, LogIn, X, 
  Lock, Unlock, MessageSquare, Globe, Flag, CheckSquare, Square
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
  'Fixiert': 'border-red-500 bg-slate-100 ring-1 ring-red-500' // Locked look
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
  const startMin = timeToMinutes(startStr);
  return minutesToTime(startMin + parseInt(durationMin || 0));
};

// --- COMPONENTS ---

const Card = ({ children, className = "", onClick, style, status, format }) => {
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

// Sortable Item Wrapper
const SortableSessionItem = ({ session, onClick, style, onDelete, onToggleLock }) => {
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
    disabled: isLocked // Disable DnD if locked
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
         format={session.format}
         className={`cursor-pointer hover:shadow-md ${isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-grab active:cursor-grabbing'}`}
         onClick={(e) => {
            // Prevent edit modal if clicking strictly on action buttons (optional, handled by propagation usually)
            onClick(session);
         }}
       >
          {/* Header Row: Time & Lock */}
          <div className="flex justify-between items-start mb-1">
            <div className="flex flex-col">
              <span className="font-mono text-xs font-bold text-slate-600">
                {session.stage === INBOX_ID ? `${session.duration} min` : `${session.start} - ${session.end}`}
              </span>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-1 rounded w-fit mt-0.5 ${formatColor}`}>
                {session.format}
              </span>
            </div>
            
            <div className="flex gap-1">
               <button 
                  onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
                  onClick={(e) => { e.stopPropagation(); onToggleLock(session); }}
                  className={`p-1 rounded hover:bg-black/10 transition-colors ${isLocked ? 'text-red-600' : 'text-slate-400'}`}
                  title={isLocked ? "Session ist fixiert (Klicken zum Entsperren)" : "Session fixieren"}
               >
                 {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
               </button>
            </div>
          </div>

          {/* Title */}
          <div className="font-bold text-sm leading-tight mb-1 text-slate-800 line-clamp-2">
            {session.title || 'Unbenannt'}
          </div>

          {/* Details Row: Speakers, Lang, Notes */}
          <div className="space-y-1">
            {session.speakers && (
              <div className="text-xs text-slate-600 flex items-center gap-1 truncate">
                <Users className="w-3 h-3 shrink-0 text-indigo-500"/> {session.speakers}
              </div>
            )}
            
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 pt-1 border-t border-black/5">
               {session.language && (
                 <span className="flex items-center gap-0.5" title={`Sprache: ${session.language}`}>
                   <Globe className="w-2.5 h-2.5" /> {session.language}
                 </span>
               )}
               {session.partner && (
                 <span className="flex items-center gap-0.5 truncate max-w-[80px]" title={`Partner: ${session.partner}`}>
                   <Flag className="w-2.5 h-2.5" /> {session.partner}
                 </span>
               )}
               {session.notes && (
                 <span className="flex items-center gap-0.5 text-blue-500 ml-auto" title={session.notes}>
                   <MessageSquare className="w-2.5 h-2.5" /> Info
                 </span>
               )}
            </div>
          </div>
       </Card>
    </div>
  );
};

// --- MODAL: SESSION EDITOR ---
const SessionModal = ({ isOpen, onClose, onSave, onDelete, initialData, stages, speakersList, moderatorsList }) => {
  const initialSpeakers = initialData?.speakers ? initialData.speakers.split(',').map(s => s.trim()) : [];
  
  const [formData, setFormData] = useState({
    id: '', title: '', start: '10:00', duration: 60, stage: 'Main Stage',
    status: '5_Vorschlag', format: 'Talk', speakers: [], moderators: '', day: '20.09.',
    partner: '', language: 'de', notes: ''
  });

  useEffect(() => {
    if (initialData) {
      const duration = initialData.duration || (timeToMinutes(initialData.end) - timeToMinutes(initialData.start)) || 60;
      setFormData({
        ...initialData,
        duration: duration,
        speakers: initialData.speakers ? initialData.speakers.split(',').map(s => s.trim()).filter(s => s) : []
      });
    } else {
      setFormData({
        id: '', title: '', start: '10:00', duration: 60, stage: stages[0] || 'Main Stage',
        status: '5_Vorschlag', format: 'Talk', speakers: [], moderators: '', day: '20.09.',
        partner: '', language: 'de', notes: ''
      });
    }
  }, [initialData, stages]);

  const toggleListSelection = (field, name) => {
    if (field === 'speakers') {
        setFormData(prev => {
            const exists = prev.speakers.includes(name);
            return { ...prev, speakers: exists ? prev.speakers.filter(s => s !== name) : [...prev.speakers, name] };
        });
    } else if (field === 'moderators') {
        // Simple replace for moderators if single string, or append if managing list
        // Assuming single string for simplicity based on previous CSV structure, but let's make it smart
        setFormData(prev => ({ ...prev, moderators: name })); 
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h3 className="font-bold text-lg">{initialData ? 'Session bearbeiten' : 'Neue Session erstellen'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Main Info */}
          <div className="grid grid-cols-12 gap-4">
             <div className="col-span-8">
                <label className="label-xs">Titel der Session</label>
                <input type="text" className="input-std font-bold" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
             </div>
             <div className="col-span-4">
                <label className="label-xs">Status</label>
                <select className="input-std" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                   <option value="5_Vorschlag">Vorschlag (Gelb)</option>
                   <option value="2_Planung">Planung (Blau)</option>
                   <option value="1_Zusage">Zusage (Grün)</option>
                   <option value="Fixiert">Fixiert (Gesperrt)</option>
                </select>
             </div>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-3 gap-4">
             <div>
                <label className="label-xs">Format</label>
                <input type="text" list="formats" className="input-std" value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})} />
                <datalist id="formats"><option value="Talk"/><option value="Panel"/><option value="Workshop"/><option value="Pause"/></datalist>
             </div>
             <div>
                <label className="label-xs">Sprache</label>
                <select className="input-std" value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})}>
                   <option value="de">Deutsch</option>
                   <option value="en">Englisch</option>
                </select>
             </div>
             <div>
                <label className="label-xs">Partner / Host</label>
                <input type="text" className="input-std" value={formData.partner} onChange={e => setFormData({...formData, partner: e.target.value})} />
             </div>
          </div>

          {/* Timing & Location */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-4 gap-4">
             <div className="col-span-2">
                <label className="label-xs">Bühne</label>
                <select className="input-std" value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})}>
                  <option value={INBOX_ID}>-- Inbox (Nicht platziert) --</option>
                  {stages.filter(s => s !== INBOX_ID).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
             </div>
             <div>
                <label className="label-xs">Startzeit</label>
                <input type="time" className="input-std" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
             </div>
             <div>
                <label className="label-xs">Dauer (Min)</label>
                <input type="number" className="input-std" value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} />
             </div>
          </div>

          {/* People Selection */}
          <div className="grid grid-cols-2 gap-6">
             {/* Speakers */}
             <div>
                <label className="label-xs mb-2 block">SprecherInnen</label>
                <div className="border rounded p-2 min-h-[40px] flex flex-wrap gap-2 bg-white mb-2 text-sm">
                   {formData.speakers.map(s => (
                     <span key={s} className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded flex items-center gap-1">
                       {s} <button onClick={() => toggleListSelection('speakers', s)}><X className="w-3 h-3"/></button>
                     </span>
                   ))}
                </div>
                <div className="h-40 border rounded overflow-y-auto bg-slate-50 p-1 space-y-1">
                   {speakersList.map(s => (
                      <div key={s.id} onClick={() => toggleListSelection('speakers', s.fullName)} 
                           className={`cursor-pointer px-2 py-1 rounded text-xs truncate ${formData.speakers.includes(s.fullName) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200 text-slate-700'}`}>
                         {s.fullName}
                      </div>
                   ))}
                </div>
             </div>

             {/* Moderators */}
             <div>
                <label className="label-xs mb-2 block">Moderation</label>
                <div className="border rounded p-2 min-h-[40px] flex items-center bg-white mb-2 text-sm">
                   {formData.moderators ? (
                     <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded flex items-center gap-1">
                       {formData.moderators} <button onClick={() => setFormData({...formData, moderators: ''})}><X className="w-3 h-3"/></button>
                     </span>
                   ) : <span className="text-slate-400 italic text-xs">Niemand ausgewählt</span>}
                </div>
                <div className="h-40 border rounded overflow-y-auto bg-slate-50 p-1 space-y-1">
                   {moderatorsList.map(m => (
                      <div key={m.id} onClick={() => toggleListSelection('moderators', m.fullName)} 
                           className={`cursor-pointer px-2 py-1 rounded text-xs truncate ${formData.moderators === m.fullName ? 'bg-pink-600 text-white' : 'hover:bg-slate-200 text-slate-700'}`}>
                         {m.fullName}
                      </div>
                   ))}
                </div>
             </div>
          </div>
          
          <div>
            <label className="label-xs">Interne Notizen</label>
            <textarea className="input-std h-20" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Technik-Infos, Regie-Hinweise, etc..." />
          </div>

        </div>

        <div className="p-4 border-t border-slate-100 flex justify-between bg-slate-50 rounded-b-xl">
          {initialData ? (
             <button onClick={() => onDelete(formData.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded flex items-center gap-2 text-sm"><Trash2 className="w-4 h-4"/> Löschen</button>
          ) : <div></div>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded text-sm">Abbrechen</button>
            <button onClick={() => onSave({ ...formData, speakers: formData.speakers.join(', ') })} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm font-medium text-sm">Speichern</button>
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
    <div className="absolute top-12 right-0 bg-white border border-slate-200 shadow-xl rounded-xl p-4 w-72 z-50">
       <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><UploadCloud className="w-4 h-4"/> Drive Synchronisierung</h4>
       <p className="text-xs text-slate-500 mb-4 bg-yellow-50 p-2 rounded border border-yellow-100">
         ⚠️ Achtung: Das Speichern überschreibt die Daten im Google Sheet vollständig mit dem aktuellen Stand der App.
       </p>
       <div className="space-y-2">
         <button onClick={() => onSync('program')} className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded text-sm font-medium transition-colors border border-slate-200">
            1. Programm speichern
         </button>
         <button onClick={() => onSync('speakers')} className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded text-sm font-medium transition-colors border border-slate-200">
            2. SprecherInnen speichern
         </button>
         <button onClick={() => onSync('moderators')} className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-pink-50 hover:text-pink-600 rounded text-sm font-medium transition-colors border border-slate-200">
            3. ModeratorInnen speichern
         </button>
       </div>
       <button onClick={onClose} className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600">Abbrechen</button>
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
    sheetNameMods: localStorage.getItem('kosmos_sheet_mods') || '26_Kosmos_Moderation'
  });

  const [data, setData] = useState({ speakers: [], moderators: [], program: [] });
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
        ranges: [ `${config.sheetNameSpeakers}!A2:E`, `${config.sheetNameMods}!A2:C`, `${config.sheetNameProgram}!A2:N` ]
      });
      const valueRanges = batchGet.result.valueRanges;
      
      const parsedSpeakers = (valueRanges[0].values || []).filter(r => r[0]).map((r, i) => ({
           id: `sp-${i}`, fullName: `${r[2] || ''} ${r[3] || ''}`.trim(), status: r[0], pronoun: r[4] 
      }));
      const parsedMods = (valueRanges[1].values || []).filter(r => r[0]).map((r, i) => ({
           id: `mod-${i}`, fullName: r[1], status: r[0], function: r[2]
      }));
      const parsedProgram = (valueRanges[2].values || []).map((r, i) => {
        let start = r[6] || '-';
        let duration = parseInt(r[8]);
        if (!duration || isNaN(duration)) duration = 60;
        
        // Map Status "Fixiert" if in CSV
        let status = r[2] || '5_Vorschlag';
        
        // Determine Stage: Empty or 'Inbox' means Inbox
        let stage = r[5] || INBOX_ID;
        if (stage.trim() === '' || stage.toLowerCase() === 'inbox') stage = INBOX_ID;

        return {
          id: r[0] || `prog-gen-${i}`, title: r[1] || 'Ohne Titel', status: status,
          partner: r[3] || '', format: r[4] || 'Talk', stage: stage,
          start: start, duration: duration, end: calculateEndTime(start, duration),
          speakers: r[9], moderators: r[10], language: r[11] || 'de', notes: r[12] || ''
        };
      });

      setData({ speakers: parsedSpeakers, moderators: parsedMods, program: parsedProgram });
      setStatus(s => ({ ...s, loading: false, lastUpdated: new Date() }));
      setLocalChanges(false);
    } catch (err) {
      console.error(err);
      setStatus(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [isAuthenticated, gapiInited, config]);

  // --- SYNC HANDLER ---
  const handleSync = async (type) => {
    if (!isAuthenticated) return;
    setStatus(s => ({ ...s, loading: true }));
    setShowSyncMenu(false);

    try {
      let range = '';
      let rows = [];

      if (type === 'program') {
        range = `${config.sheetNameProgram}!A2:N`;
        rows = data.program.map(p => [
          p.id, p.title, p.status, p.partner, p.format, 
          p.stage === INBOX_ID ? '' : p.stage, // If inbox, save empty stage in CSV? Or 'Inbox'
          p.start === '-' ? '' : p.start, 
          p.start === '-' ? '' : calculateEndTime(p.start, p.duration), 
          p.duration, p.speakers, p.moderators, p.language, p.notes
        ]);
      } else {
         // Placeholder for speaker/mod sync if implemented later
         alert("Sprecher/Moderator Sync ist in diesem Code-Beispiel noch nicht voll implementiert (nur Programm).");
         setStatus(s => ({ ...s, loading: false }));
         return;
      }

      await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId, range: range, valueInputOption: 'USER_ENTERED', resource: { values: rows }
      });

      setLocalChanges(false);
      setStatus(s => ({ ...s, loading: false, lastUpdated: new Date() }));
      alert(`Erfolgreich synchronisiert: ${type}`);
    } catch (err) {
       console.error(err);
       setStatus(s => ({ ...s, loading: false, error: err.message }));
    }
  };

  // --- LOCAL ACTIONS ---
  const handleSaveSession = (session) => {
    let newProgram;
    if (editingSession) {
      newProgram = data.program.map(p => p.id === session.id ? session : p);
    } else {
      newProgram = [...data.program, { ...session, id: `NEW-${Math.floor(Math.random()*100000)}` }];
    }
    // Update Endtime
    newProgram = newProgram.map(p => ({ ...p, end: calculateEndTime(p.start, p.duration) }));
    setData(prev => ({ ...prev, program: newProgram }));
    setLocalChanges(true);
    setIsModalOpen(false);
    setEditingSession(null);
  };

  const handleToggleLock = (session) => {
      const newStatus = session.status === 'Fixiert' ? '2_Planung' : 'Fixiert';
      const updated = { ...session, status: newStatus };
      handleSaveSession(updated);
  };

  // --- DND LOGIC ---
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Find dragged item
    const activeItem = data.program.find(p => p.id === activeId);
    if (!activeItem || activeItem.status === 'Fixiert') return; // Double check lock

    // Target Determination
    let targetStage = overId;
    
    // If we dropped on another Item, find that item's stage
    const overItem = data.program.find(p => p.id === overId);
    if (overItem) {
      targetStage = overItem.stage;
    }

    // Logic: If moved to Inbox, reset time. If moved to Stage, keep time (or update if implementing time-slot-drop)
    let updates = {};
    if (targetStage === INBOX_ID) {
       updates = { stage: INBOX_ID, start: '-' };
    } else {
       // Moving to a stage
       // If coming from Inbox, maybe set default time? For now keep '-' until edited or define default
       if (activeItem.stage === INBOX_ID) updates = { start: '10:00' };
       updates = { ...updates, stage: targetStage };
    }

    if (activeItem.stage !== targetStage) {
      setData(prev => ({
        ...prev,
        program: prev.program.map(p => p.id === activeId ? { ...p, ...updates } : p)
      }));
      setLocalChanges(true);
    }
  };

  // --- VIEWS ---
  const stages = useMemo(() => {
    const s = [...new Set(data.program.map(p => p.stage))].filter(s => s && s !== INBOX_ID).sort();
    return s.length ? s : ['Main Stage'];
  }, [data.program]);

  // Styling Helpers
  const START_HOUR = 9; 
  const PIXELS_PER_MINUTE = 2;
  const getPositionStyle = (start, duration) => {
    if (!start || start === '-') return { position: 'relative' }; // For Inbox
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
             {status.loading ? <span className="text-blue-600 animate-pulse">Synchronisiere...</span> : <span>Bereit</span>}
             {localChanges && <span className="text-orange-600 bg-orange-100 px-1 rounded">● Ungespeichert</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          {!isAuthenticated ? (
            <button onClick={() => tokenClient?.requestAccessToken({ prompt: '' })} className="btn-primary flex items-center gap-2">
              <LogIn className="w-4 h-4" /> Login
            </button>
          ) : (
             <>
               <button onClick={loadData} className="p-2 hover:bg-slate-100 rounded text-slate-600" title="Neu laden"><RefreshCw className="w-4 h-4"/></button>
               <div className="relative">
                 <button 
                   onClick={() => setShowSyncMenu(!showSyncMenu)} 
                   disabled={!localChanges && !status.loading}
                   className={`btn-primary flex items-center gap-2 ${!localChanges ? 'opacity-50 grayscale' : 'animate-pulse'}`}
                 >
                   <UploadCloud className="w-4 h-4" /> Speichern
                 </button>
                 <SyncMenu isOpen={showSyncMenu} onClose={() => setShowSyncMenu(false)} onSync={handleSync} />
               </div>
             </>
          )}
          <button onClick={() => { setEditingSession(null); setIsModalOpen(true); }} className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"><PlusCircle className="w-5 h-5"/></button>
          <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-slate-600"><Settings className="w-5 h-5"/></button>
        </div>
      </header>
      
      {status.error && <div className="bg-red-600 text-white p-2 text-xs text-center font-bold">{status.error}</div>}

      {/* MAIN CONTENT */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 overflow-hidden">
            
            {/* LEFT SIDEBAR (Speakers/Mods) */}
            {isAuthenticated && (
              <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-md">
                 <div className="p-3 border-b border-slate-100 font-bold text-slate-700 text-sm">Datenbank</div>
                 <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">SprecherInnen ({data.speakers.length})</h4>
                      {data.speakers.map(s => (
                        <div key={s.id} className="text-xs p-1.5 mb-1 bg-slate-50 rounded border border-slate-100 text-slate-700">{s.fullName}</div>
                      ))}
                    </div>
                 </div>
              </div>
            )}

            {/* RIGHT AREA: INBOX & TIMELINE */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
                
                {/* INBOX (TOP) */}
                <div className="bg-slate-200/80 border-b border-slate-300 p-4 shrink-0 max-h-[220px] flex flex-col">
                   <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 mb-2">
                     <div className="w-2 h-2 rounded-full bg-slate-400"></div> Inbox (Ungeplante Sessions)
                   </h3>
                   <div className="flex-1 overflow-x-auto custom-scrollbar">
                     <SortableContext id={INBOX_ID} items={data.program.filter(p => p.stage === INBOX_ID).map(p => p.id)}>
                        <div className="flex gap-3 min-w-max pb-2 h-full items-center">
                          {data.program.filter(p => p.stage === INBOX_ID).length === 0 && (
                            <div className="text-slate-400 text-xs italic border-2 border-dashed border-slate-300 rounded px-4 py-2">Keine Sessions in der Inbox</div>
                          )}
                          {data.program.filter(p => p.stage === INBOX_ID).map(session => (
                            <div key={session.id} className="w-[240px] shrink-0">
                               <SortableSessionItem 
                                  session={session} 
                                  onClick={() => { setEditingSession(session); setIsModalOpen(true); }}
                                  onToggleLock={handleToggleLock}
                               />
                            </div>
                          ))}
                        </div>
                     </SortableContext>
                   </div>
                </div>

                {/* TIMELINE (BOTTOM) */}
                <div className="flex-1 overflow-auto relative custom-scrollbar flex bg-slate-100">
                    {/* Time Scale */}
                    <div className="w-14 bg-white border-r border-slate-200 shrink-0 sticky left-0 z-10 min-h-[1400px]">
                        {Array.from({ length: 14 }).map((_, i) => {
                          const h = START_HOUR + i;
                          return (
                            <div key={h} className="absolute w-full text-right pr-2 text-[10px] font-mono text-slate-400 border-t border-slate-100"
                                  style={{ top: `${i * 60 * PIXELS_PER_MINUTE}px`, height: '1px' }}>
                              {h}:00
                            </div>
                          )
                        })}
                    </div>

                    {/* Stage Columns */}
                    <div className="flex min-w-full">
                        {stages.map(stage => (
                          <div key={stage} className="min-w-[280px] w-full max-w-[360px] border-r border-slate-200 relative bg-white/50 odd:bg-slate-50/50">
                              <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 p-2 text-center font-bold text-slate-700 z-10 shadow-sm text-sm">
                                {stage}
                              </div>
                              <SortableContext id={stage} items={data.program.filter(p => p.stage === stage).map(p => p.id)} strategy={verticalListSortingStrategy}>
                                <div className="min-h-[1400px] relative w-full mt-2">
                                    {data.program.filter(p => p.stage === stage).map(session => (
                                      <div key={session.id} className="absolute w-full px-1" style={getPositionStyle(session.start, session.duration)}>
                                        <SortableSessionItem 
                                            session={session}
                                            style={{ height: '100%' }}
                                            onClick={() => { setEditingSession(session); setIsModalOpen(true); }}
                                            onToggleLock={handleToggleLock}
                                        />
                                      </div>
                                    ))}
                                </div>
                              </SortableContext>
                          </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
        <DragOverlay>
           {/* Visual fix for dragging */}
           <div className="w-[240px] opacity-80 rotate-2"><Card status="2_Planung" className="bg-blue-100 border-blue-500 h-20">Dragging...</Card></div>
        </DragOverlay>
      </DndContext>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-2xl">
              <h2 className="font-bold text-lg mb-4">Einstellungen</h2>
              <div className="space-y-3">
                 <input type="text" className="input-std" placeholder="Google Client ID" value={config.googleClientId} onChange={e => setConfig({...config, googleClientId: e.target.value})} />
                 <input type="text" className="input-std" placeholder="Google API Key" value={config.googleApiKey} onChange={e => setConfig({...config, googleApiKey: e.target.value})} />
                 <input type="text" className="input-std" placeholder="Spreadsheet ID" value={config.spreadsheetId} onChange={e => setConfig({...config, spreadsheetId: e.target.value})} />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                 <button onClick={() => setShowSettings(false)} className="px-4 py-2 border rounded text-sm">Abbrechen</button>
                 <button onClick={() => {
                    Object.keys(config).forEach(k => localStorage.setItem(`kosmos_${k}`, config[k]));
                    setShowSettings(false);
                    window.location.reload(); 
                 }} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Speichern & Reload</button>
              </div>
           </div>
        </div>
      )}

      <SessionModal 
        isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingSession(null); }}
        onSave={handleSaveSession} onDelete={() => { /* del logic */ }}
        initialData={editingSession} stages={[...stages, INBOX_ID]}
        speakersList={data.speakers} moderatorsList={data.moderators}
      />
    </div>
  );
}

// Minimal CSS classes reuse
const inputClass = "w-full p-2 border rounded text-sm border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none";
const labelClass = "block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider";

export default App;
