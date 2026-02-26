// --- KONSTANTEN ---
export const SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
export const AUTH_STORAGE_KEY = 'kosmos_auth';
export const INBOX_ID = 'Inbox';
export const HEADER_HEIGHT = 64;
export const PIXELS_PER_MINUTE = 2.5;
export const SNAP_MINUTES = 5;

export const STATUS_COLORS = {
    'Vorschlag': 'border-yellow-500 bg-yellow-50 text-slate-900',
    'Eingeladen': 'border-indigo-400 bg-indigo-50 border-dashed text-slate-900',
    'Akzeptiert': 'border-green-500 bg-green-50 text-slate-900',
    'Abgelehnt': 'border-red-400 bg-red-50 text-slate-900',
    'Fixiert': 'border-red-500 bg-red-50 ring-1 ring-red-500 text-slate-900'
};

export const FORMAT_COLORS = {
    'Talk': 'bg-indigo-100 text-indigo-900',
    'Vortrag': 'bg-indigo-100 text-indigo-900',
    'Panel': 'bg-indigo-200 text-indigo-900',
    'Workshop': 'bg-indigo-50 text-indigo-800',
    'Lightning Talk': 'bg-slate-200 text-slate-800',
    'Pause': 'bg-slate-100 text-slate-600',
    'Keynote': 'bg-indigo-300 text-indigo-900'
};

// --- HELPER FUNCTIONS ---
export const generateId = () => Math.floor(10000 + Math.random() * 90000).toString();

export const safeString = (val) => (val === null || val === undefined) ? '' : String(val).trim();

// Remove commas for CSV safety
export const cleanForCSV = (text) => {
    if (!text) return '';
    return safeString(text).replace(/,/g, ' ').replace(/\n/g, ' ').replace(/"/g, '""');
};

export const timeToMinutes = (timeStr) => {
    const t = safeString(timeStr);
    if (!t || !t.includes(':')) return 0;
    const [hours, minutes] = t.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
};

export const minutesToTime = (totalMinutes) => {
    let h = Math.floor(totalMinutes / 60);
    let m = totalMinutes % 60;
    m = Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
    if (m === 60) { m = 0; h += 1; }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const calculateEndTime = (startStr, durationMin) => {
    const s = safeString(startStr);
    if (!s || s === '-') return '-';
    const startMin = timeToMinutes(s);
    return minutesToTime(startMin + parseInt(durationMin || 0));
};

export const checkOverlap = (startA, endA, startB, endB, buffer = 0) => {
    return (startA < endB + buffer) && (endA + buffer > startB);
};

export const getErrorMessage = (e) => {
    if (typeof e === 'string') return e;
    return e?.result?.error?.message || e?.error || e?.message || "Unbekannter Fehler beim Speichern";
};
