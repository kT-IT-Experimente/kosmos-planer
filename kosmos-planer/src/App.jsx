import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, Clock, Users, Mic, MapPin, Download, Plus, 
  GripVertical, RefreshCw, Trash2, AlertTriangle, FileSpreadsheet,
  MoreHorizontal, X, Save, Ban, Lock, Unlock, Settings, Edit2,
  PieChart, CheckSquare, Square, Info, Video, Accessibility, MicOff,
  Upload, FileText, Search, CornerLeftUp, CheckCircle, XCircle,
  Globe, StickyNote, Wrench
} from 'lucide-react';

// --- INITIAL DATA (FALLBACK) ---
const INITIAL_SPEAKERS = [
  { name: "Luisa Neubauer", gender: "w" }, { name: "Rezo", gender: "m" },
  { name: "Mai Thi Nguyen-Kim", gender: "w" }, { name: "Sibylle Berg", gender: "w" }, { name: "Kübra Gümüşay", gender: "w" },
  { name: "Tupoka Ogette", gender: "w" }, { name: "Linus Neumann", gender: "m" },
  { name: "Mithu Sanyal", gender: "w" }, { name: "Alice Hasters", gender: "w" },
  { name: "Kevin Kühnert", gender: "m" }, { name: "Aminata Touré", gender: "w" },
  { name: "Carola Rackete", gender: "w" }, { name: "Sascha Lobo", gender: "m" },
  { name: "Jagoda Marinić", gender: "w" }, { name: "Margarete Stokowski", gender: "w" },
  { name: "Friedemann Karig", gender: "m" }, { name: "Samira El Ouassil", gender: "w" },
  { name: "Raul Krauthausen", gender: "m" }, { name: "Katja Riemann", gender: "w" }
];

const INITIAL_MODERATORS = [
  { name: "Anne Will", gender: "w" }, { name: "Louis Klamroth", gender: "m" },
  { name: "Salwa Houmsi", gender: "w" }, { name: "Michel Abdollahi", gender: "m" },
  { name: "Eva Schulz", gender: "w" }, { name: "Tilo Jung", gender: "m" },
  { name: "Aline Abboud", gender: "w" }, { name: "Joko Winterscheidt", gender: "m" }
];

const MOCK_TITLES = [
  "Die Zukunft der Demokratie", "K.I. und Kunst: Wer schöpft?", 
  "Klimakrise: Kipppunkte & Hoffnung", "Netzpolitik am Limit",
  "Mentale Gesundheit in der Krise", "Recht auf Stadt", 
  "Clubkultur als Safe Space", "Investigativer Journalismus Live",
  "Das Ende des Kapitalismus?", "Utopien für 2030"
];

// --- Constants & Helpers ---
const TIME_SLOT_MINUTES = 15;
const PIXELS_PER_SLOT = 30;

const generateId = () => Math.random().toString(36).substr(2, 5).toUpperCase();

const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const timeToMinutes = (timeStr) => {
    if(!timeStr || !timeStr.includes(':')) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

// --- ROBUST CSV PARSER (COMMA SEPARATED) ---
const parseCSV = (text) => {
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return [];

    const splitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const headers = lines[0].split(splitRegex).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    
    return lines.slice(1).map(line => {
        const values = line.split(splitRegex).map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = values[i] || ''; 
        });
        return obj;
    });
};

