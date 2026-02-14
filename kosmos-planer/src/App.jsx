import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Users, Mic2, RefreshCw, Settings, Save, CheckCircle, AlertCircle, Calendar, Clock, MapPin } from 'lucide-react';

// Card Component for layout
const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
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
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

function App() {
  // State for storing the Google Sheet URLs
  const [urls, setUrls] = useState({
    speakers: localStorage.getItem('kosmos_speakers_url') || '',
    moderators: localStorage.getItem('kosmos_moderators_url') || '',
    program: localStorage.getItem('kosmos_program_url') || ''
  });

  // State for data
  const [speakers, setSpeakers] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [program, setProgram] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showSettings, setShowSettings] = useState(!urls.speakers || !urls.moderators || !urls.program);

  // Helper: Map pronouns based on CSV value (Column E)
  const mapPronoun = (value) => {
    if (!value) return 'unbekannt';
    const v = value.toLowerCase();
    if (v.includes('man') || v.includes('männlich')) return 'männlich';
    if (v.includes('woman') || v.includes('frau') || v.includes('weiblich')) return 'weiblich';
    if (v.includes('div') || v.includes('non') || v.includes('divers')) return 'divers';
    return value; // Fallback
  };

  // Helper: Normalize Status string
  const checkStatus = (statusValue, allowedPrefixes) => {
    if (!statusValue) return false;
    const s = statusValue.trim();
    return allowedPrefixes.some(prefix => s.startsWith(prefix));
  };

  const fetchData = async () => {
    if (!urls.speakers || !urls.moderators) {
      setError("Bitte hinterlegen Sie zumindest die Google Sheets CSV-Links für Sprecher und Moderation.");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const promises = [];

      // 1. Fetch Speakers
      promises.push(new Promise((resolve, reject) => {
        Papa.parse(urls.speakers, {
          download: true,
          header: false,
          complete: (results) => {
            const rows = results.data;
            const startIndex = rows[0] && rows[0][2] === 'Vorname' ? 1 : 0;
            const validSpeakers = rows.slice(startIndex).filter(row => {
              if (!row || row.length < 5) return false;
              return checkStatus(row[0], ['1', '2', '5']);
            }).map((row, index) => ({
              id: `sp-${index}`,
              firstName: row[2],
              lastName: row[3],
              fullName: `${row[2]} ${row[3]}`.trim(),
              status: row[0],
              pronoun: mapPronoun(row[4]),
              role: 'Speaker'
            }));
            setSpeakers(validSpeakers);
            resolve();
          },
          error: (err) => reject(`SprecherInnen: ${err.message}`)
        });
      }));

      // 2. Fetch Moderators
      promises.push(new Promise((resolve, reject) => {
        Papa.parse(urls.moderators, {
          download: true,
          header: false,
          complete: (results) => {
            const rows = results.data;
            const startIndex = rows[0] && rows[0][1] === 'Name' ? 1 : 0;
            const validModerators = rows.slice(startIndex).filter(row => {
              if (!row || row.length < 3) return false;
              const status = row[0];
              const func = row[2];
              const isStatusOk = checkStatus(status, ['1']);
              const isFunctionOk = func && (func.toLowerCase().includes('moderat') || func.toLowerCase().includes('stage'));
              return isStatusOk && isFunctionOk;
            }).map((row, index) => ({
              id: `mod-${index}`,
              fullName: row[1],
              status: row[0],
              function: row[2],
              role: 'Moderation'
            }));
            setModerators(validModerators);
            resolve();
          },
          error: (err) => reject(`Moderation: ${err.message}`)
        });
      }));

      // 3. Fetch Program (Optional but recommended)
      if (urls.program) {
        promises.push(new Promise((resolve, reject) => {
          Papa.parse(urls.program, {
            download: true,
            header: false,
            complete: (results) => {
              const rows = results.data;
              // Indices based on "Programm_Export.csv" snippet:
              // 0: ID, 1: Titel, 2: Status, 4: Format, 5: Bühne, 6: Start, 7: Ende, 9: Sprecher, 10: Mod
              const startIndex = rows[0] && rows[0][1] === 'Titel' ? 1 : 0;

              const validProgram = rows.slice(startIndex).filter(row => {
                 // Basic validation: needs a title
                 return row && row[1] && row[1].trim() !== '';
              }).map((row, index) => ({
                id: `prog-${row[0] || index}`, // Use ID from csv or index
                title: row[1],
                status: row[2],
                format: row[4],
                stage: row[5],
                start: row[6],
                end: row[7],
                speakers: row[9],
                moderators: row[10]
              }));
              setProgram(validProgram);
              resolve();
            },
            error: (err) => reject(`Programm: ${err.message}`)
          });
        }));
      }

      await Promise.all(promises);
      setLastUpdated(new Date());

    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urls.speakers && urls.moderators) {
      fetchData();
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('kosmos_speakers_url', urls.speakers);
    localStorage.setItem('kosmos_moderators_url', urls.moderators);
    localStorage.setItem('kosmos_program_url', urls.program);
    setShowSettings(false);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              KOSMOS Planer
            </h1>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${lastUpdated ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
              {lastUpdated 
                ? `Live synchronisiert: ${lastUpdated.toLocaleTimeString('de-DE')}` 
                : 'Warte auf Synchronisation...'}
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={fetchData} 
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm"
            >
              <Settings className="w-4 h-4" />
              Einstellungen
            </button>
          </div>
        </header>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Ein Fehler ist aufgetreten</p>
              <p className="text-sm opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <Card className="bg-slate-50 border-blue-200">
            <div className="p-6 border-b border-blue-100 bg-blue-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                Google Drive Integration
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                Bitte geben Sie die Links zu den CSV-Exports der jeweiligen Google Sheets Reiter an.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">SprecherInnen (CSV)</label>
                <input 
                  type="text" value={urls.speakers}
                  onChange={(e) => setUrls(prev => ({...prev, speakers: e.target.value}))}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Moderation (CSV)</label>
                <input 
                  type="text" value={urls.moderators}
                  onChange={(e) => setUrls(prev => ({...prev, moderators: e.target.value}))}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Programm Export (CSV)</label>
                <input 
                  type="text" value={urls.program}
                  onChange={(e) => setUrls(prev => ({...prev, program: e.target.value}))}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button 
                  onClick={handleSaveSettings}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium shadow-md transition-all"
                >
                  <Save className="w-4 h-4" />
                  Speichern & Laden
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
          
          {/* Column 1: SprecherInnen */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Users className="w-5 h-5" />
                </div>
                SprecherInnen
                <span className="ml-2 text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  {speakers.length}
                </span>
              </h2>
            </div>
            <div className="space-y-3">
              {speakers.map((speaker) => (
                <Card key={speaker.id} className="group hover:shadow-md transition-shadow">
                  <div className="p-4 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800">{speaker.fullName}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge color={speaker.status.startsWith('1') ? 'green' : 'blue'}>
                          {speaker.status}
                        </Badge>
                        <Badge color="gray">{speaker.pronoun}</Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {speakers.length === 0 && !loading && <div className="text-slate-400 text-center py-8 border-2 border-dashed rounded-xl">Keine Daten</div>}
            </div>
          </section>

          {/* Column 2: Moderation */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
                  <Mic2 className="w-5 h-5" />
                </div>
                Moderation
                <span className="ml-2 text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  {moderators.length}
                </span>
              </h2>
            </div>
            <div className="space-y-3">
              {moderators.map((mod) => (
                <Card key={mod.id} className="group hover:shadow-md transition-shadow">
                  <div className="p-4 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800">{mod.fullName}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge color="green">{mod.status}</Badge>
                        <Badge color="purple">{mod.function}</Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {moderators.length === 0 && !loading && <div className="text-slate-400 text-center py-8 border-2 border-dashed rounded-xl">Keine Daten</div>}
            </div>
          </section>

          {/* Column 3: Programm / Backup */}
          <section className="space-y-4 md:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                Programm Backup
                <span className="ml-2 text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  {program.length}
                </span>
              </h2>
            </div>
            
            <div className="space-y-3">
              {program.map((item) => (
                <Card key={item.id} className="group hover:shadow-md transition-shadow p-4">
                  <div className="flex justify-between items-start mb-2">
                    <Badge color={item.status === '1_Zusage' ? 'green' : 'gray'}>
                      {item.status || 'Status?'}
                    </Badge>
                    <div className="flex items-center text-xs text-slate-500 gap-1">
                      <Clock className="w-3 h-3" />
                      {item.start || '--:--'} - {item.end || '--:--'}
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-slate-800 text-sm mb-1 leading-snug">
                    {item.title}
                  </h3>
                  
                  <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                    <MapPin className="w-3 h-3" />
                    {item.stage || 'Keine Bühne'}
                  </div>

                  <div className="space-y-1">
                    {item.speakers && (
                      <div className="text-xs text-slate-500">
                        <span className="font-semibold">Speaker:</span> {item.speakers}
                      </div>
                    )}
                    {item.moderators && (
                      <div className="text-xs text-slate-500">
                        <span className="font-semibold">Mod:</span> {item.moderators}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
              {program.length === 0 && !loading && (
                <div className="text-slate-400 text-center py-8 border-2 border-dashed rounded-xl">
                  {urls.program ? 'Keine Programm-Daten' : 'Bitte Link in Einstellungen einfügen'}
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

export default App;
