import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay 
} from '@dnd-kit/core';
import { 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { 
  Users, Mic2, RefreshCw, Settings, Save, AlertCircle, 
  Calendar, Clock, MapPin, Trash2, PlusCircle, UploadCloud, LogIn, X 
} from 'lucide-react';

// --- CONFIGURATION ---
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];

// Helper: Time Calculations
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

const Card = ({ children, className = "", onClick, style }) => (
  <div onClick={onClick} style={style} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    gray: "bg-gray-100 text-gray-800",
    red: "bg-red-100 text-red-800"
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

// --- MODAL: SESSION EDITOR ---
const SessionModal = ({ isOpen, onClose, onSave, onDelete, initialData, stages, speakersList, moderatorsList }) => {
  // Split speakers string into array for selection
  const initialSpeakers = initialData?.speakers ? initialData.speakers.split(',').map(s => s.trim()) : [];
  
  const [formData, setFormData] = useState({
    id: '', title: '', start: '10:00', duration: 60, stage: 'Main Stage',
    status: '2_Planung', format: 'Talk', speakers: [], moderators: '', day: '20.09.'
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
        status: '2_Planung', format: 'Talk', speakers: [], moderators: '', day: '20.09.'
      });
    }
  }, [initialData, stages]);

  const toggleSpeaker = (name) => {
    setFormData(prev => {
      const exists = prev.speakers.includes(name);
      return {
        ...prev,
        speakers: exists ? prev.speakers.filter(s => s !== name) : [...prev.speakers, name]
      };
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h3 className="font-bold text-lg">{initialData ? 'Session bearbeiten' : 'Neue Session erstellen'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Titel & Status */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Titel</label>
              <input type="text" className="w-full p-2 border rounded font-bold" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
              <select className="w-full p-2 border rounded" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="1_Zusage">1_Zusage</option>
                <option value="2_Planung">2_Planung</option>
                <option value="5_Vorschlag">5_Vorschlag</option>
              </select>
            </div>
          </div>

          {/* Zeit & Bühne */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Startzeit</label>
              <input type="time" className="w-full p-2 border rounded" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dauer (Min)</label>
              <input type="number" className="w-full p-2 border rounded" value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} />
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-xs text-slate-400">Endzeit (Auto)</span>
              <span className="font-mono font-bold text-slate-700">{calculateEndTime(formData.start, formData.duration)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bühne</label>
              <select className="w-full p-2 border rounded" value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})}>
                {stages.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="New Stage">+ Neue Bühne...</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Format</label>
              <input type="text" list="formats" className="w-full p-2 border rounded" value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})} />
              <datalist id="formats">
                <option value="Talk" /><option value="Panel" /><option value="Workshop" /><option value="Pause" />
              </datalist>
            </div>
          </div>

          {/* Sprecher Auswahl */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SprecherInnen ({formData.speakers.length})</label>
            <div className="border rounded p-2 min-h-[40px] flex flex-wrap gap-2 bg-white mb-2">
              {formData.speakers.map(s => (
                <span key={s} className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm flex items-center gap-1">
                  {s} <button onClick={() => toggleSpeaker(s)} className="hover:text-indigo-900"><X className="w-3 h-3"/></button>
                </span>
              ))}
              {formData.speakers.length === 0 && <span className="text-slate-400 text-sm italic">Keine ausgewählt</span>}
            </div>
            
            {/* Speaker List Dropdown Area */}
            <div className="border rounded max-h-32 overflow-y-auto bg-slate-50 p-2 grid grid-cols-2 gap-1">
              {speakersList.map(speaker => (
                <button 
                  key={speaker.id} 
                  onClick={() => toggleSpeaker(speaker.fullName)}
                  className={`text-left text-sm px-2 py-1 rounded truncate hover:bg-slate-200 ${formData.speakers.includes(speaker.fullName) ? 'bg-blue-100 text-blue-700 font-medium' : 'text-slate-600'}`}
                >
                  {speaker.fullName}
                </button>
              ))}
            </div>
          </div>

          {/* Moderator (Simpler Input for now) */}
           <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Moderation</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.moderators} onChange={e => setFormData({...formData, moderators: e.target.value})} />
          </div>

        </div>

        <div className="p-4 border-t border-slate-100 flex justify-between bg-slate-50 rounded-b-xl">
          {initialData ? (
             <button onClick={() => onDelete(formData.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded flex items-center gap-2"><Trash2 className="w-4 h-4"/> Löschen</button>
          ) : <div></div>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded">Abbrechen</button>
            <button onClick={() => onSave({ ...formData, speakers: formData.speakers.join(', ') })} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm font-medium">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  
  // Auth State
  const [tokenClient, setTokenClient] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [gapiInited, setGapiInited] = useState(false);

  // Edit State
  const [localChanges, setLocalChanges] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- GOOGLE API SETUP ---
  useEffect(() => {
    const initGapi = async () => {
      if (window.gapi) {
        await window.gapi.client.init({
          apiKey: config.googleApiKey,
          discoveryDocs: DISCOVERY_DOCS,
        });
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

    if (config.googleClientId && !tokenClient) {
      const script = document.createElement('script');
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.googleClientId,
          scope: SCOPES,
          callback: (resp) => {
            if (resp.access_token) setIsAuthenticated(true);
          },
        });
        setTokenClient(client);
      };
      document.body.appendChild(script);
    }
  }, [config.googleApiKey, config.googleClientId]);

  const handleLogin = () => {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
  };

  // --- DATA LOADING (REAL API) ---
  const loadData = useCallback(async () => {
    if (!isAuthenticated || !gapiInited || !config.spreadsheetId) return;

    setStatus(s => ({ ...s, loading: true, error: null }));
    try {
      const batchGet = await window.gapi.client.sheets.spreadsheets.values.batchGet({
        spreadsheetId: config.spreadsheetId,
        ranges: [
          `${config.sheetNameSpeakers}!A2:E`,
          `${config.sheetNameMods}!A2:C`,
          `${config.sheetNameProgram}!A2:N`
        ]
      });

      const valueRanges = batchGet.result.valueRanges;
      
      // 1. Parse Speakers
      const speakerRows = valueRanges[0].values || [];
      const parsedSpeakers = speakerRows
        .filter(r => r[0] && (r[0].includes('1') || r[0].includes('2'))) // Filter by Status
        .map((r, i) => ({
           id: `sp-${i}`, 
           fullName: `${r[2] || ''} ${r[3] || ''}`.trim(), 
           status: r[0], 
           pronoun: r[4] 
        }));

      // 2. Parse Mods
      const modRows = valueRanges[1].values || [];
      const parsedMods = modRows
        .filter(r => r[0] && r[0].includes('1'))
        .map((r, i) => ({
           id: `mod-${i}`, fullName: r[1], status: r[0], function: r[2]
        }));

      // 3. Parse Program
      const progRows = valueRanges[2].values || [];
      // CSV Mapping: 
      // A=ID(0), B=Titel(1), C=Status(2), E=Format(4), F=Stage(5), G=Start(6), H=Ende(7), I=Dauer(8), J=Speakers(9), K=Mod(10)
      const parsedProgram = progRows.map((r, i) => {
        const start = r[6] || '10:00';
        // If duration (col I/8) is missing, calc from start/end, else default 60
        let duration = parseInt(r[8]);
        if (!duration || isNaN(duration)) {
             const startMin = timeToMinutes(start);
             const endMin = timeToMinutes(r[7] || '11:00');
             duration = endMin > startMin ? endMin - startMin : 60;
        }

        return {
          id: r[0] || `prog-gen-${i}`, // Use ID from sheet or generate
          title: r[1] || 'Ohne Titel',
          status: r[2],
          format: r[4],
          stage: r[5] || 'Unsorted',
          start: start,
          duration: duration,
          // Calculate End just for display object, usually not stored if using duration logic
          end: calculateEndTime(start, duration),
          speakers: r[9],
          moderators: r[10],
          day: '20.09.' // Defaulting for now as day column wasn't clear in snippet
        };
      });

      setData({ speakers: parsedSpeakers, moderators: parsedMods, program: parsedProgram });
      setStatus(s => ({ ...s, loading: false, lastUpdated: new Date() }));
      setLocalChanges(false);

    } catch (err) {
      console.error(err);
      setStatus(s => ({ ...s, loading: false, error: err.result?.error?.message || err.message }));
    }
  }, [isAuthenticated, gapiInited, config]);

  // --- SYNC TO DRIVE ---
  const handleSyncToDrive = async () => {
    if (!isAuthenticated) return;
    setStatus(s => ({ ...s, loading: true }));

    try {
      // Convert Program State back to 2D Array
      // We map our state back to the columns defined in "Programm_Export.csv"
      // A=ID, B=Titel, C=Status, D=Partner, E=Format, F=Bühne, G=Start, H=Ende, I=Dauer, J=Speakers, K=Mod...
      
      const rows = data.program.map(p => [
        p.id,                     // A: ID
        p.title,                  // B: Titel
        p.status,                 // C: Status
        '',                       // D: Partner (not tracked in app yet)
        p.format,                 // E: Format
        p.stage,                  // F: Bühne
        p.start,                  // G: Start
        calculateEndTime(p.start, p.duration), // H: Ende
        p.duration,               // I: Dauer
        p.speakers,               // J: Speakers
        p.moderators,             // K: Mod
        'de',                     // L: Sprache (default)
        '',                       // M: Notizen
        ''                        // N: StageDispo
      ]);

      // We overwrite the data range. Note: This assumes we own the whole sheet content from A2 down.
      // Be careful if other users add columns.
      const resource = { values: rows };
      
      await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetNameProgram}!A2:N`,
        valueInputOption: 'USER_ENTERED',
        resource: resource
      });

      setLocalChanges(false);
      setStatus(s => ({ ...s, loading: false, lastUpdated: new Date() }));
      alert("Erfolgreich gespeichert!");

    } catch (err) {
       console.error(err);
       setStatus(s => ({ ...s, loading: false, error: "Sync fehlgeschlagen: " + err.message }));
    }
  };

  // --- LOCAL MUTATIONS ---
  const handleSaveSession = (session) => {
    let newProgram;
    if (editingSession) {
      newProgram = data.program.map(p => p.id === session.id ? session : p);
    } else {
      const newId = `JN${Math.floor(Math.random()*10000)}`; // Generate simple ID like snippet
      newProgram = [...data.program, { ...session, id: newId }];
    }
    // Update calculated fields
    newProgram = newProgram.map(p => ({
      ...p,
      end: calculateEndTime(p.start, p.duration)
    }));

    setData(prev => ({ ...prev, program: newProgram }));
    setLocalChanges(true);
    setIsModalOpen(false);
    setEditingSession(null);
  };

  const handleDeleteSession = (id) => {
    if (window.confirm("Wirklich löschen?")) {
      setData(prev => ({ ...prev, program: prev.program.filter(p => p.id !== id) }));
      setLocalChanges(true);
      setIsModalOpen(false); // in case it was open
    }
  };

  // DnD Handler
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Find dragged item
    const activeItem = data.program.find(p => p.id === activeId);
    if (!activeItem) return;

    // Identify Target Stage
    // If dropped on container (Stage Name), overId is stage name
    // If dropped on item, overId is item ID -> find that item's stage
    let targetStage = overId;
    const overItem = data.program.find(p => p.id === overId);
    
    if (overItem) {
      targetStage = overItem.stage;
    } else if (!data.program.some(p => p.stage === overId) && !stages.includes(overId)) {
       // If dropping on weird overlay or nothing known
       return; 
    }

    if (activeItem.stage !== targetStage) {
      // Changed Stage
      setData(prev => ({
        ...prev,
        program: prev.program.map(p => p.id === activeId ? { ...p, stage: targetStage } : p)
      }));
      setLocalChanges(true);
    }
  };

  // --- DERIVED STATE ---
  const stages = useMemo(() => {
    const s = [...new Set(data.program.map(p => p.stage))].filter(s => s && s !== 'Unsorted').sort();
    return s.length ? s : ['Main Stage', 'Hangar'];
  }, [data.program]);

  // Timeline Metrics
  const START_HOUR = 10; 
  const PIXELS_PER_MINUTE = 2;

  const getPositionStyle = (start, duration) => {
    const startMin = timeToMinutes(start);
    const top = (startMin - (START_HOUR * 60)) * PIXELS_PER_MINUTE;
    const height = duration * PIXELS_PER_MINUTE;
    return { top: `${Math.max(0, top)}px`, height: `${Math.max(30, height)}px` };
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 p-4 flex justify-between items-center z-20 shadow-sm shrink-0">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            KOSMOS Planer
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
             {status.loading && <span className="text-blue-600 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Laden...</span>}
             {localChanges && <span className="text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded">⚠ Ungespeichert</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isAuthenticated ? (
            <button onClick={handleLogin} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700 shadow text-sm">
              <LogIn className="w-4 h-4" /> Google Login
            </button>
          ) : (
             <>
               <button onClick={loadData} className="p-2 hover:bg-slate-100 rounded text-slate-600" title="Daten neu laden">
                 <RefreshCw className="w-5 h-5" />
               </button>
               <button 
                 onClick={handleSyncToDrive} 
                 disabled={!localChanges && !status.loading}
                 className={`flex items-center gap-2 px-4 py-2 rounded text-white text-sm font-medium shadow-sm transition-all
                   ${localChanges ? 'bg-green-600 hover:bg-green-700 animate-pulse' : 'bg-slate-400 cursor-not-allowed'}`}
               >
                 <UploadCloud className="w-4 h-4" /> Speichern
               </button>
             </>
          )}
          <button onClick={() => { setEditingSession(null); setIsModalOpen(true); }} className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200">
             <PlusCircle className="w-5 h-5" />
          </button>
          <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-slate-600">
             <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>
      
      {/* ERROR BANNER */}
      {status.error && (
        <div className="bg-red-100 text-red-800 p-2 text-sm text-center border-b border-red-200">
          Fehler: {status.error}
        </div>
      )}

      {/* MAIN CONTENT ROW */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR: SPEAKERS (Wenn eingeloggt) */}
        {isAuthenticated && (
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
             <div className="p-3 border-b border-slate-100 font-bold text-slate-700 flex justify-between items-center">
               <span>SprecherInnen</span>
               <span className="bg-slate-100 text-xs px-2 py-1 rounded">{data.speakers.length}</span>
             </div>
             <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
               {data.speakers.map(s => (
                 <div key={s.id} className="text-sm p-2 hover:bg-slate-50 border-b border-slate-50">
                    <div className="font-medium text-slate-800">{s.fullName}</div>
                    <div className="text-xs text-slate-400 flex gap-1">
                       <span className={s.status.includes('1') ? 'text-green-600' : 'text-slate-400'}>{s.status.substring(0,10)}</span>
                    </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* TIMELINE AREA */}
        <div className="flex-1 bg-slate-100 overflow-auto relative custom-scrollbar flex">
           
           {/* Time Axis */}
           <div className="w-16 bg-white border-r border-slate-200 shrink-0 sticky left-0 z-10 min-h-[1200px]">
              {Array.from({ length: 12 }).map((_, i) => {
                 const h = START_HOUR + i;
                 return (
                   <div key={h} className="absolute w-full text-right pr-2 text-xs text-slate-400 border-t border-slate-100"
                        style={{ top: `${i * 60 * PIXELS_PER_MINUTE}px`, height: '1px' }}>
                     {h}:00
                   </div>
                 )
              })}
           </div>

           {/* Stages & Sessions */}
           <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
             <div className="flex min-w-full">
               {stages.map(stage => (
                 <div key={stage} className="min-w-[250px] w-full max-w-[350px] border-r border-slate-200 relative bg-slate-50/30">
                    <div className="sticky top-0 bg-white/95 border-b border-slate-200 p-2 text-center font-bold text-slate-700 z-10 shadow-sm">
                      {stage}
                    </div>
                    
                    {/* Droppable Area */}
                    <SortableContext id={stage} items={data.program.filter(p => p.stage === stage).map(p => p.id)} strategy={verticalListSortingStrategy}>
                       <div className="min-h-[1200px] relative w-full">
                          {data.program.filter(p => p.stage === stage).map(session => (
                             <Card 
                               key={session.id}
                               className={`absolute left-1 right-1 p-2 cursor-pointer hover:shadow-lg transition-all group z-0 border-l-4 text-xs
                                 ${session.format === 'Pause' ? 'bg-slate-200/50 border-slate-400' : 'bg-white border-blue-500'}`}
                               style={getPositionStyle(session.start, session.duration)}
                               onClick={() => { setEditingSession(session); setIsModalOpen(true); }}
                             >
                                <div className="font-bold text-slate-600 mb-0.5">{session.start} ({session.duration}m)</div>
                                <div className="font-bold text-slate-900 leading-tight mb-1">{session.title}</div>
                                {session.speakers && <div className="text-slate-500 truncate flex items-center gap-1"><Users className="w-3 h-3"/> {session.speakers}</div>}
                             </Card>
                          ))}
                       </div>
                    </SortableContext>
                 </div>
               ))}
             </div>
           </DndContext>

        </div>
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <Card className="w-full max-w-lg p-6">
              <h2 className="font-bold text-xl mb-4">Einstellungen</h2>
              <div className="space-y-3">
                 <input type="text" className="w-full p-2 border rounded text-xs font-mono" placeholder="Google Client ID" value={config.googleClientId} onChange={e => setConfig({...config, googleClientId: e.target.value})} />
                 <input type="text" className="w-full p-2 border rounded text-xs font-mono" placeholder="Google API Key" value={config.googleApiKey} onChange={e => setConfig({...config, googleApiKey: e.target.value})} />
                 <input type="text" className="w-full p-2 border rounded text-xs font-mono" placeholder="Spreadsheet ID" value={config.spreadsheetId} onChange={e => setConfig({...config, spreadsheetId: e.target.value})} />
                 <hr/>
                 <label className="block text-xs font-bold text-slate-500">Blatt-Namen (exakt wie in Google Sheets)</label>
                 <input type="text" className="w-full p-2 border rounded text-sm" value={config.sheetNameProgram} onChange={e => setConfig({...config, sheetNameProgram: e.target.value})} placeholder="Blattname Programm (Export)" />
                 <input type="text" className="w-full p-2 border rounded text-sm" value={config.sheetNameSpeakers} onChange={e => setConfig({...config, sheetNameSpeakers: e.target.value})} placeholder="Blattname Sprecher" />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                 <button onClick={() => setShowSettings(false)} className="px-4 py-2 border rounded">Abbrechen</button>
                 <button onClick={() => {
                    Object.keys(config).forEach(k => localStorage.setItem(`kosmos_${k}`, config[k]));
                    setShowSettings(false);
                    window.location.reload(); 
                 }} className="px-4 py-2 bg-blue-600 text-white rounded">Speichern & Reload</button>
              </div>
           </Card>
        </div>
      )}

      {/* SESSION EDITOR */}
      <SessionModal 
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingSession(null); }}
        onSave={handleSaveSession}
        onDelete={handleDeleteSession}
        initialData={editingSession}
        stages={stages}
        speakersList={data.speakers}
      />

    </div>
  );
}

export default App;
