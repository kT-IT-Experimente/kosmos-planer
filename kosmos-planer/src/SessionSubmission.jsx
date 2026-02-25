import React, { useState, useMemo } from 'react';
import { Send, AlertCircle, CheckCircle2, Loader2, UserPlus, Search, X, Edit3, ChevronDown, ChevronUp, Clock, Globe } from 'lucide-react';

/**
 * SessionSubmission - Form for submitting new sessions + editing own submissions.
 * Uses fetchSheets (n8n proxy) for appending to Master_Einreichungen.
 * Speakers are selected from the passed-in speakers array.
 */
const SessionSubmission = ({
    speakers = [], stages = [], metadata = {}, submitterEmail = '', submitterName = '',
    mySubmissions = [], mySessions = [], fetchSheets, spreadsheetId, apiUrl, accessToken,
    maxSubmissions = 10, onSuccess, onRegisterSpeaker
}) => {
    const emptyForm = {
        titel: '', kurzbeschreibung: '', beschreibung: '', format: '',
        thema: '', bereich: '', sprache: 'DE', dauer: 60, notizen: '', selectedSpeakers: []
    };
    const [form, setForm] = useState(emptyForm);
    const [speakerSearch, setSpeakerSearch] = useState('');
    const [showSpeakerPicker, setShowSpeakerPicker] = useState(false);
    const [status, setStatus] = useState({ loading: false, error: null, success: null });
    const [editingSubmission, setEditingSubmission] = useState(null); // null = new, sub.id = editing
    const [showMySubmissions, setShowMySubmissions] = useState(true);

    const isEditing = editingSubmission !== null;
    const canSubmitNew = mySubmissions.length < maxSubmissions;

    const filteredSpeakers = useMemo(() => {
        if (!speakerSearch.trim()) return speakers;
        const q = speakerSearch.toLowerCase();
        return speakers.filter(s =>
            (s.fullName || '').toLowerCase().includes(q) ||
            (s.organisation || '').toLowerCase().includes(q) ||
            (s.id || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q)
        );
    }, [speakers, speakerSearch]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const addSpeaker = (speaker) => {
        if (!form.selectedSpeakers.find(s => s.id === speaker.id)) {
            handleChange('selectedSpeakers', [...form.selectedSpeakers, speaker]);
        }
        setSpeakerSearch('');
        setShowSpeakerPicker(false);
    };

    const removeSpeaker = (id) => {
        handleChange('selectedSpeakers', form.selectedSpeakers.filter(s => s.id !== id));
    };

    // Load submission into the main form for editing
    const startEditing = (sub) => {
        // Resolve speaker IDs to speaker objects
        const speakerIds = (sub.speakerIds || '').split(',').map(s => s.trim()).filter(Boolean);
        const resolvedSpeakers = speakerIds.map(id => speakers.find(s => s.id === id)).filter(Boolean);
        setForm({
            titel: sub.title || '',
            kurzbeschreibung: sub.shortDescription || '',
            beschreibung: sub.description || '',
            format: sub.format || '',
            thema: sub.thema || '',
            bereich: sub.bereich || '',
            sprache: sub.language || 'DE',
            dauer: parseInt(sub.duration) || 60,
            notizen: sub.notes || '',
            selectedSpeakers: resolvedSpeakers
        });
        setEditingSubmission(sub.id);
        setStatus({ loading: false, error: null, success: null });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEditing = () => {
        setForm(emptyForm);
        setEditingSubmission(null);
        setStatus({ loading: false, error: null, success: null });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!fetchSheets || !spreadsheetId || !apiUrl) {
            setStatus({ loading: false, error: 'Konfigurationsfehler: API nicht verfügbar.', success: null });
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
            const timestamp = new Date().toISOString();
            const speakerIds = form.selectedSpeakers.map(s => s.id).join(', ');
            const speakerNames = form.selectedSpeakers.map(s => s.fullName).join(', ');

            const row = [
                timestamp,           // A: Zeitstempel
                submitterEmail,      // B: Submitter_Email
                submitterName,       // C: Submitter_Name
                isEditing ? undefined : 'Vorschlag', // D: Status (keep existing for edits)
                form.titel,          // E: Session_Titel
                form.kurzbeschreibung, // F: Kurzbeschreibung
                form.beschreibung,   // G: Beschreibung
                form.format,         // H: Format
                form.thema,          // I: Thema
                form.bereich,        // J: Bereich
                form.sprache,        // K: Sprache
                String(form.dauer),  // L: Dauer
                speakerIds,          // M: Speaker_IDs
                speakerNames,        // N: Speaker_Names
                form.notizen         // O: Notizen
            ];

            if (isEditing) {
                // Find the submission being edited to get its actual sheet row
                const editSub = mySubmissions.find(s => s.id === editingSubmission);
                if (!editSub) throw new Error('Einreichung nicht gefunden');
                const rowNum = editSub.rowIndex; // sheet row number from parsed data
                // Update columns A (timestamp), E-O (data) — skip D (status)
                const { ok: ok1, error: err1 } = await fetchSheets({
                    action: 'update', spreadsheetId,
                    range: `'Master_Einreichungen'!A${rowNum}`,
                    values: [[timestamp]],
                }, accessToken, apiUrl);
                if (!ok1) throw new Error(err1);
                const { ok: ok2, error: err2 } = await fetchSheets({
                    action: 'update', spreadsheetId,
                    range: `'Master_Einreichungen'!E${rowNum}:O${rowNum}`,
                    values: [[form.titel, form.kurzbeschreibung, form.beschreibung, form.format, form.thema, form.bereich, form.sprache, String(form.dauer), speakerIds, speakerNames, form.notizen]],
                }, accessToken, apiUrl);
                if (!ok2) throw new Error(err2);
                setStatus({ loading: false, error: null, success: `Session "${form.titel}" aktualisiert!` });
            } else {
                // Append new row
                const { ok, error } = await fetchSheets({
                    action: 'append', spreadsheetId,
                    range: `'Master_Einreichungen'!A2:O`,
                    values: [row],
                }, accessToken, apiUrl);
                if (!ok) throw new Error(error || 'Fehler beim Speichern');
                setStatus({ loading: false, error: null, success: `Session "${form.titel}" erfolgreich eingereicht!` });
            }

            setForm(emptyForm);
            setEditingSubmission(null);
            if (onSuccess) onSuccess();
        } catch (err) {
            setStatus({ loading: false, error: err.message, success: null });
        }
    };

    const isDummy = (speaker) => (speaker.status || '').toLowerCase().includes('dummy');

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Submit / Edit Form */}
            <div className={`bg-white rounded-xl shadow-sm border ${isEditing ? 'border-amber-300' : 'border-slate-200'} p-6`}>
                <div className="flex items-center gap-3 mb-6">
                    {isEditing ? <Edit3 className="w-6 h-6 text-amber-600" /> : <Send className="w-6 h-6 text-indigo-600" />}
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-slate-800">
                            {isEditing ? 'Session bearbeiten' : 'Session einreichen'}
                        </h2>
                        <p className="text-xs text-slate-400">
                            {isEditing
                                ? `Bearbeitung von "${form.titel}"`
                                : `Eingereicht von: ${submitterName || submitterEmail}`}
                        </p>
                    </div>
                    {isEditing && (
                        <button onClick={cancelEditing}
                            className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-medium">
                            Abbrechen
                        </button>
                    )}
                </div>

                {/* Show limit info for new submissions */}
                {!isEditing && !canSubmitNew && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <p className="text-sm text-amber-800">Du hast die maximale Anzahl von {maxSubmissions} Einreichungen erreicht. Du kannst bestehende Sessions bearbeiten.</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Title */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                            Session-Titel <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={form.titel} onChange={e => handleChange('titel', e.target.value)}
                            placeholder="z.B. KI und die Zukunft der Arbeit" required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>

                    {/* Kurzbeschreibung */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                            Kurzbeschreibung (max. 200 Zeichen)
                        </label>
                        <input type="text" value={form.kurzbeschreibung} onChange={e => handleChange('kurzbeschreibung', e.target.value)}
                            placeholder="Kurzer Teaser-Text..." maxLength={200}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                        <span className="text-xs text-slate-400">{form.kurzbeschreibung.length}/200</span>
                    </div>

                    {/* Beschreibung */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Ausführliche Beschreibung</label>
                        <textarea value={form.beschreibung} onChange={e => handleChange('beschreibung', e.target.value)}
                            placeholder="Beschreibe die Session im Detail..." rows={4} maxLength={2000}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 resize-none" />
                        <span className="text-xs text-slate-400">{form.beschreibung.length}/2000</span>
                    </div>

                    {/* Format + Dauer */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Format</label>
                            <select value={form.format} onChange={e => handleChange('format', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                                <option value="">— wählen —</option>
                                {(metadata.formate || ['Talk', 'Panel', 'Workshop', 'Lesung']).map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Dauer (Minuten)</label>
                            <select value={form.dauer} onChange={e => handleChange('dauer', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                                {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Thema + Bereich */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Thema</label>
                            <select value={form.thema} onChange={e => handleChange('thema', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                                <option value="">— wählen —</option>
                                {(metadata.themen || []).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Bereich</label>
                            <select value={form.bereich} onChange={e => handleChange('bereich', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                                <option value="">— wählen —</option>
                                {(metadata.bereiche || []).map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Sprache */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Sprache</label>
                        <div className="flex gap-4">
                            {['DE', 'EN', 'Bilingual'].map(lang => (
                                <label key={lang} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                    <input type="radio" name="sprache" value={lang} checked={form.sprache === lang}
                                        onChange={() => handleChange('sprache', lang)}
                                        className="text-indigo-600 focus:ring-indigo-500" />
                                    {lang}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Notizen */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Notizen (intern)</label>
                        <textarea value={form.notizen} onChange={e => handleChange('notizen', e.target.value)}
                            placeholder="Interne Anmerkungen..." rows={2}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 resize-none" />
                    </div>

                    {/* Speaker Picker */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Speaker*innen</label>
                        {form.selectedSpeakers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {form.selectedSpeakers.map(s => (
                                    <span key={s.id}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${isDummy(s)
                                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                            : 'bg-indigo-100 text-indigo-800 border border-indigo-300'}`}>
                                        {s.fullName} {isDummy(s) && '(Dummy)'}
                                        <button type="button" onClick={() => removeSpeaker(s.id)} className="ml-1 hover:text-red-600">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="relative">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                    <input type="text" value={speakerSearch}
                                        onChange={e => { setSpeakerSearch(e.target.value); setShowSpeakerPicker(true); }}
                                        onFocus={() => setShowSpeakerPicker(true)}
                                        placeholder="Speaker suchen (Name, Organisation, ID)..."
                                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                {onRegisterSpeaker && (
                                    <button type="button" onClick={onRegisterSpeaker}
                                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm flex items-center gap-1 text-slate-700">
                                        <UserPlus className="w-4 h-4" /> Neu
                                    </button>
                                )}
                            </div>
                            {showSpeakerPicker && filteredSpeakers.length > 0 && (
                                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {filteredSpeakers.map(s => (
                                        <button key={s.id} type="button" onClick={() => addSpeaker(s)}
                                            disabled={form.selectedSpeakers.some(sel => sel.id === s.id)}
                                            className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center justify-between ${form.selectedSpeakers.some(sel => sel.id === s.id) ? 'opacity-40' : ''}`}>
                                            <span>
                                                <strong>{s.fullName}</strong>
                                                {s.organisation && <span className="text-slate-400 ml-1">({s.organisation})</span>}
                                                {isDummy(s) && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">Dummy</span>}
                                            </span>
                                            <span className="text-[9px] font-mono text-slate-300">{s.id}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {showSpeakerPicker && filteredSpeakers.length === 0 && speakerSearch.trim() && (
                                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-center text-sm text-slate-400">
                                    Keine Speaker gefunden.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status messages */}
                    {status.error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            <p className="text-sm text-red-800">{status.error}</p>
                        </div>
                    )}
                    {status.success && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            <p className="text-sm text-green-800">{status.success}</p>
                        </div>
                    )}

                    {/* Submit */}
                    <button type="submit" disabled={status.loading || (!isEditing && !canSubmitNew)}
                        className={`w-full ${isEditing ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400' : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400'} text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors`}>
                        {status.loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> {isEditing ? 'Wird aktualisiert...' : 'Wird eingereicht...'}</>
                        ) : isEditing ? (
                            <><Edit3 className="w-4 h-4" /> Änderungen speichern</>
                        ) : (
                            <><Send className="w-4 h-4" /> Session einreichen</>
                        )}
                    </button>
                </form>

                {showSpeakerPicker && (
                    <div className="fixed inset-0 z-40" onClick={() => setShowSpeakerPicker(false)} />
                )}
            </div>

            {/* MY SUBMISSIONS — dashboard cards */}
            {mySubmissions.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <button onClick={() => setShowMySubmissions(!showMySubmissions)}
                        className="flex items-center gap-2 w-full text-left">
                        <Edit3 className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-slate-800 flex-1">Meine Einreichungen ({mySubmissions.length}/{maxSubmissions})</h2>
                        {showMySubmissions ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </button>

                    {showMySubmissions && (
                        <div className="mt-4 space-y-3">
                            {mySubmissions.map(sub => {
                                const isThis = editingSubmission === sub.id;
                                return (
                                    <div key={sub.id} className={`border rounded-lg p-4 transition-all ${isThis ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 hover:border-slate-300'}`}>
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-bold text-slate-800 text-sm">{sub.title}</h3>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sub.status === 'Akzeptiert' ? 'bg-green-100 text-green-700' :
                                                        sub.status === 'Abgelehnt' ? 'bg-red-100 text-red-700' :
                                                            'bg-amber-100 text-amber-700'}`}>
                                                        {sub.status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                                    {sub.format && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{sub.format}</span>}
                                                    {sub.duration && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{sub.duration}′</span>}
                                                    {sub.language && <span className="flex items-center gap-0.5"><Globe className="w-3 h-3" />{sub.language}</span>}
                                                    {sub.speakers && <span>🎤 {sub.speakers}</span>}
                                                </div>
                                                {sub.shortDescription && (
                                                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{sub.shortDescription}</p>
                                                )}
                                            </div>
                                            <button onClick={() => isThis ? cancelEditing() : startEditing(sub)}
                                                className={`text-xs font-bold shrink-0 ${isThis ? 'text-amber-600 hover:text-amber-800' : 'text-indigo-600 hover:text-indigo-800'}`}>
                                                {isThis ? '✓ Wird bearbeitet' : 'Bearbeiten'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* MY SESSIONS — sessions where I'm a speaker */}
            {mySessions.length > 0 && (
                <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                        <span className="text-amber-600">⚠️</span>
                        <p className="text-xs text-amber-800"><strong>Hinweis:</strong> Zeiten sind vorläufig, bis eine Session <strong className="text-green-700">fixiert</strong> ist.</p>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Globe className="w-5 h-5 text-emerald-600" />
                            <h2 className="text-lg font-bold text-slate-800">Meine Sessions ({mySessions.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {mySessions.map((session, i) => {
                                const isFixed = (session.status || '').toLowerCase() === 'fixiert';
                                const stageName = stages.find(s => s.id === session.stage)?.name || session.stage;
                                return (
                                    <div key={session.id || i} className={`border rounded-lg p-4 ${isFixed ? 'border-green-200 bg-green-50/30' : 'border-slate-200 hover:border-slate-300'} transition-colors`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-sm text-slate-800">{session.title || 'Ohne Titel'}</h3>
                                                <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] text-slate-400">
                                                    {stageName && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{stageName}</span>}
                                                    {session.format && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{session.format}</span>}
                                                    {session.startTime && session.startTime !== '-' && (
                                                        <span className={`flex items-center gap-0.5 ${isFixed ? 'text-green-700 font-bold' : 'text-amber-600 italic'}`}>
                                                            <Clock className="w-3 h-3" />{session.startTime} {!isFixed && '(vorläufig)'}
                                                        </span>
                                                    )}
                                                    {session.speakers && <span>🎤 {session.speakers}</span>}
                                                </div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${isFixed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {isFixed ? '✓ Fixiert' : session.status || 'Vorläufig'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            )}
        </div>
    );
};

export default SessionSubmission;
