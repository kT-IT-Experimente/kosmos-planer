import React, { useState, useEffect, useMemo } from 'react';
import { Send, AlertCircle, CheckCircle2, Loader2, UserPlus, Search, X } from 'lucide-react';

/**
 * SessionSubmission - Form for submitting new sessions via n8n webhook.
 * Loads speakers from the Speaker_DB and allows selection.
 */
const SessionSubmission = ({ n8nBaseUrl, accessToken, metadata = {}, submitterEmail = '', onSuccess, onRegisterSpeaker }) => {
    const [form, setForm] = useState({
        titel: '',
        kurzbeschreibung: '',
        beschreibung: '',
        format: '',
        thema: '',
        bereich: '',
        sprache: 'DE',
        dauer: 60,
        speakerIds: []
    });
    const [speakers, setSpeakers] = useState([]);
    const [speakerSearch, setSpeakerSearch] = useState('');
    const [showSpeakerPicker, setShowSpeakerPicker] = useState(false);
    const [loadingSpeakers, setLoadingSpeakers] = useState(false);
    const [status, setStatus] = useState({ loading: false, error: null, success: null });

    // Load speakers from n8n
    useEffect(() => {
        if (!n8nBaseUrl) return;
        loadSpeakers();
    }, [n8nBaseUrl]);

    const loadSpeakers = async () => {
        if (!n8nBaseUrl) return;
        setLoadingSpeakers(true);
        try {
            const headers = {};
            if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
            const res = await fetch(`${n8nBaseUrl}/speakers?role=CURATOR`, { headers });
            if (!res.ok) throw new Error(`Speaker-API Fehler: ${res.status}`);
            const data = await res.json();
            setSpeakers(data.speakers || []);
        } catch (err) {
            console.error('[SessionSubmission] Failed to load speakers:', err);
        }
        setLoadingSpeakers(false);
    };

    const filteredSpeakers = useMemo(() => {
        if (!speakerSearch.trim()) return speakers;
        const q = speakerSearch.toLowerCase();
        return speakers.filter(s =>
            `${s.Vorname} ${s.Nachname}`.toLowerCase().includes(q) ||
            (s.Organisation || '').toLowerCase().includes(q) ||
            (s.ID || '').toLowerCase().includes(q)
        );
    }, [speakers, speakerSearch]);

    const selectedSpeakers = useMemo(() => {
        return form.speakerIds.map(id => speakers.find(s => s.ID === id)).filter(Boolean);
    }, [form.speakerIds, speakers]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const addSpeaker = (speaker) => {
        if (!form.speakerIds.includes(speaker.ID)) {
            handleChange('speakerIds', [...form.speakerIds, speaker.ID]);
        }
        setSpeakerSearch('');
        setShowSpeakerPicker(false);
    };

    const removeSpeaker = (id) => {
        handleChange('speakerIds', form.speakerIds.filter(sid => sid !== id));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!n8nBaseUrl) {
            setStatus({ loading: false, error: 'n8n Webhook-URL nicht konfiguriert.', success: null });
            return;
        }
        if (!form.titel) {
            setStatus({ loading: false, error: 'Session-Titel ist ein Pflichtfeld.', success: null });
            return;
        }
        if (!submitterEmail) {
            setStatus({ loading: false, error: 'Bitte zuerst einloggen.', success: null });
            return;
        }

        setStatus({ loading: true, error: null, success: null });

        try {
            const res = await fetch(`${n8nBaseUrl}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({
                    ...form,
                    submitterEmail,
                    submitterVorname: '',
                    submitterNachname: ''
                })
            });

            if (!res.ok) throw new Error(`Server-Fehler: ${res.status}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setStatus({
                loading: false,
                error: null,
                success: `Session eingereicht! ID: ${data.sessionId}${data.hasDummies ? ' ⚠️ Dummy-Speaker vorhanden — bitte später vervollständigen.' : ''}`
            });

            // Reset
            setForm({
                titel: '', kurzbeschreibung: '', beschreibung: '', format: '',
                thema: '', bereich: '', sprache: 'DE', dauer: 60, speakerIds: []
            });

            if (onSuccess) onSuccess(data);
        } catch (err) {
            setStatus({ loading: false, error: err.message, success: null });
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <Send className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-bold text-slate-800">Session einreichen</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Title */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                        Session-Titel <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={form.titel}
                        onChange={e => handleChange('titel', e.target.value)}
                        placeholder="z.B. KI und die Zukunft der Arbeit"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        required
                    />
                </div>

                {/* Kurzbeschreibung */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                        Kurzbeschreibung (max. 200 Zeichen)
                    </label>
                    <input
                        type="text"
                        value={form.kurzbeschreibung}
                        onChange={e => handleChange('kurzbeschreibung', e.target.value)}
                        placeholder="Kurzer Teaser-Text..."
                        maxLength={200}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400">{form.kurzbeschreibung.length}/200</span>
                </div>

                {/* Beschreibung */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Ausführliche Beschreibung</label>
                    <textarea
                        value={form.beschreibung}
                        onChange={e => handleChange('beschreibung', e.target.value)}
                        placeholder="Beschreibe die Session im Detail..."
                        rows={4}
                        maxLength={1000}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    />
                    <span className="text-xs text-slate-400">{form.beschreibung.length}/1000</span>
                </div>

                {/* Row: Format + Dauer */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Format</label>
                        <select
                            value={form.format}
                            onChange={e => handleChange('format', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="">— wählen —</option>
                            {(metadata.formate || ['Talk', 'Panel', 'Workshop', 'Lesung']).map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Dauer (Minuten)</label>
                        <select
                            value={form.dauer}
                            onChange={e => handleChange('dauer', parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>60 min</option>
                            <option value={90}>90 min</option>
                        </select>
                    </div>
                </div>

                {/* Row: Thema + Bereich */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Thema</label>
                        <select
                            value={form.thema}
                            onChange={e => handleChange('thema', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="">— wählen —</option>
                            {(metadata.themen || []).map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Bereich</label>
                        <select
                            value={form.bereich}
                            onChange={e => handleChange('bereich', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="">— wählen —</option>
                            {(metadata.bereiche || []).map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Sprache */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Sprache</label>
                    <div className="flex gap-4">
                        {['DE', 'EN', 'Bilingual'].map(lang => (
                            <label key={lang} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="radio"
                                    name="sprache"
                                    value={lang}
                                    checked={form.sprache === lang}
                                    onChange={e => handleChange('sprache', e.target.value)}
                                    className="text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-700">{lang}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Speaker Selection */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Speaker*innen</label>

                    {/* Selected speakers */}
                    {selectedSpeakers.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {selectedSpeakers.map(s => (
                                <span
                                    key={s.ID}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${s.Status === 'dummy'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                        : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                        }`}
                                >
                                    {s.Vorname} {s.Nachname}
                                    {s.Status === 'dummy' && ' (Dummy)'}
                                    <button type="button" onClick={() => removeSpeaker(s.ID)} className="ml-1 hover:text-red-600">
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Speaker search */}
                    <div className="relative">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                <input
                                    type="text"
                                    value={speakerSearch}
                                    onChange={e => { setSpeakerSearch(e.target.value); setShowSpeakerPicker(true); }}
                                    onFocus={() => setShowSpeakerPicker(true)}
                                    placeholder={loadingSpeakers ? 'Lade Speaker...' : 'Speaker suchen...'}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                            {onRegisterSpeaker && (
                                <button
                                    type="button"
                                    onClick={onRegisterSpeaker}
                                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm flex items-center gap-1 text-slate-700 transition-colors"
                                >
                                    <UserPlus className="w-4 h-4" /> Neu
                                </button>
                            )}
                        </div>

                        {/* Dropdown */}
                        {showSpeakerPicker && filteredSpeakers.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {filteredSpeakers.map(s => (
                                    <button
                                        key={s.ID}
                                        type="button"
                                        onClick={() => addSpeaker(s)}
                                        disabled={form.speakerIds.includes(s.ID)}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center justify-between ${form.speakerIds.includes(s.ID) ? 'opacity-40' : ''
                                            }`}
                                    >
                                        <span>
                                            <strong>{s.Vorname} {s.Nachname}</strong>
                                            {s.Organisation && <span className="text-slate-400 ml-1">({s.Organisation})</span>}
                                            {s.Status === 'dummy' && <span className="text-amber-600 ml-1">[Dummy]</span>}
                                        </span>
                                        <span className="text-xs text-slate-400">{s.ID}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {showSpeakerPicker && filteredSpeakers.length === 0 && speakerSearch && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm text-slate-500">
                                Keine Speaker gefunden. {onRegisterSpeaker && (
                                    <button type="button" onClick={onRegisterSpeaker} className="text-indigo-600 underline ml-1">
                                        Neuen Speaker anlegen
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Status Messages */}
                {status.error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-800">{status.error}</span>
                    </div>
                )}
                {status.success && (
                    <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-green-800">{status.success}</span>
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={status.loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                    {status.loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Wird eingereicht...</>
                    ) : (
                        <><Send className="w-4 h-4" /> Session einreichen</>
                    )}
                </button>
            </form>

            {/* Click-outside handler for speaker picker */}
            {showSpeakerPicker && (
                <div className="fixed inset-0 z-40" onClick={() => setShowSpeakerPicker(false)} />
            )}
        </div>
    );
};

export default SessionSubmission;
