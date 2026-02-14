import React, { useState, useEffect, useCallback } from 'react';
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
import { Users, Mic2, RefreshCw, Settings, Save, AlertCircle, Calendar, Clock, MapPin, LayoutList, CalendarDays, PlusCircle, Info, UploadCloud } from 'lucide-react';

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
  { id: 'p3', title: 'Workshop: Coding für Kids', status: '1_Zusage', format: 'Workshop', stage: 'Neo House', start: '14:00', end: '16:00', speakers: '-', moderators: '-', day: '21.09.' },
  { id: 'p4', title: 'Abschlussdiskussion', status: '2_Planung', format: 'Panel', stage: 'Main Stage', start: '18:00', end: '19:00', speakers: 'Alle', moderators: 'Joko Winterscheidt', day: '21.09.' }
];

// --- COMPONENTS ---

const Card = ({ children, className = "", onClick }) => (
  <div onClick={onClick} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
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

// Sortable Item Component
function SortableSessionItem({ session }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: session.id, data: session });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none mb-3">
      <Card className={`p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${isDragging ? 'ring-2 ring-blue-400' : ''}`}>
        <div className="flex justify-between items-start mb-1">
          <span className="font-mono text-xs font-bold text-orange-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {session.start} - {session.end}
          </span>
          <Badge color={session.status === '1_Zusage' ? 'green' : 'gray'}>{session.format}</Badge>
        </div>
        <h4 className="font-bold text-slate-800 text-sm leading-tight mb-2">{session.title}</h4>
        {session.speakers && (
           <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 mt-2 flex gap-1">
             <Users className="w-3 h-3 shrink-0 mt-0.5" />
             <span className="truncate">{session.speakers}</span>
           </div>
        )}
      </Card>
    </div>
  );
}

