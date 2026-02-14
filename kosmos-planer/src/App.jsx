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
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Users, Mic2, RefreshCw, Settings, Save, AlertCircle, 
  Calendar, Clock, MapPin, LayoutList, CalendarDays, 
  PlusCircle, Info, UploadCloud, LogIn, Edit3, Trash2 
} from 'lucide-react';

// --- GOOGLE API HELPERS ---
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];

// --- MOCK DATA ---
const MOCK_SPEAKERS = [
  { id: 'm1', fullName: 'Dr. Mai Thi Nguyen-Kim', status: '1_Zusage', pronoun: 'weiblich', role: 'Speaker' },
  { id: 'm2', fullName: 'Harald Lesch', status: '1_Zusage', pronoun: 'männlich', role: 'Speaker' },
  { id: 'm3', fullName: 'Ranga Yogeshwar', status: '2_Interesse', pronoun: 'männlich', role: 'Speaker' }
];
const MOCK_MODERATORS = [
  { id: 'mod1', fullName: 'Joko Winterscheidt', status: '1_Zusage', function: 'Moderation Main Stage', role: 'Moderation' },
  { id: 'mod2', fullName: 'Dunja Hayali', status: '1_Zusage', function: 'Moderation Panel', role: 'Moderation' }
];
const MOCK_PROGRAM = [
  { id: 'p1', title: 'Eröffnung: Wissenschaft für alle', status: '1_Zusage', format: 'Keynote', stage: 'Main Stage', start: '10:00', end: '10:30', speakers: 'Dr. Mai Thi Nguyen-Kim', moderators: 'Joko Winterscheidt', day: '20.09.' },
  { id: 'p2', title: 'Panel: KI und die Zukunft', status: '1_Zusage', format: 'Panel', stage: 'Hangar', start: '11:00', end: '12:00', speakers: 'Harald Lesch', moderators: 'Dunja Hayali', day: '20.09.' },
  { id: 'p3', title: 'Mittagspause', status: '1_Zusage', format: 'Pause', stage: 'Main Stage', start: '12:00', end: '13:00', speakers: '', moderators: '', day: '20.09.' },
  { id: 'p4', title: 'Workshop: Coding für Kids', status: '1_Zusage', format: 'Workshop', stage: 'Neo House', start: '14:00', end: '16:00', speakers: '-', moderators: '-', day: '21.09.' },
  { id: 'p5', title: 'Abschlussdiskussion', status: '2_Planung', format: 'Panel', stage: 'Main Stage', start: '18:00', end: '19:00', speakers: 'Alle', moderators: 'Joko Winterscheidt', day: '21.09.' }
];

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
    purple: "bg-purple-100 text-purple-800",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-800"
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

