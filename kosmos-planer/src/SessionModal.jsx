import React, { useState, useEffect, useMemo } from 'react';
import { X, CheckCircle2, AlertTriangle, Trash2, Search } from 'lucide-react';
import { INBOX_ID, generateId, timeToMinutes } from './utils';

function SessionModal({ isOpen, onClose, onSave, onDelete, initialData, definedStages, speakersList, moderatorsList }) {
    // Initialize with INBOX as default for NEW sessions
    const [formData, setFormData] = useState({
        id: '', title: '', start: '10:00', duration: 60, stage: INBOX_ID,
        status: '5_Vorschlag', format: 'Vortrag', speakers: [], moderators: [], day: '20.09.',
        partner: 'FALSE', language: 'de', notes: '', stageDispo: ''
    });
    const [searchTermSp, setSearchTermSp] = useState('');
    const [searchTermMod, setSearchTermMod] = useState('');

    useEffect(() => {
        if (initialData) {
            const duration = initialData.duration || (initialData.end && initialData.start !== '-' ? timeToMinutes(initialData.end) - timeToMinutes(initialData.start) : 60);
            setFormData({
                ...initialData,
                duration: duration > 0 ? duration : 60,
                speakers: Array.isArray(initialData.speakers) ? initialData.speakers : (initialData.speakers ? initialData.speakers.split(',').map(s => s.trim()).filter(Boolean) : []),
                moderators: Array.isArray(initialData.moderators) ? initialData.moderators : (initialData.moderators ? initialData.moderators.split(',').map(s => s.trim()).filter(Boolean) : [])
            });
        } else {
            // DEFAULT FOR NEW: INBOX
            setFormData({
                id: generateId(), title: '', start: '10:00', duration: 60, stage: INBOX_ID,
                status: '5_Vorschlag', format: 'Vortrag', speakers: [], moderators: [], day: '20.09.',
                partner: 'FALSE', language: 'de', notes: '', stageDispo: ''
            });
        }
        setSearchTermSp('');
        setSearchTermMod('');
    }, [initialData, definedStages, isOpen]);

    const toggleListSelection = (field, name) => {
        if (field === 'speakers') {
            setFormData(prev => {
                const exists = prev.speakers.includes(name);
                return { ...prev, speakers: exists ? prev.speakers.filter(s => s !== name) : [...prev.speakers, name] };
            });
        } else if (field === 'moderators') {
            setFormData(prev => {
                const exists = prev.moderators.includes(name);
                return { ...prev, moderators: exists ? prev.moderators.filter(s => s !== name) : [...prev.moderators, name] };
            });
        }
    };

    const micWarning = useMemo(() => {
        if (formData.stage === INBOX_ID) return null;
        const stage = definedStages.find(s => s.id === formData.stage); // MATCH BY ID
        if (!stage || !stage.maxMics) return null;
        if (formData.speakers.length > stage.maxMics) {
            return `⚠️ Zu viele Sprecher: ${formData.speakers.length} (Max: ${stage.maxMics})`;
        }
        return null;
    }, [formData.stage, formData.speakers, definedStages]);

    const inputStd = "w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all placeholder:text-slate-300";
    const labelStd = "block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wide";

    const filteredSpeakers = speakersList.filter(s => s.fullName.toLowerCase().includes(searchTermSp.toLowerCase()));
    const filteredMods = moderatorsList.filter(m => m.fullName.toLowerCase().includes(searchTermMod.toLowerCase()));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                    <h3 className="font-bold text-lg text-slate-800">{initialData ? 'Session bearbeiten' : 'Neue Session erstellen'}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Basis Informationen</h4>
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-8">
                                <label className={labelStd}>Titel</label>
                                <input type="text" className={`${inputStd} font-bold text-lg`} value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                            </div>
                            <div className="col-span-4">
                                <label className={labelStd}>Status</label>
                                <select className={inputStd} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
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
                                <select className={inputStd} value={formData.format} onChange={e => setFormData({ ...formData, format: e.target.value })}>
                                    <option value="Vortrag">Vortrag</option>
                                    <option value="Panel">Panel</option>
                                    <option value="Workshop">Workshop</option>
                                </select>
                            </div>
                            <div><label className={labelStd}>Sprache</label><select className={inputStd} value={formData.language} onChange={e => setFormData({ ...formData, language: e.target.value })}><option value="de">DE</option><option value="en">EN</option></select></div>
                            <div className="flex flex-col justify-end pb-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-50 p-2 rounded border border-slate-200 hover:border-blue-300 transition-colors">
                                    <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.partner === 'TRUE' ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${formData.partner === 'TRUE' ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                    <input type="checkbox" className="hidden" checked={formData.partner === 'TRUE'} onChange={e => setFormData({ ...formData, partner: e.target.checked ? 'TRUE' : 'FALSE' })} />
                                    <span className="text-sm font-medium text-slate-700">Ist Partner-Session</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4 bg-slate-50 p-4 rounded border">
                        <div className="grid grid-cols-4 gap-4">
                            <div className="col-span-2"><label className={labelStd}>Bühne</label><select className={inputStd} value={formData.stage} onChange={e => setFormData({ ...formData, stage: e.target.value })}>
                                <option value={INBOX_ID}>📥 Inbox (Parkplatz)</option>
                                {/* Using ID for value, Name for display */}
                                {definedStages.map(s => <option key={s.id} value={s.id}>{s.name} ({s.maxMics} Mics)</option>)}
                            </select></div>
                            <div><label className={labelStd}>Start</label><input type="time" className={inputStd} value={formData.start} onChange={e => setFormData({ ...formData, start: e.target.value })} /></div>
                            <div><label className={labelStd}>Dauer (Min)</label><input type="number" className={inputStd} value={formData.duration} onChange={e => setFormData({ ...formData, duration: parseInt(e.target.value) })} /></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelStd}>Sprecher (Suche)</label>
                            <div className="relative mb-2">
                                <Search className="w-3 h-3 absolute left-2 top-2.5 text-slate-400" />
                                <input className="w-full pl-7 p-1.5 text-xs border rounded" placeholder="Filter..." value={searchTermSp} onChange={e => setSearchTermSp(e.target.value)} />
                            </div>
                            <div className="h-32 border rounded overflow-auto p-1 bg-white">
                                {filteredSpeakers.map(s => <div key={s.id} onClick={() => toggleListSelection('speakers', s.fullName)} className={`text-xs p-1.5 cursor-pointer rounded mb-0.5 flex items-center justify-between ${formData.speakers.includes(s.fullName) ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}><span>{s.fullName}</span>{formData.speakers.includes(s.fullName) && <CheckCircle2 className="w-3 h-3" />}</div>)}
                            </div>
                            {micWarning && <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {micWarning}</div>}
                        </div>
                        <div>
                            <label className={labelStd}>Moderation (Suche)</label>
                            <div className="relative mb-2">
                                <Search className="w-3 h-3 absolute left-2 top-2.5 text-slate-400" />
                                <input className="w-full pl-7 p-1.5 text-xs border rounded" placeholder="Filter..." value={searchTermMod} onChange={e => setSearchTermMod(e.target.value)} />
                            </div>
                            <div className="h-32 border rounded overflow-auto p-1 bg-white">
                                {filteredMods.map(m => <div key={m.id} onClick={() => toggleListSelection('moderators', m.fullName)} className={`text-xs p-1.5 cursor-pointer rounded mb-0.5 flex items-center justify-between ${formData.moderators.includes(m.fullName) ? 'bg-pink-100 text-pink-700 font-bold' : 'hover:bg-slate-50'}`}><span>{m.fullName}</span>{formData.moderators.includes(m.fullName) && <CheckCircle2 className="w-3 h-3" />}</div>)}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Notizen & Technik</h4>
                        <textarea className={`${inputStd} h-16 bg-yellow-50/50 border-yellow-200`} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Notizen..." />
                        <input className={`${inputStd} text-xs font-mono text-slate-500`} value={formData.stageDispo} readOnly placeholder="Stage Dispo (Automatisch)" />
                    </div>
                </div>
                <div className="p-4 border-t flex justify-between bg-slate-50 rounded-b-xl">
                    {initialData && <button onClick={() => { if (window.confirm('Wirklich löschen?')) onDelete(formData.id) }} className="text-red-500 text-sm flex items-center gap-1 hover:bg-red-50 px-3 py-1 rounded transition-colors"><Trash2 className="w-4 h-4" /> Löschen</button>}
                    <div className="flex gap-2 ml-auto">
                        <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-slate-100 transition-colors">Abbrechen</button>
                        <button onClick={() => onSave({ ...formData, speakers: formData.speakers.join(', '), moderators: formData.moderators.join(', ') }, micWarning)} className="px-6 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 shadow-sm font-medium transition-colors">Speichern</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionModal;