function App() {
  // --- STATE ---
  const [urls, setUrls] = useState({
    speakers: localStorage.getItem('kosmos_speakers_url') || '',
    moderators: localStorage.getItem('kosmos_moderators_url') || '',
    program: localStorage.getItem('kosmos_program_url') || ''
  });

  const [speakers, setSpeakers] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [program, setProgram] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // New State for Sync & Edits
  const [localChanges, setLocalChanges] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [activeDragId, setActiveDragId] = useState(null);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- HELPERS ---
  const checkStatus = (statusValue, allowedPrefixes) => {
    if (!statusValue) return false;
    const s = statusValue.trim();
    return allowedPrefixes.some(prefix => s.startsWith(prefix));
  };

  const mapPronoun = (value) => {
    if (!value) return 'unbekannt';
    const v = value.toLowerCase();
    if (v.includes('man') || v.includes('männlich')) return 'männlich';
    if (v.includes('woman') || v.includes('frau') || v.includes('weiblich')) return 'weiblich';
    if (v.includes('div') || v.includes('non') || v.includes('divers')) return 'divers';
    return value;
  };

  // --- FETCHING LOGIC ---
  const fetchData = useCallback(async (isAutoRefresh = false) => {
    if ((!urls.speakers && !urls.moderators && !urls.program) || isDemoMode) return;

    if (!isAutoRefresh) setLoading(true);
    
    // Only fetch Speakers/Mods if not auto-refreshing purely for visual update
    // For program, we need to be careful not to overwrite local drag changes if we are "dirty"
    // Currently, simple logic: if local changes exist, we pause auto-sync for Program
    
    try {
      const promises = [];

      // Fetch Speakers
      if (urls.speakers) {
        promises.push(new Promise((resolve, reject) => {
          Papa.parse(urls.speakers, {
            download: true, header: false,
            complete: (results) => {
              const rows = results.data;
              const startIndex = rows[0] && rows[0][2] === 'Vorname' ? 1 : 0;
              const valid = rows.slice(startIndex).filter(r => r && r.length >= 5 && checkStatus(r[0], ['1', '2', '5']))
                .map((r, i) => ({
                  id: `sp-${i}`, fullName: `${r[2]} ${r[3]}`.trim(), status: r[0], pronoun: mapPronoun(r[4]), role: 'Speaker'
                }));
              setSpeakers(valid);
              resolve();
            },
            error: (err) => reject(err)
          });
        }));
      }

      // Fetch Moderators
      if (urls.moderators) {
        promises.push(new Promise((resolve, reject) => {
          Papa.parse(urls.moderators, {
            download: true, header: false,
            complete: (results) => {
              const rows = results.data;
              const startIndex = rows[0] && rows[0][1] === 'Name' ? 1 : 0;
              const valid = rows.slice(startIndex).filter(r => r && r.length >= 3 && checkStatus(r[0], ['1']) && r[2] && (r[2].toLowerCase().includes('moderat') || r[2].toLowerCase().includes('stage')))
                .map((r, i) => ({
                  id: `mod-${i}`, fullName: r[1], status: r[0], function: r[2], role: 'Moderation'
                }));
              setModerators(valid);
              resolve();
            },
            error: (err) => reject(err)
          });
        }));
      }

      // Fetch Program - Only if no local changes to avoid overwrite
      if (urls.program && !localChanges) {
        promises.push(new Promise((resolve, reject) => {
          Papa.parse(urls.program, {
            download: true, header: false,
            complete: (results) => {
              const rows = results.data;
              const startIndex = rows[0] && rows[0][1] === 'Titel' ? 1 : 0;
              const valid = rows.slice(startIndex).filter(r => r && r[1] && r[1].trim() !== '')
                .map((r, i) => ({
                  id: `prog-${r[0] || i}`,
                  title: r[1], status: r[2], format: r[4], 
                  stage: r[5] || 'Unsorted', // Default stage if empty
                  start: r[6], end: r[7], speakers: r[9], moderators: r[10],
                  day: r[8] && r[8].includes('.') ? r[8] : '20.09.' // Fallback date
                }));
              setProgram(valid);
              resolve();
            },
            error: (err) => reject(err)
          });
        }));
      }

      await Promise.all(promises);
      setLastUpdated(new Date());
      setError(null);

    } catch (err) {
      console.error(err);
      if (!isAutoRefresh) setError("Fehler beim Laden der Daten.");
    } finally {
      if (!isAutoRefresh) setLoading(false);
    }
  }, [urls, isDemoMode, localChanges]);

  // Initial Fetch & Auto-Sync Interval
  useEffect(() => {
    if (urls.speakers || urls.moderators || urls.program) {
      fetchData();
    } else {
      setShowSettings(true);
    }
  }, []);

  useEffect(() => {
    let interval;
    if (autoSyncEnabled && !isDemoMode) {
      interval = setInterval(() => {
        // Polling Google Sheets
        fetchData(true); 
      }, 60000); // Check every 60 seconds
    }
    return () => clearInterval(interval);
  }, [autoSyncEnabled, isDemoMode, fetchData]);


  const loadDemoData = () => {
    setLoading(true);
    setTimeout(() => {
      setSpeakers(MOCK_SPEAKERS);
      setModerators(MOCK_MODERATORS);
      setProgram(MOCK_PROGRAM);
      setLastUpdated(new Date());
      setIsDemoMode(true);
      setLoading(false);
      setShowSettings(false);
      setError(null);
    }, 500);
  };

  const handleSaveSettings = () => {
    localStorage.setItem('kosmos_speakers_url', urls.speakers);
    localStorage.setItem('kosmos_moderators_url', urls.moderators);
    localStorage.setItem('kosmos_program_url', urls.program);
    setShowSettings(false);
    fetchData();
  };

  // --- DND LOGIC ---

  // Get unique stages for columns
  const stages = [...new Set(program.map(p => p.stage))].sort();
  if (stages.length === 0) stages.push('Main Stage');

  const handleDragStart = (event) => {
    setActiveDragId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Find the items
    const activeItem = program.find(p => p.id === activeId);
    
    // Determine target stage
    // If dropping over a container (Stage Column), overId is the stage name
    // If dropping over another item, we need to find that item's stage
    let targetStage = overId;
    const overItem = program.find(p => p.id === overId);
    
    if (overItem) {
      targetStage = overItem.stage;
    }

    // Check if we are moving to a different stage
    if (activeItem.stage !== targetStage) {
      // Logic for moving between columns (Stages)
      setProgram((items) => {
        const newItems = items.map(item => {
          if (item.id === activeId) {
            return { ...item, stage: targetStage };
          }
          return item;
        });
        return newItems;
      });
      setLocalChanges(true); // Mark as dirty
    } 
    // Logic for reordering within same column (not strictly necessary for time-based, but good for UI)
    else if (activeId !== overId) {
      setProgram((items) => {
        const oldIndex = items.findIndex(i => i.id === activeId);
        const newIndex = items.findIndex(i => i.id === overId);
        return arrayMove(items, oldIndex, newIndex);
      });
      setLocalChanges(true);
    }
  };

  const handleSimulateSync = () => {
    alert("⚠️ Google Sheets API Anbindung erforderlich!\n\nDie Drag & Drop Änderungen sind aktuell nur lokal im Browser. Um diese Änderungen zurück in die Google Tabelle zu schreiben ('Ping'), muss eine OAuth2-Authentifizierung implementiert werden.\n\nFür den Moment: Bitte übertragen Sie die Änderungen manuell oder nutzen Sie die Export-Funktion (coming soon).");
    // In a real app, here we would POST the diff to a cloud function
    setLocalChanges(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
              KOSMOS Planer
              {isDemoMode && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full border border-amber-200">DEMO</span>}
            </h1>
            <div className="flex items-center gap-4 mt-1">
              <p className="text-slate-500 text-sm flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${autoSyncEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                {autoSyncEnabled ? 'Auto-Sync aktiv' : 'Sync pausiert'}
              </p>
              {lastUpdated && <span className="text-slate-400 text-xs">Aktualisiert: {lastUpdated.toLocaleTimeString('de-DE')}</span>}
            </div>
          </div>
          
          <div className="flex gap-3 flex-wrap">
            {localChanges && (
              <button 
                onClick={handleSimulateSync}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors font-bold shadow-sm animate-pulse"
              >
                <UploadCloud className="w-4 h-4" />
                Änderungen an Drive senden
              </button>
            )}
            
            <button 
              onClick={() => fetchData(false)} 
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm text-sm"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Settings */}
        {showSettings && (
          <Card className="bg-slate-50 border-blue-200 mb-6">
            <div className="p-6 space-y-4">
              <h2 className="font-bold text-lg">Einstellungen</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" value={urls.speakers} onChange={(e) => setUrls({...urls, speakers: e.target.value})} placeholder="Sprecher CSV URL" className="p-2 rounded border" />
                <input type="text" value={urls.moderators} onChange={(e) => setUrls({...urls, moderators: e.target.value})} placeholder="Moderation CSV URL" className="p-2 rounded border" />
                <input type="text" value={urls.program} onChange={(e) => setUrls({...urls, program: e.target.value})} placeholder="Programm CSV URL" className="p-2 rounded border" />
              </div>
              <div className="flex justify-between pt-2">
                 <button onClick={loadDemoData} className="text-sm text-slate-500 underline">Demo Daten laden</button>
                 <button onClick={handleSaveSettings} className="bg-green-600 text-white px-6 py-2 rounded-lg">Speichern</button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-12 gap-8 items-start">
          
          {/* Sidebar: Lists (Speakers & Mods) */}
          <div className="col-span-12 lg:col-span-3 space-y-8">
            {/* Speakers */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4" /> SprecherInnen ({speakers.length})
              </h3>
              <div className="space-y-2">
                {speakers.map(s => (
                  <div key={s.id} className="text-sm p-2 bg-slate-50 rounded border border-slate-100">
                    <div className="font-semibold text-slate-800">{s.fullName}</div>
                    <div className="text-xs text-slate-500 mt-1 flex gap-2">
                      <span className={s.status.startsWith('1') ? 'text-green-600' : 'text-slate-400'}>{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Moderators */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
               <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Mic2 className="w-4 h-4" /> Moderation ({moderators.length})
              </h3>
               <div className="space-y-2">
                {moderators.map(m => (
                  <div key={m.id} className="text-sm p-2 bg-slate-50 rounded border border-slate-100">
                    <div className="font-semibold text-slate-800">{m.fullName}</div>
                    <div className="text-xs text-slate-500 mt-1">{m.function}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Area: Programm Drag & Drop Board */}
          <div className="col-span-12 lg:col-span-9">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-orange-600" />
                Programm Planung (Drag & Drop)
              </h2>
              <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                Ziehen Sie Karten zwischen den Bühnen, um sie neu zuzuweisen.
              </div>
            </div>

            <DndContext 
              sensors={sensors} 
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 overflow-x-auto pb-8 custom-scrollbar">
                {stages.map(stage => {
                  // Filter items for this stage
                  const stageItems = program.filter(p => p.stage === stage);
                  
                  return (
                    <div key={stage} className="min-w-[300px] w-[320px] shrink-0 bg-slate-100 rounded-xl p-3 border border-slate-200">
                      <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="font-bold text-slate-700">{stage}</h3>
                        <span className="text-xs font-mono bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{stageItems.length}</span>
                      </div>
                      
                      <SortableContext 
                        id={stage} // This allows dropping into empty columns
                        items={stageItems.map(i => i.id)} 
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="min-h-[150px]">
                          {stageItems.length === 0 && (
                            <div className="text-center text-slate-400 text-xs py-8 border-2 border-dashed border-slate-200 rounded-lg">
                              Keine Sessions<br/>Hierher ziehen
                            </div>
                          )}
                          {stageItems.map(item => (
                            <SortableSessionItem key={item.id} session={item} />
                          ))}
                        </div>
                      </SortableContext>
                    </div>
                  );
                })}
              </div>

              {/* Drag Overlay for smooth visual */}
              <DragOverlay>
                {activeDragId ? (
                  <Card className="p-3 shadow-xl ring-2 ring-blue-500 rotate-2 opacity-90 cursor-grabbing w-[300px]">
                     {/* Simplified visual for drag */}
                     <h4 className="font-bold text-slate-800 text-sm">Session wird verschoben...</h4>
                  </Card>
                ) : null}
              </DragOverlay>

            </DndContext>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