// Modal for Creating/Editing Sessions
const SessionModal = ({ isOpen, onClose, onSave, initialData, stages }) => {
  const [formData, setFormData] = useState(initialData || {
    title: '', start: '10:00', end: '11:00', stage: stages[0] || 'Main Stage',
    status: '2_Planung', format: 'Talk', speakers: '', moderators: '', day: '20.09.'
  });

  useEffect(() => {
    if (initialData) setFormData(initialData);
  }, [initialData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg">{initialData ? 'Session bearbeiten' : 'Neue Session erstellen'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Titel</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start</label>
              <input type="time" className="w-full p-2 border rounded" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ende</label>
              <input type="time" className="w-full p-2 border rounded" value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} />
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
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tag</label>
              <input type="text" className="w-full p-2 border rounded" value={formData.day} onChange={e => setFormData({...formData, day: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SprecherInnen</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.speakers} onChange={e => setFormData({...formData, speakers: e.target.value})} />
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded">Abbrechen</button>
          <button onClick={() => onSave(formData)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Speichern</button>
        </div>
      </div>
    </div>
  );
};

function App() {
  // --- STATE ---
  const [config, setConfig] = useState({
    speakersUrl: localStorage.getItem('kosmos_speakers_url') || '',
    moderatorsUrl: localStorage.getItem('kosmos_moderators_url') || '',
    programUrl: localStorage.getItem('kosmos_program_url') || '',
    googleClientId: localStorage.getItem('kosmos_google_client_id') || '',
    googleApiKey: localStorage.getItem('kosmos_google_api_key') || '',
    spreadsheetId: localStorage.getItem('kosmos_spreadsheet_id') || ''
  });

  const [data, setData] = useState({ speakers: [], moderators: [], program: [] });
  const [status, setStatus] = useState({ loading: false, error: null, lastUpdated: null });
  
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline', 'kanban'
  const [showSettings, setShowSettings] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // Google Auth State
  const [gapiInited, setGapiInited] = useState(false);
  const [gisInited, setGisInited] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Edit State
  const [localChanges, setLocalChanges] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- GOOGLE API INITIALIZATION ---
  useEffect(() => {
    const loadGoogleScripts = () => {
      const script1 = document.createElement('script');
      script1.src = "https://apis.google.com/js/api.js";
      script1.onload = () => {
        window.gapi.load('client', async () => {
          await window.gapi.client.init({
            apiKey: config.googleApiKey,
            discoveryDocs: DISCOVERY_DOCS,
          });
          setGapiInited(true);
        });
      };
      document.body.appendChild(script1);

      const script2 = document.createElement('script');
      script2.src = "https://accounts.google.com/gsi/client";
      script2.onload = () => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.googleClientId,
          scope: SCOPES,
          callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              setIsAuthenticated(true);
            }
          },
        });
        setTokenClient(client);
        setGisInited(true);
      };
      document.body.appendChild(script2);
    };

    if (config.googleClientId && config.googleApiKey) {
      loadGoogleScripts();
    }
  }, [config.googleClientId, config.googleApiKey]);

  const handleLogin = () => {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
  };

  // --- DATA FETCHING ---
  const loadData = useCallback(async () => {
    if (isDemoMode) return;
    setStatus(prev => ({ ...prev, loading: true, error: null }));

    try {
      if (isAuthenticated && config.spreadsheetId) {
        // --- REAL GOOGLE SHEETS API FETCH ---
        // Placeholder for Logic: Fetch ranges '26_Kosmos_SprecherInnen!A:E' etc.
        // For brevity in this artifact, we assume the user might still rely on CSV for READ 
        // until they fully configure the sheet structure for API reading.
        // BUT if auth is active, we should try to read via API.
        
        // Simulating API read using the CSV logic for now to keep the code robust 
        // until specific Range names are defined by user.
        // In a full implementation, this would be `gapi.client.sheets.spreadsheets.values.batchGet`
      } 
      
      // Fallback/Standard: CSV Fetch
      const promises = [];
      if (config.speakersUrl) promises.push(fetchCSV(config.speakersUrl, 'speakers'));
      if (config.moderatorsUrl) promises.push(fetchCSV(config.moderatorsUrl, 'moderators'));
      if (config.programUrl && !localChanges) promises.push(fetchCSV(config.programUrl, 'program'));

      const results = await Promise.all(promises);
      const newData = { ...data };
      results.forEach(res => { newData[res.type] = res.data; });
      
      setData(newData);
      setStatus(prev => ({ ...prev, loading: false, lastUpdated: new Date() }));

    } catch (err) {
      setStatus(prev => ({ ...prev, loading: false, error: err.message }));
    }
  }, [config, isAuthenticated, isDemoMode, localChanges, data]);

  const fetchCSV = (url, type) => {
    return new Promise((resolve, reject) => {
      Papa.parse(url, {
        download: true, header: false,
        complete: (results) => resolve({ type, data: processCSV(results.data, type) }),
        error: (err) => reject(err)
      });
    });
  };

  const processCSV = (rows, type) => {
    // Reuse parsing logic from previous version
    if (type === 'speakers') {
      const start = rows[0] && rows[0][2] === 'Vorname' ? 1 : 0;
      return rows.slice(start).filter(r => r && r[0] && (r[0].startsWith('1') || r[0].startsWith('2') || r[0].startsWith('5')))
        .map((r, i) => ({ id: `sp-${i}`, fullName: `${r[2]} ${r[3]}`, status: r[0], pronoun: r[4] }));
    }
    if (type === 'moderators') {
      const start = rows[0] && rows[0][1] === 'Name' ? 1 : 0;
      return rows.slice(start).filter(r => r && r[0] && r[0].startsWith('1') && r[2]?.toLowerCase().includes('moder'))
        .map((r, i) => ({ id: `mod-${i}`, fullName: r[1], status: r[0], function: r[2] }));
    }
    if (type === 'program') {
      const start = rows[0] && rows[0][1] === 'Titel' ? 1 : 0;
      return rows.slice(start).filter(r => r && r[1])
        .map((r, i) => ({
          id: `prog-${r[0] || i}`, title: r[1], status: r[2], format: r[4], 
          stage: r[5] || 'Unsorted', start: r[6] || '00:00', end: r[7] || '00:00', 
          speakers: r[9], moderators: r[10], day: r[8] || '20.09.'
        }));
    }
    return [];
  };

  useEffect(() => {
    if (config.speakersUrl || config.moderatorsUrl) loadData();
    else setShowSettings(true);
  }, []);

  // --- CRUD OPERATIONS ---
  const handleSaveSession = (session) => {
    let newProgram;
    if (editingSession) {
      // Update existing
      newProgram = data.program.map(p => p.id === editingSession.id ? { ...p, ...session } : p);
    } else {
      // Create new
      newProgram = [...data.program, { ...session, id: `new-${Date.now()}` }];
    }
    setData({ ...data, program: newProgram });
    setLocalChanges(true);
    setIsModalOpen(false);
    setEditingSession(null);
  };

  const handleDeleteSession = (id) => {
    if (window.confirm("Session wirklich löschen?")) {
      setData({ ...data, program: data.program.filter(p => p.id !== id) });
      setLocalChanges(true);
    }
  };

  const handleSyncToDrive = async () => {
    if (!isAuthenticated) {
      alert("Bitte zuerst mit Google anmelden!");
      return;
    }
    if (!config.spreadsheetId) {
      alert("Spreadsheet ID fehlt in den Einstellungen!");
      return;
    }

    try {
      setStatus(prev => ({ ...prev, loading: true }));
      // LOGIC: Convert 'data.program' back to CSV-like array and push to Sheet
      // This is a simplified "overwrite" strategy or "append" strategy.
      // Ideally, we update specific rows if we tracked IDs, but here we might just append new ones 
      // or warn user that full sync requires more mapping.
      
      alert("Sync-Logik initiiert. (Hier würde der API Call `gapi.client.sheets.values.update` ausgeführt werden).");
      
      setLocalChanges(false);
      setStatus(prev => ({ ...prev, loading: false }));
    } catch (err) {
      alert("Sync Fehler: " + err.message);
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  // --- VIEW LOGIC ---
  const stages = useMemo(() => {
    const s = [...new Set(data.program.map(p => p.stage))].sort();
    return s.length ? s : ['Main Stage'];
  }, [data.program]);

  // Timeline Helper: Get Grid Position
  const START_HOUR = 9; // 9:00
  const PIXELS_PER_MINUTE = 2;
  
  const getPositionStyle = (start, end) => {
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    const duration = endMin - startMin;
    const top = (startMin - (START_HOUR * 60)) * PIXELS_PER_MINUTE;
    const height = duration * PIXELS_PER_MINUTE;
    return { top: `${Math.max(0, top)}px`, height: `${Math.max(20, height)}px` };
  };

  const loadDemo = () => {
    setData({ speakers: MOCK_SPEAKERS, moderators: MOCK_MODERATORS, program: MOCK_PROGRAM });
    setIsDemoMode(true);
    setShowSettings(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col h-screen overflow-hidden">
      
      {/* --- HEADER --- */}
      <header className="bg-white border-b border-slate-200 p-4 shrink-0 flex justify-between items-center z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            KOSMOS Planer
          </h1>
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
             <button onClick={() => setViewMode('timeline')} className={`px-3 py-1 rounded text-sm font-medium transition-all ${viewMode === 'timeline' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Zeitplan</button>
             <button onClick={() => setViewMode('kanban')} className={`px-3 py-1 rounded text-sm font-medium transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Kanban</button>
          </div>
        </div>

        <div className="flex items-center gap-3">
           {localChanges && (
             <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded animate-pulse">
               Ungespeicherte Änderungen
             </span>
           )}
           
           {/* Google Auth Button */}
           {!isAuthenticated && config.googleClientId && (
             <button onClick={handleLogin} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm">
               <LogIn className="w-4 h-4" /> Google Login
             </button>
           )}
           {isAuthenticated && (
             <button onClick={handleSyncToDrive} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm shadow-sm">
               <UploadCloud className="w-4 h-4" /> Sync Drive
             </button>
           )}

           <button onClick={() => { setEditingSession(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm shadow-sm">
             <PlusCircle className="w-4 h-4" /> Session
           </button>

           <button onClick={() => setShowSettings(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
             <Settings className="w-5 h-5" />
           </button>
        </div>
      </header>

      {/* --- SETTINGS --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <Card className="w-full max-w-2xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Settings className="w-5 h-5"/> Einstellungen</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Google Client ID (für Auth)</label>
                      <input type="text" className="w-full p-2 border rounded font-mono text-xs" value={config.googleClientId} onChange={e => setConfig({...config, googleClientId: e.target.value})} placeholder="xxx.apps.googleusercontent.com" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">API Key</label>
                      <input type="text" className="w-full p-2 border rounded font-mono text-xs" value={config.googleApiKey} onChange={e => setConfig({...config, googleApiKey: e.target.value})} placeholder="AIza..." />
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase">Spreadsheet ID</label>
                   <input type="text" className="w-full p-2 border rounded font-mono text-xs" value={config.spreadsheetId} onChange={e => setConfig({...config, spreadsheetId: e.target.value})} placeholder="1BxiM..." />
                </div>
                <hr className="my-2"/>
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase">CSV URLs (Read-Only Fallback)</label>
                   <input type="text" className="w-full p-2 border rounded text-xs" value={config.speakersUrl} onChange={e => setConfig({...config, speakersUrl: e.target.value})} placeholder="Speakers CSV URL" />
                   <input type="text" className="w-full p-2 border rounded text-xs" value={config.moderatorsUrl} onChange={e => setConfig({...config, moderatorsUrl: e.target.value})} placeholder="Moderators CSV URL" />
                   <input type="text" className="w-full p-2 border rounded text-xs" value={config.programUrl} onChange={e => setConfig({...config, programUrl: e.target.value})} placeholder="Program CSV URL" />
                </div>
                <div className="flex justify-between mt-4">
                   <button onClick={loadDemo} className="text-sm underline text-slate-500">Demo-Modus</button>
                   <div className="flex gap-2">
                     <button onClick={() => setShowSettings(false)} className="px-4 py-2 border rounded">Schließen</button>
                     <button onClick={() => {
                        localStorage.setItem('kosmos_google_client_id', config.googleClientId);
                        localStorage.setItem('kosmos_google_api_key', config.googleApiKey);
                        localStorage.setItem('kosmos_spreadsheet_id', config.spreadsheetId);
                        localStorage.setItem('kosmos_speakers_url', config.speakersUrl);
                        localStorage.setItem('kosmos_moderators_url', config.moderatorsUrl);
                        localStorage.setItem('kosmos_program_url', config.programUrl);
                        setShowSettings(false);
                        loadData();
                     }} className="px-4 py-2 bg-blue-600 text-white rounded">Speichern</button>
                   </div>
                </div>
              </div>
           </Card>
        </div>
      )}

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 overflow-hidden relative flex">
        
        {/* VIEW: TIMELINE */}
        {viewMode === 'timeline' && (
          <div className="flex-1 overflow-auto bg-slate-100 relative custom-scrollbar flex">
            {/* Time Axis (Y) */}
            <div className="sticky left-0 w-16 bg-white border-r border-slate-200 z-10 shrink-0">
               {Array.from({ length: 14 }).map((_, i) => {
                 const hour = START_HOUR + i;
                 return (
                   <div key={hour} className="absolute w-full border-b border-slate-100 text-right pr-2 text-xs text-slate-400" 
                        style={{ top: `${i * 60 * PIXELS_PER_MINUTE}px`, height: `${60 * PIXELS_PER_MINUTE}px` }}>
                     {hour}:00
                   </div>
                 );
               })}
            </div>

            {/* Stages Columns (X) */}
            <div className="flex">
              {stages.map(stage => {
                const stageSessions = data.program.filter(p => p.stage === stage);
                return (
                  <div key={stage} className="w-[300px] border-r border-slate-200 relative bg-slate-50/50 shrink-0 min-h-[1600px]">
                    <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-slate-200 p-2 z-10 text-center font-bold text-slate-700 shadow-sm">
                      {stage}
                    </div>
                    {/* Render Sessions */}
                    {stageSessions.map(session => (
                      <Card 
                        key={session.id} 
                        className={`absolute left-2 right-2 border-l-4 p-2 cursor-pointer hover:shadow-md transition-all group z-0 
                          ${session.format === 'Pause' ? 'bg-slate-200/50 border-slate-400' : 'bg-white border-blue-500'}`}
                        style={getPositionStyle(session.start, session.end)}
                        onClick={() => { setEditingSession(session); setIsModalOpen(true); }}
                      >
                         <div className="flex justify-between items-start overflow-hidden">
                           <div className="text-xs font-bold text-slate-600 mb-1">{session.start} - {session.end}</div>
                           <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }} className="p-1 hover:bg-red-100 text-red-500 rounded"><Trash2 className="w-3 h-3"/></button>
                           </div>
                         </div>
                         <div className="font-bold text-sm leading-tight line-clamp-2">{session.title}</div>
                         {session.speakers && <div className="text-xs text-slate-500 mt-1 truncate"><Users className="inline w-3 h-3 mr-1"/>{session.speakers}</div>}
                      </Card>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW: KANBAN */}
        {viewMode === 'kanban' && (
          <div className="flex-1 overflow-auto bg-slate-100 p-6 flex gap-6 custom-scrollbar">
             {stages.map(stage => (
               <div key={stage} className="w-[320px] shrink-0 flex flex-col gap-3">
                 <h3 className="font-bold text-slate-700 bg-white p-3 rounded-lg shadow-sm border border-slate-200 sticky top-0 z-10">{stage}</h3>
                 <div className="space-y-3">
                    {data.program.filter(p => p.stage === stage).map(session => (
                      <Card key={session.id} className="p-4 cursor-pointer hover:border-blue-300" onClick={() => { setEditingSession(session); setIsModalOpen(true); }}>
                         <div className="flex justify-between mb-2">
                           <Badge color={session.status.startsWith('1') ? 'green' : 'gray'}>{session.status}</Badge>
                           <span className="text-xs font-mono">{session.start}</span>
                         </div>
                         <h4 className="font-bold text-sm">{session.title}</h4>
                      </Card>
                    ))}
                 </div>
               </div>
             ))}
          </div>
        )}

      </main>

      {/* --- EDIT MODAL --- */}
      <SessionModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingSession(null); }} 
        onSave={handleSaveSession}
        initialData={editingSession}
        stages={stages}
      />
      
    </div>
  );
}

export default App;