const downloadCSV = (content, filename) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const App = () => {
  // --- State: Configuration ---
  const [config, setConfig] = useState({
    startTime: 12, 
    endTime: 20,    
    numMainStages: 3,
    numWorkshops: 7,
    minBuffer: 10,
    breaks: [] 
  });

  const [view, setView] = useState('setup'); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- State: Data ---
  const [stages, setStages] = useState([]); 
  const [sessions, setSessions] = useState([]);
  
  // Dynamic Database
  const [speakersDB, setSpeakersDB] = useState(INITIAL_SPEAKERS);
  const [moderatorsDB, setModeratorsDB] = useState(INITIAL_MODERATORS);

  // UI State
  const [draggedSessionId, setDraggedSessionId] = useState(null);
  const [speakerSearch, setSpeakerSearch] = useState(""); 
  const [notification, setNotification] = useState(null); 
   
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
   
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // --- Derived State for Timeline ---
  const displayStartMinutes = (config.startTime * 60) - 60;
  const displayEndMinutes = (config.endTime * 60) + 60;
   
  const totalDuration = displayEndMinutes - displayStartMinutes;
  const slotsCount = totalDuration / TIME_SLOT_MINUTES;

  // --- Notification Helper ---
  const showNotification = (type, message) => {
      setNotification({ type, message });
      const time = type === 'success' ? 3000 : 6000;
      setTimeout(() => setNotification(null), time);
  };

  // --- Initialization ---
  const generateInitialSchedule = () => {
    const newStages = [];
    const createStage = (id, name, capacity, mics) => ({
        id, name, type: 'main', capacity, 
        maxMics: mics, maxSpeakers: mics + 1,
        hasVideo: true, isAccessible: true
    });

    for(let i=1; i<=config.numMainStages; i++) 
        newStages.push(createStage(`main-${i}`, `Main Stage ${i}`, 200, 6));
    
    for(let i=1; i<=config.numWorkshops; i++) 
        newStages.push({ ...createStage(`ws-${i}`, `Workshop ${i}`, 30, 2), type: 'workshop', hasVideo: false });
    
    setStages(newStages);

    const newSessions = [];
    const add = (type, duration, title, speakerIndices, stageId, startTime, status='Vorschlag') => {
      const assignedSpeakers = speakerIndices.map(i => speakersDB[i % speakersDB.length].name);
      newSessions.push({
        id: generateId(),
        title: title,
        type,
        duration,
        speakers: assignedSpeakers,
        moderator: "",
        stageId,
        startTime, 
        status, 
        isPartner: false,
        language: 'Deutsch',
        notes: '',
        productionInfo: ''
      });
    };

    if (newStages.length > 0) {
        add('Panel', 90, MOCK_TITLES[0], [0, 1, 2], newStages[0].id, (config.startTime * 60) + 60, 'Fixiert');
    }
    if (newStages.length > 1) {
        add('Talk', 45, MOCK_TITLES[1], [3], newStages[1].id, (config.startTime * 60) + 90, 'Akzeptiert');
    }
    
    add('Workshop', 120, "DIY Synthesizer", [18], null, null);

    setSessions(newSessions);
    setView('schedule');
  };

  // --- Style Logic ---
  const getSessionStyle = (session) => {
      let bgClass = 'bg-slate-600';
      if (session.type === 'Panel') bgClass = 'bg-indigo-600';
      else if (session.type === 'Talk') bgClass = 'bg-sky-600';
      else if (session.type === 'Workshop') bgClass = 'bg-purple-600';
      else if (session.type === 'Partner') bgClass = 'bg-emerald-600';
      else if (session.type === 'SOS') bgClass = 'bg-red-600';
      else if (session.type === 'Idee') bgClass = 'bg-amber-600';

      let borderClass = 'border-l-4 border-slate-400';
      let opacityClass = 'opacity-100';
      
      if (session.status === 'Vorschlag') {
          borderClass = 'border-2 border-dashed border-amber-300';
          opacityClass = 'opacity-90';
      } else if (session.status === 'Akzeptiert') {
          borderClass = 'border-2 border-solid border-blue-300';
      } else if (session.status === 'Fixiert') {
          borderClass = 'border-4 border-solid border-emerald-400 font-bold shadow-lg';
      }

      return `${bgClass} ${borderClass} ${opacityClass}`;
  };

  // --- Analytics & Validation Logic ---
  const analytics = useMemo(() => {
    let male = 0, female = 0, totalSpeakers = 0, partnerCount = 0, totalSessions = sessions.length;
    let counts = { Talk: 0, Panel: 0, Workshop: 0 };
    
    const getGender = (name) => {
        const s = speakersDB.find(p => p.name === name);
        if(s) return s.gender;
        const m = moderatorsDB.find(p => p.name === name);
        if(m) return m.gender;
        return null;
    };

    sessions.forEach(s => {
        if (s.isPartner) partnerCount++;
        if (counts[s.type] !== undefined) counts[s.type]++;

        const people = [...(s.speakers || []), s.moderator].filter(Boolean);
        people.forEach(name => {
            const g = getGender(name);
            if (g === 'm') male++;
            if (g === 'w') female++;
            totalSpeakers++;
        });
    });

    const totalGender = male + female;
    const femalePct = totalGender ? Math.round((female / totalGender) * 100) : 0;
    const partnerPct = totalSessions ? Math.round((partnerCount / totalSessions) * 100) : 0;
    
    return { male, female, totalSpeakers, counts, femalePct, partnerCount, partnerPct };
  }, [sessions, speakersDB, moderatorsDB]);


  const checkPersonConflicts = (currentSession) => {
      const currentPeople = [...(currentSession.speakers || []), currentSession.moderator].filter(Boolean);
      if (currentPeople.length === 0) return null;
      if (currentSession.startTime === null) return null;

      const currentStart = currentSession.startTime;
      const currentEnd = currentStart + currentSession.duration;

      const others = sessions.filter(s => s.id !== currentSession.id && s.startTime !== null);

      for (const other of others) {
          const otherStart = other.startTime;
          const otherEnd = otherStart + other.duration;

          if (currentStart < otherEnd && currentEnd > otherStart) {
               const otherPeople = [...(other.speakers || []), other.moderator].filter(Boolean);
               const overlap = currentPeople.filter(p => otherPeople.includes(p));
               
               if (overlap.length > 0) {
                   const stageName = stages.find(st => st.id === other.stageId)?.name || "Unbekannt";
                   return `KONFLIKT: ${overlap.join(', ')} zeitgleich auf "${stageName}" (${minutesToTime(otherStart)}-${minutesToTime(otherEnd)})`;
               }
          }
      }
      return null;
  };

  const checkStageConstraints = (session, stageId) => {
      const stage = stages.find(s => s.id === stageId);
      if (!stage) return null;

      const peopleCount = (session.speakers?.length || 0) + (session.moderator ? 1 : 0);
      
      if (peopleCount > stage.maxSpeakers) {
          return `Kapazität: Zu viele Personen (${peopleCount}) für Bühne (${stage.maxSpeakers} Max)`;
      }
      if (peopleCount > stage.maxMics) {
          return `Technik: Zu wenig Mikrofone (${stage.maxMics}) für ${peopleCount} Personen`;
      }
      return null;
  };

  const validatePlacement = (targetStageId, targetTime, duration, ignoreSessionId = null) => {
    const targetEnd = targetTime + duration;

    // Global Breaks
    for (const brk of config.breaks) {
        const breakEnd = brk.start + brk.duration;
        if (targetTime < breakEnd && targetEnd > brk.start) {
            return { valid: false, message: `Konflikt mit Pause (${minutesToTime(brk.start)} - ${minutesToTime(breakEnd)})!` };
        }
    }

    if (targetTime < displayStartMinutes) return { valid: false, message: "Vor Anzeige-Start!" };
    
    const stageSessions = sessions.filter(s => s.stageId === targetStageId && s.id !== ignoreSessionId);
    
    for (const other of stageSessions) {
        const otherStart = other.startTime;
        const otherEnd = other.startTime + other.duration;
        const buffer = config.minBuffer;

        if (targetTime < otherEnd && targetEnd > otherStart) {
             return { valid: false, message: "Kollision mit bestehender Session!", collision: other };
        }
        if (targetTime >= otherEnd && targetTime < otherEnd + buffer) {
             return { valid: false, message: `Puffer (${config.minBuffer} min) unterschritten!` };
        }
        if (targetEnd <= otherStart && targetEnd + buffer > otherStart) {
             return { valid: false, message: `Puffer (${config.minBuffer} min) unterschritten!` };
        }
    }
    return { valid: true };
  };

  // --- Drag & Drop ---
  const handleDragStart = (e, session) => {
    if (session.status === 'Fixiert') { e.preventDefault(); return; }
    setDraggedSessionId(session.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e, targetStageId, targetTime) => {
    e.preventDefault();
    if (!draggedSessionId) return;

    const draggedIndex = sessions.findIndex(s => s.id === draggedSessionId);
    if (draggedIndex === -1) return;
    const draggedItem = sessions[draggedIndex];

    const validation = validatePlacement(targetStageId, targetTime, draggedItem.duration, draggedItem.id);

    if (!validation.valid) {
        if (validation.collision && validation.collision.status !== 'Fixiert') {
             // Swap
             const collisionItem = validation.collision;
             const updatedSessions = [...sessions];
             updatedSessions[draggedIndex] = { ...draggedItem, stageId: targetStageId, startTime: targetTime };
             const collisionIndex = sessions.findIndex(s => s.id === collisionItem.id);
             updatedSessions[collisionIndex] = { ...collisionItem, stageId: draggedItem.stageId, startTime: draggedItem.startTime };
             setSessions(updatedSessions);
             setDraggedSessionId(null);
             return;
        }
        showNotification('error', `⚠️ ${validation.message}`);
        return;
    }

    const tempSession = { ...draggedItem, startTime: targetTime, stageId: targetStageId };
    const personConflict = checkPersonConflicts(tempSession);
    if (personConflict) {
        showNotification('error', `⚠️ ${personConflict}`);
        return; 
    }

    // Update session
    const updatedSessions = [...sessions];
    updatedSessions[draggedIndex] = { ...draggedItem, stageId: targetStageId, startTime: targetTime };
    setSessions(updatedSessions);
    setDraggedSessionId(null);
  };

  // --- INBOX Drag & Drop Handler ---
  const handleInboxDrop = (e) => {
      e.preventDefault();
      if (!draggedSessionId) return;
      
      const updatedSessions = sessions.map(s => 
        s.id === draggedSessionId 
            ? { ...s, stageId: null, startTime: null, status: 'Vorschlag' } 
            : s
      );
      setSessions(updatedSessions);
      setDraggedSessionId(null);
  };

  // --- Modals Logic ---
  const openNewSessionModal = () => {
    setEditingSession({
        id: null, title: "", type: 'Talk', duration: 45, speakers: [],
        moderator: "", stageId: null, startTime: null, status: 'Vorschlag', isPartner: false,
        language: 'Deutsch', notes: '', productionInfo: ''
    });
    setSpeakerSearch("");
    setIsModalOpen(true);
  };

  const openEditModal = (session) => {
    setEditingSession({ ...session });
    setSpeakerSearch("");
    setIsModalOpen(true);
  };

  const openStageModal = (stage) => {
      setEditingStage({ ...stage });
      setIsStageModalOpen(true);
  };

  const saveSession = () => {
    if (!editingSession.title) return alert("Bitte Titel eingeben");
    
    if (editingSession.startTime !== null) {
        const conflict = checkPersonConflicts(editingSession);
        if (conflict) return alert(conflict);
    }

    const sessionToSave = { ...editingSession };
    if (sessionToSave.id) {
        setSessions(sessions.map(s => s.id === sessionToSave.id ? sessionToSave : s));
    } else {
        setSessions([...sessions, { ...sessionToSave, id: generateId() }]);
    }
    setIsModalOpen(false);
  };

  const saveStage = () => {
      setStages(stages.map(s => s.id === editingStage.id ? editingStage : s));
      setIsStageModalOpen(false);
  };

  // --- Import Logic ---
  const handleStageImport = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = parseCSV(evt.target.result);
            const importedStages = data.map(row => ({
                id: row.id || generateId(),
                name: row.name || "Unbenannt",
                capacity: Number(row.capacity) || 100,
                type: row.type || 'main',
                maxMics: Number(row.maxmics) || 4,
                maxSpeakers: Number(row.maxspeakers) || 4,
                hasVideo: row.hasvideo === 'true',
                isAccessible: row.isaccessible === 'true'
            }));

            if(importedStages.length > 0) {
                setStages(importedStages);
                
                // DATA CLEANUP: Move sessions on missing stages to Inbox
                const validStageIds = new Set(importedStages.map(s => s.id));
                let movedCount = 0;
                
                const cleanedSessions = sessions.map(s => {
                    if (s.stageId && !validStageIds.has(s.stageId)) {
                        movedCount++;
                        return { ...s, stageId: null, startTime: null, status: 'Vorschlag' };
                    }
                    return s;
                });

                setSessions(cleanedSessions);

                if (movedCount > 0) {
                    showNotification('warning', `Bühnenwechsel: ${movedCount} Sessions wurden in die Inbox verschoben, da ihre Bühne gelöscht wurde.`);
                } else {
                    showNotification('success', `${importedStages.length} Bühnen erfolgreich importiert!`);
                }
            } else {
                showNotification('error', "Keine gültigen Bühnen-Daten gefunden.");
            }
        } catch (err) { showNotification('error', "Fehler beim Import: " + err.message); }
    };
    reader.readAsText(file);
  };

  const handleSpeakerImport = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = parseCSV(evt.target.result);
            const newSpeakers = [];
            const newModerators = [];

            data.forEach(row => {
                const name = row.name;
                const gender = row.gender || 'w';
                const role = row.role || 'Speaker';
                
                if (name) {
                    const person = { name, gender };
                    if (role && role.toLowerCase().includes('mod')) {
                        newModerators.push(person);
                    } else {
                        newSpeakers.push(person);
                    }
                }
            });

            if(newSpeakers.length > 0 || newModerators.length > 0) {
                setSpeakersDB(newSpeakers);
                setModeratorsDB(newModerators);

                // DATA CLEANUP: Remove ghost speakers from existing sessions
                const validSpeakerNames = new Set(newSpeakers.map(p => p.name));
                const validModNames = new Set(newModerators.map(p => p.name));
                let cleanupCount = 0;

                const cleanedSessions = sessions.map(s => {
                    let changed = false;
                    
                    // Filter Speakers
                    const originalCount = s.speakers ? s.speakers.length : 0;
                    const cleanSpeakers = (s.speakers || []).filter(name => validSpeakerNames.has(name));
                    
                    if (cleanSpeakers.length !== originalCount) changed = true;

                    // Check Moderator
                    let cleanMod = s.moderator;
                    if (s.moderator && !validModNames.has(s.moderator)) {
                        cleanMod = "";
                        changed = true;
                    }

                    if (changed) cleanupCount++;

                    return { ...s, speakers: cleanSpeakers, moderator: cleanMod };
                });

                setSessions(cleanedSessions);

                if (cleanupCount > 0) {
                    showNotification('warning', `Datenbank-Wechsel: ${cleanupCount} Sessions wurden bereinigt (ungültige Namen entfernt).`);
                } else {
                    showNotification('success', `Import: ${newSpeakers.length} Speakers, ${newModerators.length} Mods.`);
                }
            } else {
                showNotification('error', "Keine gültigen Personen-Daten gefunden.");
            }
        } catch (err) { showNotification('error', "Fehler beim Import: " + err.message); }
    };
    reader.readAsText(file);
  };

  const handleProgramImport = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = parseCSV(evt.target.result);
            
            // Validation Sets
            const validStageNames = new Set(stages.map(s => s.name));
            const validSpeakerNames = new Set(speakersDB.map(s => s.name));
            
            let warningMsg = null;
            let missingStages = 0;
            let missingSpeakers = 0;

            const importedSessions = data.map(row => {
                const stageObj = stages.find(s => s.name === row['bühne']);
                const stageId = stageObj ? stageObj.id : null;
                
                // Track missing meta-data
                if (row['bühne'] && !stageObj) missingStages++;
                
                const sessSpeakers = row['sprecher:innen'] ? row['sprecher:innen'].split(',').map(s=>s.trim()).filter(s=>s) : [];
                sessSpeakers.forEach(s => {
                    if (!validSpeakerNames.has(s)) missingSpeakers++;
                });

                const startTime = row.start && row.start !== '-' ? timeToMinutes(row.start) : null;
                
                return {
                    id: row.id || generateId(),
                    title: row.titel || "Imported",
                    status: row.status || 'Vorschlag',
                    isPartner: row.partner === 'JA',
                    type: row.format || 'Talk',
                    stageId: stageId, // Will be null if stage not found -> Inbox
                    startTime: startTime,
                    duration: Number(row.dauer) || 45,
                    speakers: sessSpeakers,
                    moderator: row.moderation || "",
                    language: row.sprache || 'Deutsch',
                    notes: row.notizen || '',
                    productionInfo: row.stagedispo || ''
                };
            });

            if(importedSessions.length > 0) {
                setSessions(importedSessions);
                setIsImportModalOpen(false);

                if (missingStages > 0 || missingSpeakers > 0) {
                    showNotification('warning', `Import mit Warnungen: ${missingStages} unbekannte Bühnen (-> Inbox), ${missingSpeakers} unbekannte Sprecher.`);
                } else {
                    showNotification('success', `${importedSessions.length} Sessions erfolgreich importiert!`);
                }
            } else {
                showNotification('error', "Keine gültigen Programm-Daten gefunden.");
            }
        } catch (err) { showNotification('error', "Fehler beim Import: " + err.message); }
    };
    reader.readAsText(file);
  };


  // --- Export Logic ---
  const clean = (txt) => txt ? `"${String(txt).replace(/"/g, '""')}"` : ''; 

  const handleStageExport = () => {
      const headers = ["ID", "Name", "Capacity", "Type", "MaxMics", "MaxSpeakers", "HasVideo", "IsAccessible"];
      const rows = stages.map(s => 
          [clean(s.id), clean(s.name), s.capacity, clean(s.type), s.maxMics, s.maxSpeakers, s.hasVideo, s.isAccessible].join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      downloadCSV(csv, "kosmos_buehnen.csv");
  };

  const handleSpeakerExport = () => {
      const headers = ["Name", "Gender", "Role"];
      const speakerRows = speakersDB.map(s => [clean(s.name), clean(s.gender), "Speaker"].join(','));
      const modRows = moderatorsDB.map(s => [clean(s.name), clean(s.gender), "Moderation"].join(','));
      
      const csv = [headers.join(','), ...speakerRows, ...modRows].join('\n');
      downloadCSV(csv, "kosmos_personen.csv");
  };

  const handleProgramExport = () => {
    const headers = ["ID", "Titel", "Status", "Partner", "Format", "Bühne", "Start", "Ende", "Dauer", "Sprecher:innen", "Moderation", "Sprache", "Notizen", "StageDispo"];
    const rows = sessions.map(s => {
        const stageName = stages.find(st => st.id === s.stageId)?.name || 'Inbox';
        const start = s.startTime ? minutesToTime(s.startTime) : '-';
        const end = s.startTime ? minutesToTime(s.startTime + s.duration) : '-';
        const speakers = s.speakers ? s.speakers.join(', ') : '';
        
        return [
            clean(s.id), clean(s.title), clean(s.status), s.isPartner ? 'JA' : 'NEIN', clean(s.type), 
            clean(stageName), clean(start), clean(end), s.duration, clean(speakers), clean(s.moderator || ''),
            clean(s.language || 'Deutsch'), clean(s.notes || ''), clean(s.productionInfo || '')
        ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadCSV(csvContent, "kosmos_programm.csv");
  };

  // --- Render Sub-Components ---
  const renderNotification = () => {
      if(!notification) return null;
      let bgColor = 'bg-slate-800';
      let borderColor = 'border-slate-600';
      let textColor = 'text-white';
      let Icon = CheckCircle;

      if (notification.type === 'success') {
          bgColor = 'bg-emerald-900/95';
          borderColor = 'border-emerald-500';
          textColor = 'text-emerald-100';
      } else if (notification.type === 'error') {
          bgColor = 'bg-red-900/95';
          borderColor = 'border-red-500';
          textColor = 'text-red-100';
          Icon = XCircle;
      } else if (notification.type === 'warning') {
          bgColor = 'bg-amber-900/95';
          borderColor = 'border-amber-500';
          textColor = 'text-amber-100';
          Icon = AlertTriangle;
      }

      return (
          <div className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-2xl border flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 ${bgColor} ${borderColor} ${textColor} max-w-md`}>
              <Icon size={24} className="shrink-0"/>
              <div>
                  <div className="font-bold text-sm uppercase tracking-wide">{notification.type === 'success' ? 'Erfolg' : (notification.type === 'error' ? 'Fehler' : 'Hinweis')}</div>
                  <div className="text-xs opacity-90 leading-tight">{notification.message}</div>
              </div>
              <button onClick={() => setNotification(null)} className="ml-2 opacity-60 hover:opacity-100"><X size={14}/></button>
          </div>
      );
  };

  const renderExportModal = () => {
    if(!isExportModalOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2"><Download size={20}/> Daten Export (CSV)</h3>
                    <button onClick={() => setIsExportModalOpen(false)}><X className="text-slate-400 hover:text-white"/></button>
                </div>
                
                <div className="space-y-6">
                    <div className="bg-slate-900/50 p-4 rounded text-sm text-slate-300 mb-4 border border-slate-700">
                        Wähle aus, welche Daten du exportieren möchtest. Das Format ist identisch zum Import (CSV, Komma-getrennt, Google Sheets Standard), um einen einfachen Datenaustausch zu ermöglichen.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* 1. STAGES */}
                        <div className="bg-slate-900 p-4 rounded border border-slate-700 flex flex-col justify-between">
                            <div>
                                <h4 className="font-bold text-slate-300 mb-2">1. Bühnen</h4>
                                <p className="text-xs text-slate-500 mb-4">
                                    Exportiert alle konfigurierten Bühnen, Kapazitäten und technische Details.
                                </p>
                            </div>
                            <button onClick={handleStageExport} className="w-full bg-slate-800 border border-slate-600 px-3 py-2 rounded hover:bg-slate-700 text-sm font-semibold flex items-center justify-center gap-2">
                                <Download size={14}/> Bühnen.csv
                            </button>
                        </div>

                        {/* 2. SPEAKERS & MODERATORS */}
                        <div className="bg-slate-900 p-4 rounded border border-slate-700 flex flex-col justify-between">
                            <div>
                                <h4 className="font-bold text-slate-300 mb-2">2. Personen DB</h4>
                                <p className="text-xs text-slate-500 mb-4">
                                    Exportiert Sprecher:innen und Moderator:innen in eine gemeinsame Datei (mit Rolle).
                                </p>
                            </div>
                            <button onClick={handleSpeakerExport} className="w-full bg-slate-800 border border-slate-600 px-3 py-2 rounded hover:bg-slate-700 text-sm font-semibold flex items-center justify-center gap-2">
                                <Download size={14}/> Personen.csv
                            </button>
                        </div>

                        {/* 3. PROGRAM */}
                        <div className="bg-slate-900 p-4 rounded border border-slate-700 ring-1 ring-indigo-500/50 flex flex-col justify-between">
                            <div>
                                <h4 className="font-bold text-indigo-300 mb-2">3. Programm</h4>
                                <p className="text-xs text-slate-500 mb-4">
                                    Exportiert den kompletten Zeitplan inkl. Inbox, Zeiten und Zuordnungen.
                                </p>
                            </div>
                            <button onClick={handleProgramExport} className="w-full bg-indigo-600 border border-indigo-500 text-white px-3 py-2 rounded hover:bg-indigo-500 shadow-lg text-sm font-semibold flex items-center justify-center gap-2">
                                <Download size={14}/> Programm.csv
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const renderImportModal = () => {
    if(!isImportModalOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2"><Upload size={20}/> Daten Import (CSV)</h3>
                    <button onClick={() => setIsImportModalOpen(false)}><X className="text-slate-400 hover:text-white"/></button>
                </div>
                
                <div className="space-y-6">
                    <div className="bg-amber-900/20 border border-amber-600/50 p-4 rounded text-sm text-amber-100 mb-4">
                        <Info size={16} className="inline mr-2"/>
                        <strong>Achtung:</strong> Der Import ersetzt/ergänzt die aktuellen Daten. Bitte verwenden Sie das Format "Komma-getrennte CSV" (Google Sheets / US-Excel Standard).
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* 1. STAGES */}
                        <div className="bg-slate-900 p-4 rounded border border-slate-700">
                            <h4 className="font-bold text-slate-300 mb-2 flex items-center gap-2">1. Bühnen</h4>
                            <p className="text-xs text-slate-500 mb-4">
                                Spalten: ID, Name, Capacity, Type, MaxMics, MaxSpeakers
                            </p>
                            <label className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer">
                                <input type="file" accept=".csv" onChange={handleStageImport} className="hidden" />
                                <span className="bg-slate-800 border border-slate-600 px-3 py-1 rounded hover:bg-slate-700">Datei wählen...</span>
                            </label>
                        </div>

                        {/* 2. SPEAKERS & MODERATORS */}
                        <div className="bg-slate-900 p-4 rounded border border-slate-700">
                            <h4 className="font-bold text-slate-300 mb-2 flex items-center gap-2">2. Personen DB</h4>
                            <p className="text-xs text-slate-500 mb-4">
                                Spalten: Name, Gender, Role
                                <br/><span className="text-[10px] opacity-70">Role="Moderation" -&gt; Mod Liste</span>
                            </p>
                            <label className="block w-full text-sm text-slate-400 cursor-pointer">
                                <input type="file" accept=".csv" onChange={handleSpeakerImport} className="hidden" />
                                <span className="bg-slate-800 border border-slate-600 px-3 py-1 rounded hover:bg-slate-700">Datei wählen...</span>
                            </label>
                        </div>

                        {/* 3. PROGRAM */}
                        <div className="bg-slate-900 p-4 rounded border border-slate-700 ring-1 ring-indigo-500/50">
                            <h4 className="font-bold text-indigo-300 mb-2 flex items-center gap-2">3. Programm</h4>
                            <p className="text-xs text-slate-500 mb-4">
                                Format wie Export. Spalten: ID, Titel, Status, Bühne...
                            </p>
                            <label className="block w-full text-sm text-slate-400 cursor-pointer">
                                <input type="file" accept=".csv" onChange={handleProgramImport} className="hidden" />
                                <span className="bg-indigo-600 border border-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-500 shadow-lg">Timetable laden</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div className="mt-8 text-xs text-slate-500 text-center">
                    Für Drive-Dateien/Rider: Bitte als .csv exportieren und hier hochladen.
                </div>
            </div>
        </div>
    );
  };

  const renderStageModal = () => {
      if (!isStageModalOpen || !editingStage) return null;
      return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2"><Settings size={20}/> Bühne Bearbeiten</h3>
                    <button onClick={() => setIsStageModalOpen(false)}><X className="text-slate-400 hover:text-white"/></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 uppercase">Name der Bühne</label>
                        <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                            value={editingStage.name} onChange={e=>setEditingStage({...editingStage, name: e.target.value})}/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 uppercase">Sitzplätze</label>
                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                                value={editingStage.capacity} onChange={e=>setEditingStage({...editingStage, capacity: Number(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 uppercase">Max. Mikrofone</label>
                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                                value={editingStage.maxMics} onChange={e=>setEditingStage({...editingStage, maxMics: Number(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 uppercase">Max. Personen</label>
                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                                value={editingStage.maxSpeakers} onChange={e=>setEditingStage({...editingStage, maxSpeakers: Number(e.target.value)})}/>
                        </div>
                    </div>
                    <div className="bg-slate-900 p-4 rounded border border-slate-700 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editingStage.hasVideo} onChange={e=>setEditingStage({...editingStage, hasVideo: e.target.checked})}/>
                            <span className="flex items-center gap-2 text-sm"><Video size={14}/> Video-Aufzeichnung vorhanden</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editingStage.isAccessible} onChange={e=>setEditingStage({...editingStage, isAccessible: e.target.checked})}/>
                            <span className="flex items-center gap-2 text-sm"><Accessibility size={14}/> Barrierefrei (Rampe)</span>
                        </label>
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button onClick={saveStage} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-bold">Speichern</button>
                </div>
            </div>
        </div>
      );
  };

  const renderEditModal = () => {
    if (!isModalOpen || !editingSession) return null;
    const conflictData = checkPersonConflicts(editingSession);
    const techConflict = editingSession.stageId ? checkStageConstraints(editingSession, editingSession.stageId) : null;

    const toggleSpeaker = (name) => {
        const current = editingSession.speakers || [];
        setEditingSession({...editingSession, speakers: current.includes(name) ? current.filter(s => s !== name) : [...current, name]});
    };

    // Filter speakers based on search
    const filteredSpeakers = speakersDB.filter(p => 
        p.name.toLowerCase().includes(speakerSearch.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-800 z-10">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {editingSession.id ? 'Session Bearbeiten' : 'Neue Session'}
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-mono">#{editingSession.id || 'NEW'}</span>
                    </h3>
                    <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-white"/></button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Warnings */}
                    {(conflictData || techConflict) && (
                        <div className="space-y-2">
                            {conflictData && (
                                <div className="bg-red-900/40 border border-red-500 rounded p-3 flex items-start gap-3">
                                    <AlertTriangle className="text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-red-400 text-sm">Doppelbelegung</h4>
                                        <p className="text-xs text-red-200">{conflictData}</p>
                                    </div>
                                </div>
                            )}
                            {techConflict && (
                                <div className="bg-amber-900/40 border border-amber-500 rounded p-3 flex items-start gap-3">
                                    <MicOff className="text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-amber-400 text-sm">Technik / Kapazität Konflikt</h4>
                                        <p className="text-xs text-amber-200">{techConflict}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Status & Partner Flags */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                            <label className="text-xs uppercase text-slate-500 block mb-2 font-bold">Status</label>
                            <div className="flex gap-2">
                                {['Vorschlag', 'Akzeptiert', 'Fixiert'].map(status => (
                                    <button key={status} onClick={() => setEditingSession({...editingSession, status})}
                                        className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${editingSession.status === status 
                                            ? (status === 'Fixiert' ? 'bg-emerald-600 border-emerald-500 text-white' : status === 'Akzeptiert' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-amber-600 border-amber-500 text-white')
                                            : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'}`}
                                    >
                                        {status === 'Fixiert' && <Lock size={10} className="inline mr-1"/>}
                                        {status}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <div 
                            onClick={() => setEditingSession({...editingSession, isPartner: !editingSession.isPartner})}
                            className={`p-4 rounded border flex items-center gap-3 cursor-pointer transition-colors ${editingSession.isPartner ? 'bg-emerald-900/30 border-emerald-500' : 'bg-slate-900/50 border-slate-700 hover:bg-slate-800'}`}
                        >
                            <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${editingSession.isPartner ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-slate-500 text-transparent'}`}>
                                <CheckSquare size={16} className={editingSession.isPartner ? '' : 'hidden'}/>
                            </div>
                            <div>
                                <span className={`block font-bold text-sm ${editingSession.isPartner ? 'text-emerald-400' : 'text-white'}`}>Partner Content</span>
                                <span className="text-xs text-slate-400">Markierung als "P"</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                             <label className="text-xs uppercase text-slate-500 block mb-1">Titel</label>
                             <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-bold"
                                value={editingSession.title} onChange={e=>setEditingSession({...editingSession, title: e.target.value})}/>
                        </div>
                         <div>
                             <label className="text-xs uppercase text-slate-500 block mb-1">Format</label>
                             <select className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                                value={editingSession.type} onChange={e=>setEditingSession({...editingSession, type: e.target.value})}>
                                <option value="Talk">Talk</option>
                                <option value="Panel">Panel</option>
                                <option value="Workshop">Workshop</option>
                                <option value="Partner">Partner Slot</option>
                                <option value="SOS">SOS / Puffer</option>
                                <option value="Idee">Team Idee</option>
                             </select>
                        </div>
                        <div>
                             <label className="text-xs uppercase text-slate-500 block mb-1">Dauer (Min)</label>
                             <div className="flex items-center gap-2">
                                <input type="number" className="w-20 bg-slate-900 border border-slate-700 rounded p-2 text-white"
                                    value={editingSession.duration} onChange={e=>setEditingSession({...editingSession, duration: Number(e.target.value)})}/>
                                <div className="flex gap-1 flex-wrap">
                                    {[30, 45, 60, 90].map(m => (
                                        <button key={m} onClick={()=>setEditingSession({...editingSession, duration: m})}
                                            className="px-2 py-1 text-xs rounded border border-slate-600 text-slate-400 hover:text-white">{m}</button>
                                    ))}
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* NEW FIELDS */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs uppercase text-slate-500 block mb-1 flex items-center gap-1"><Globe size={12}/> Sprache</label>
                            <select className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                                value={editingSession.language || 'Deutsch'} onChange={e=>setEditingSession({...editingSession, language: e.target.value})}>
                                <option value="Deutsch">Deutsch</option>
                                <option value="Englisch">Englisch</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs uppercase text-slate-500 block mb-1 flex items-center gap-1"><StickyNote size={12}/> Programm Notizen (Öffentlich)</label>
                            <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                                placeholder="Sichtbar beim Hover..."
                                value={editingSession.notes || ''} 
                                onChange={e=>setEditingSession({...editingSession, notes: e.target.value.replace(/,/g, ' ')})}
                            />
                            <div className="text-[9px] text-slate-500 text-right mt-0.5">Keine Kommas erlaubt</div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs uppercase text-slate-500 block mb-1 flex items-center gap-1"><Wrench size={12}/> Stage Dispo / Tech Info</label>
                        <textarea className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs h-16"
                            placeholder="Interne Infos für Produktion..."
                            value={editingSession.productionInfo || ''} 
                            onChange={e=>setEditingSession({...editingSession, productionInfo: e.target.value.replace(/,/g, ' ')})}
                        />
                        <div className="text-[9px] text-slate-500 text-right mt-0.5">Keine Kommas erlaubt</div>
                    </div>

                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                        <label className="text-xs uppercase text-slate-500 flex justify-between items-end mb-2">
                            <span>Sprecher:innen ({editingSession.speakers?.length || 0})</span>
                        </label>
                        
                        {/* SEARCH BAR */}
                        <div className="relative mb-2">
                             <input 
                                type="text" 
                                placeholder="Suchen..." 
                                className="w-full bg-slate-800 border border-slate-600 rounded p-1.5 pl-8 text-sm text-white focus:border-indigo-500 outline-none"
                                value={speakerSearch}
                                onChange={(e) => setSpeakerSearch(e.target.value)}
                             />
                             <Search size={14} className="absolute left-2.5 top-2 text-slate-400"/>
                        </div>

                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto mb-4 border border-slate-800 p-2 rounded">
                            {filteredSpeakers.map(person => (
                                <button key={person.name} onClick={()=>toggleSpeaker(person.name)}
                                    className={`px-2 py-1 text-xs rounded-full border transition-all ${editingSession.speakers?.includes(person.name) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'}`}
                                >
                                    {editingSession.speakers?.includes(person.name) ? '✓ ' : '+ '}{person.name}
                                </button>
                            ))}
                            {filteredSpeakers.length === 0 && (
                                <div className="w-full text-center text-slate-500 text-xs py-2 italic">Keine Ergebnisse</div>
                            )}
                        </div>
                        
                        <label className="text-xs uppercase text-slate-500 block mb-2">Moderation</label>
                        <select className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                             value={editingSession.moderator} onChange={e=>setEditingSession({...editingSession, moderator: e.target.value})}
                        >
                            <option value="">-- Keine Auswahl --</option>
                            {moderatorsDB.map(mod => <option key={mod.name} value={mod.name}>{mod.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-700 flex justify-between bg-slate-800">
                    {editingSession.id ? (
                        <button onClick={() => { setSessions(sessions.filter(s => s.id !== editingSession.id)); setIsModalOpen(false); }} className="text-red-400 hover:text-red-300 flex items-center gap-1"><Trash2 size={16}/> Löschen</button>
                    ) : <div></div>}
                    <button onClick={saveSession} disabled={!!conflictData} className={`px-6 py-2 rounded font-bold flex items-center gap-2 ${conflictData ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
                        <Save size={16}/> Speichern
                    </button>
                </div>
            </div>
        </div>
    );
  };

  // --- Setup View ---
  if (view === 'setup') {
     return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
            <div className="max-w-xl w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
                <h1 className="text-2xl font-bold mb-6 text-indigo-400">Kosmos 2026: Setup</h1>
                <div className="space-y-6 mb-8">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Zeitraum (Kernzeit)</label>
                        <div className="flex gap-2 items-center">
                            <input type="number" min="8" max="14" value={config.startTime} onChange={e=>setConfig({...config, startTime: Number(e.target.value)})} className="w-16 bg-slate-900 border border-slate-600 rounded p-2 text-center"/>
                            <span>-</span>
                            <input type="number" min="16" max="24" value={config.endTime} onChange={e=>setConfig({...config, endTime: Number(e.target.value)})} className="w-16 bg-slate-900 border border-slate-600 rounded p-2 text-center"/>
                            <span className="text-xs text-slate-500 ml-2">(+1h Puffer wird autom. hinzugefügt)</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Bühnen</label>
                        <div className="flex gap-4 text-sm">
                            <label className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700">
                                Main: <input type="number" className="w-10 bg-transparent text-center font-bold outline-none" value={config.numMainStages} onChange={e=>setConfig({...config, numMainStages: Number(e.target.value)})}/>
                            </label>
                            <label className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700">
                                WS: <input type="number" className="w-10 bg-transparent text-center font-bold outline-none" value={config.numWorkshops} onChange={e=>setConfig({...config, numWorkshops: Number(e.target.value)})}/>
                            </label>
                        </div>
                    </div>
                </div>
                <button onClick={generateInitialSchedule} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg font-bold hover:brightness-110 transition-all">Planung Starten</button>
            </div>
        </div>
     );
  }

  // --- Main Schedule View ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col h-screen overflow-hidden font-sans">
      {renderNotification()}
      
      {/* HEADER */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
         <div className="flex items-center gap-4">
            <h1 className="font-bold text-lg tracking-tight">KOSMOS 26 <span className="text-indigo-500 font-normal">Planer</span></h1>
            <div className="h-6 w-px bg-slate-700"></div>
            <div className="text-xs text-slate-400 flex gap-4">
                <span className="flex items-center gap-1"><Users size={12}/> {analytics.totalSpeakers} Pers.</span>
                <span className="flex items-center gap-1"><PieChart size={12}/> {analytics.femalePct}% FLINTA*</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <button onClick={() => setIsSettingsOpen(true)} className="text-slate-400 hover:text-white p-2"><Settings size={18} /></button>
            
            <div className="flex bg-slate-800 rounded border border-slate-700">
                <button onClick={() => setIsImportModalOpen(true)} className="px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center gap-2 border-r border-slate-700 transition-colors">
                    <Upload size={16}/> <span className="text-sm font-semibold hidden sm:inline">Import</span>
                </button>
                <button onClick={() => setIsExportModalOpen(true)} className="px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center gap-2 transition-colors">
                    <Download size={16}/> <span className="text-sm font-semibold hidden sm:inline">Export CSV</span>
                </button>
            </div>

            <button onClick={openNewSessionModal} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-sm font-semibold flex items-center gap-1 ml-2"><Plus size={16}/> Session</button>
         </div>
      </div>

      {/* STAGING AREA */}
      <div className="bg-slate-900/50 border-b border-slate-800 p-2 shrink-0 h-28 overflow-hidden">
         <div className="flex gap-2 overflow-x-auto h-full items-center pb-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleInboxDrop(e)}
         >
            <div className="flex flex-col items-center justify-center w-12 shrink-0 h-full text-slate-500 border border-dashed border-slate-700 rounded bg-slate-900/30">
                <CornerLeftUp size={16} className="mb-1"/>
                <div className="text-[10px] font-bold text-center leading-tight">INBOX<br/>Drop<br/>here</div>
            </div>
            
            {sessions.filter(s => s.startTime === null).map(session => (
                <div key={session.id} draggable onDragStart={(e) => handleDragStart(e, session)} onClick={() => openEditModal(session)}
                    className={`shrink-0 w-48 h-20 p-2 rounded shadow-sm relative cursor-move select-none ${getSessionStyle(session).split(' ')[0]} border border-slate-600`}
                >
                    <div className="font-bold text-xs truncate pr-6">{session.title}</div>
                    <div className="absolute bottom-2 left-2 text-[10px] opacity-80">{session.type}</div>
                    <div className="absolute top-2 right-2 text-[10px] font-mono opacity-50">#{session.id}</div>
                </div>
            ))}
         </div>
      </div>

      {/* MAIN GRID */}
      <div className="flex-grow overflow-auto relative bg-slate-900 scroll-smooth" id="schedule-grid">
         <div className="min-w-max relative pb-10">
            {/* Headers */}
            <div className="flex sticky top-0 z-30 border-b border-slate-800 bg-slate-900 h-10">
                <div className="w-16 shrink-0 sticky left-0 z-40 bg-slate-900 border-r border-slate-800"></div>
                {stages.map(stage => (
                     <div 
                        key={stage.id} 
                        className="w-56 shrink-0 px-2 py-2 text-sm font-bold text-center border-r border-slate-800 text-slate-300 group relative cursor-pointer hover:bg-slate-800 transition-colors"
                        onClick={() => openStageModal(stage)}
                      >
                        {stage.name}
                        <div className="text-[10px] text-slate-500 font-normal">{stage.capacity} Plätze</div>
                        <Edit2 size={12} className="absolute right-2 top-3 opacity-0 group-hover:opacity-50 text-indigo-400"/>
                      </div>
                 ))}
            </div>
            
            <div className="flex relative">
                {/* Timeline */}
                <div className="w-16 shrink-0 sticky left-0 z-20 bg-slate-900 border-r border-slate-800 relative">
                     <div className="relative" style={{ height: slotsCount * PIXELS_PER_SLOT }}>
                        {Array.from({ length: Math.ceil(totalDuration/60) }).map((_, i) => (
                            <div key={i} className="absolute w-full text-right pr-2 text-xs text-slate-500 font-mono -mt-2"
                                style={{ top: (i * 60 / TIME_SLOT_MINUTES) * PIXELS_PER_SLOT }}>
                                {minutesToTime(displayStartMinutes + (i*60))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Grid Content */}
                <div className="relative flex" style={{ height: slotsCount * PIXELS_PER_SLOT }}>
                    {/* Grid Lines */}
                    <div className="absolute inset-0 grid grid-cols-1 pointer-events-none z-0">
                         {Array.from({ length: slotsCount }).map((_, i) => (
                            <div key={i} className={`border-b border-slate-800/40 w-full ${i % 4 === 0 ? 'border-slate-700/60' : ''}`} style={{ height: PIXELS_PER_SLOT }}></div>
                         ))}
                    </div>

                    {/* Start/End Bars */}
                    <div className="absolute w-full border-b-4 border-indigo-500/50 z-0 pointer-events-none flex items-end justify-center"
                         style={{ top: ((config.startTime * 60 - displayStartMinutes) / TIME_SLOT_MINUTES) * PIXELS_PER_SLOT }}>
                         <span className="bg-slate-900 text-indigo-400 text-xs px-2 -mb-2.5">PROGRAMM START ({config.startTime}:00)</span>
                    </div>
                    <div className="absolute w-full border-b-4 border-indigo-500/50 z-0 pointer-events-none flex items-end justify-center"
                         style={{ top: ((config.endTime * 60 - displayStartMinutes) / TIME_SLOT_MINUTES) * PIXELS_PER_SLOT }}>
                         <span className="bg-slate-900 text-indigo-400 text-xs px-2 -mb-2.5">PROGRAMM ENDE ({config.endTime}:00)</span>
                    </div>

                    {/* Breaks */}
                    {config.breaks.map(brk => (
                        <div key={brk.id} className="absolute w-full bg-red-900/20 border-y border-red-500/30 z-0 pattern-diagonal-lines pointer-events-none flex items-center justify-center"
                             style={{
                                 top: ((brk.start - displayStartMinutes) / TIME_SLOT_MINUTES) * PIXELS_PER_SLOT,
                                 height: (brk.duration / TIME_SLOT_MINUTES) * PIXELS_PER_SLOT
                             }}>
                             <span className="text-red-400 font-bold uppercase tracking-widest px-4">PAUSE</span>
                        </div>
                    ))}

                    {/* Stages Columns */}
                    {stages.map(stage => (
                         <div key={stage.id} className="w-56 shrink-0 border-r border-slate-800/50 relative h-full z-10"
                            onDragOver={handleDragOver}
                            onDrop={(e) => {
                                const y = e.nativeEvent.offsetY;
                                const slotIndex = Math.floor(y / PIXELS_PER_SLOT);
                                const newTime = displayStartMinutes + (slotIndex * TIME_SLOT_MINUTES);
                                handleDrop(e, stage.id, newTime);
                            }}
                         >
                            {sessions.filter(s => s.stageId === stage.id).map(session => {
                                const top = ((session.startTime - displayStartMinutes) / TIME_SLOT_MINUTES) * PIXELS_PER_SLOT;
                                const height = (session.duration / TIME_SLOT_MINUTES) * PIXELS_PER_SLOT;
                                const isFixed = session.status === 'Fixiert';
                                const conflict = checkPersonConflicts(session);
                                const techConflict = checkStageConstraints(session, stage.id);
                                
                                return (
                                    <div key={session.id} draggable={!isFixed} onDragStart={(e) => handleDragStart(e, session)} onClick={() => openEditModal(session)}
                                          className={`absolute inset-x-1 rounded p-2 text-white group overflow-visible ${getSessionStyle(session)} ${isFixed ? '' : 'cursor-move hover:ring-2 ring-white'}`}
                                          style={{ top, height: Math.max(height - 2, 24) }}
                                    >
                                        <div className="w-full h-full overflow-hidden">
                                            <div className="flex justify-between items-start gap-1">
                                                <div className="font-bold text-xs leading-tight mb-1 truncate">{session.title}</div>
                                                <div className="flex gap-1">
                                                    {/* Warning Indicators */}
                                                    {(conflict || techConflict) && (
                                                        <div className="text-red-200 bg-red-900/80 rounded-full p-0.5 animate-pulse border border-red-500" title="Konflikt!">
                                                            {techConflict ? <MicOff size={10}/> : <AlertTriangle size={10} fill="currentColor"/>}
                                                        </div>
                                                    )}
                                                    
                                                    {/* Fix/Unlock Button */}
                                                    <button onClick={(e) => { e.stopPropagation(); setSessions(sessions.map(s => s.id === session.id ? {...s, status: s.status === 'Fixiert' ? 'Akzeptiert' : 'Fixiert'} : s)) }}
                                                        className={`p-0.5 rounded shrink-0 transition-colors ${isFixed ? 'text-emerald-200' : 'text-white/40 hover:text-white'}`}>
                                                        {isFixed ? <Lock size={10} fill="currentColor"/> : <Unlock size={10}/>}
                                                    </button>
                                                </div>
                                            </div>

                                            {session.isPartner && (
                                                <div className="absolute bottom-1 right-1 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm z-20">P</div>
                                            )}

                                            {height > 35 && (
                                                <>
                                                <div className="text-[10px] opacity-80 flex items-center justify-between font-mono mt-0.5">
                                                    <span>#{session.id}</span>
                                                    <span className="opacity-60">{session.type}</span>
                                                </div>
                                                <div className="text-[10px] opacity-90 leading-tight mt-1 overflow-hidden">
                                                    {session.speakers && session.speakers.length > 0 ? (
                                                        <div className="font-semibold text-white/90">{session.speakers.join(", ")}</div>
                                                    ) : <span className="opacity-50">TBA</span>}
                                                    {session.moderator && (
                                                        <div className="italic text-indigo-200 mt-0.5">Mod: {session.moderator}</div>
                                                    )}
                                                </div>
                                                </>
                                            )}
                                        </div>

                                        {/* HOVER TOOLTIP FOR NOTES */}
                                        {session.notes && (
                                            <div className="hidden group-hover:block absolute z-50 left-0 top-full mt-1 bg-slate-800 border border-slate-600 p-2 rounded shadow-xl w-48 text-[10px] pointer-events-none text-white">
                                                <div className="font-bold text-slate-400 mb-1 flex items-center gap-1"><StickyNote size={10}/> Notizen:</div>
                                                {session.notes}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                         </div>
                     ))}
                </div>
            </div>
         </div>
      </div>

      {/* FOOTER ANALYTICS */}
      <div className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 grid grid-cols-4 gap-4 text-xs text-slate-400">
         <div className="bg-slate-800 p-3 rounded">
             <div className="font-bold text-slate-300 mb-1">Speaker Diversity</div>
             <div className="flex justify-between">
                 <span>Weiblich: <span className="text-white">{analytics.female}</span></span>
                 <span>Männlich: <span className="text-white">{analytics.male}</span></span>
             </div>
             <div className="w-full bg-slate-700 h-1 mt-2 rounded-full overflow-hidden">
                 <div className="bg-purple-500 h-full" style={{width: `${analytics.femalePct}%`}}></div>
             </div>
         </div>
         <div className="bg-slate-800 p-3 rounded">
             <div className="font-bold text-slate-300 mb-1">Formate</div>
             <div className="grid grid-cols-2 gap-x-2">
                 <span>Talks: {analytics.counts.Talk}</span>
                 <span>Panels: {analytics.counts.Panel}</span>
                 <span>Workshops: {analytics.counts.Workshop}</span>
             </div>
         </div>
         <div className="bg-slate-800 p-3 rounded">
             <div className="font-bold text-slate-300 mb-1">Content Mix</div>
             <div className="flex justify-between items-center mb-1">
                 <span>Partner Content:</span>
                 <span className="text-emerald-400 font-bold text-lg">{analytics.partnerCount}</span>
             </div>
             <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                 <div className="bg-emerald-500 h-full" style={{width: `${analytics.partnerPct}%`}}></div>
             </div>
             <div className="text-right mt-1 text-[10px]">{analytics.partnerPct}% Anteil</div>
         </div>
         <div className="bg-slate-800 p-3 rounded flex items-center justify-center text-center italic">
             Kosmos 2026<br/>Planning Tool v2.1
         </div>
      </div>
      
      {renderImportModal()}
      {renderExportModal()}
      {renderEditModal()}
      {renderStageModal()}
      
      {/* Settings Modal (Simplified) */}
      {isSettingsOpen && (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl p-6 w-96 shadow-xl border border-slate-600">
                <h3 className="font-bold mb-4">Einstellungen</h3>
                <label className="block text-sm mb-2 text-slate-400">Puffer (Min)</label>
                <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white mb-4" value={config.minBuffer} onChange={e=>setConfig({...config, minBuffer: Number(e.target.value)})}/>
                <label className="block text-sm mb-2 text-slate-400">Pausen Management</label>
                <button onClick={()=>{
                    setConfig({...config, breaks: [...config.breaks, {id: generateId(), start: config.startTime*60+120, duration: 30}]})
                }} className="w-full bg-slate-700 hover:bg-slate-600 p-2 rounded text-sm mb-4">+ Pause hinzufügen</button>
                <div className="space-y-2 max-h-32 overflow-y-auto mb-4">
                    {config.breaks.map(b => (
                        <div key={b.id} className="flex gap-2 items-center">
                            <select 
                                className="bg-slate-900 flex-1 p-1 rounded text-xs border border-slate-600 text-white"
                                value={b.start} 
                                onChange={e=>setConfig({...config, breaks: config.breaks.map(x=>x.id===b.id?{...x, start: Number(e.target.value)}:x)})}
                            >
                                {Array.from({length: (displayEndMinutes - displayStartMinutes) / 15}).map((_, i) => {
                                    const time = displayStartMinutes + (i*15);
                                    return <option key={time} value={time}>{minutesToTime(time)}</option>
                                })}
                            </select>
                            <select className="bg-slate-900 w-16 p-1 rounded text-xs border border-slate-600 text-white" value={b.duration} onChange={e=>setConfig({...config, breaks: config.breaks.map(x=>x.id===b.id?{...x, duration: Number(e.target.value)}:x)})}>
                                <option value={15}>15m</option>
                                <option value={30}>30m</option>
                                <option value={45}>45m</option>
                                <option value={60}>60m</option>
                                <option value={90}>90m</option>
                            </select>
                            <button onClick={()=>setConfig({...config, breaks: config.breaks.filter(x=>x.id!==b.id)})} className="text-red-400 hover:text-red-300"><Trash2 size={14}/></button>
                        </div>
                    ))}
                </div>
                <button onClick={()=>setIsSettingsOpen(false)} className="w-full bg-indigo-600 hover:bg-indigo-500 p-2 rounded font-bold transition-colors">Schließen</button>
            </div>
         </div>
      )}
    </div>
  );
};

export default App;
