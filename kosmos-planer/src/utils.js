// --- KONSTANTEN ---
export const SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
export const AUTH_STORAGE_KEY = 'kosmos_auth';
export const INBOX_ID = 'Inbox';
export const HEADER_HEIGHT = 64;
export const PIXELS_PER_MINUTE = 2.5;
export const SNAP_MINUTES = 5;

export const STATUS_COLORS = {
    'Vorschlag': 'border-yellow-400 bg-yellow-50',
    'Eingeladen': 'border-orange-400 bg-orange-50 border-dashed',
    'Akzeptiert': 'border-green-500 bg-green-50',
    'Abgelehnt': 'border-red-300 bg-red-50/30',
    'Fixiert': 'border-red-500 bg-slate-100 ring-1 ring-red-500'
};

export const FORMAT_COLORS = {
    'Talk': 'bg-blue-100 text-blue-900',
    'Vortrag': 'bg-blue-100 text-blue-900',
    'Panel': 'bg-purple-100 text-purple-900',
    'Workshop': 'bg-orange-100 text-orange-900',
    'Lightning Talk': 'bg-cyan-100 text-cyan-900',
    'Pause': 'bg-gray-200 text-gray-700',
    'Keynote': 'bg-pink-100 text-pink-900'
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
