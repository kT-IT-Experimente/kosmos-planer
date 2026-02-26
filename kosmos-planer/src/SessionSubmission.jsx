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
    maxSubmissions = 5, onSuccess, onRegisterSpeaker, userRole = 'TEILNEHMENDE',
    openCallClosed = false
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
    const hasUnlimitedSubmissions = ['ADMIN', 'CURATOR', 'REVIEWER'].includes(userRole);
    const canSubmitNew = !openCallClosed && (hasUnlimitedSubmissions || mySubmissions.length < maxSubmissions);

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
            // Generate unique Session_ID for new submissions
            const sessionId = `S-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
                // Append new row (A-O submission data, P-V empty planning cols, W=Session_ID)
                const { ok, error } = await fetchSheets({
                    action: 'append', spreadsheetId,
                    range: `'Master_Einreichungen'!A2:W`,
                    values: [[...row, '', '', '', '', '', '', '', sessionId]],
                }, accessToken, apiUrl);
                if (!ok) throw new Error(error || 'Fehler beim Speichern');
                setStatus({ loading: false, error: null, success: `Session "${form.titel}" erfolgreich eingereicht!` });
            }

            setForm(emptyForm);
            setEditingSubmission(null);
            if (onSuccess) onSuccess(form.titel);
        } catch (err) {
            setStatus({ loading: false, error: err.message, success: null });
        }
    };

    const isDummy = (speaker) => (speaker.status || '').toLowerCase().includes('dummy');

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Open Call Closed Banner */}
            {openCallClosed && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold text-red-700">Open Call geschlossen</h3>
                        <p className="text-xs text-red-600 mt-1">Neue Einreichungen sind derzeit nicht möglich. Du kannst bestehende Sessions weiterhin bearbeiten.</p>
                    </div>
                </div>
            )}

            {/* Submit / Edit Form — hidden when open call is closed and not editing */}
            {(!openCallClosed || isEditing) && (
                <div className={`k-panel-glass text-white p-6 ${isEditing ? 'border-amber-500/30' : 'border-white/10'}`}>
                    <div className="flex items-center gap-3 mb-6">
                        {isEditing ? <Edit3 className="w-6 h-6 text-amber-500" /> : <Send className="w-6 h-6 text-[var(--k-accent-teal)]" />}
                        <div className="flex-1">
                            <h2 className="k-h2">
                                {isEditing ? 'Session bearbeiten' : 'Session einreichen'}
                            </h2>
                            <p className="k-caption">
                                {isEditing
                                    ? `Bearbeitung von "${form.titel}"`
                                    : `Eingereicht von: ${submitterName || submitterEmail}`}
                            </p>
                        </div>
                        {isEditing && (
                            <button onClick={cancelEditing}
                                className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors">
                                Abbrechen
                            </button>
                        )}
                    </div>

                    {/* Show limit info for new submissions */}
                    {!isEditing && !canSubmitNew && (
                        <div className="mb-4 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            <p className="text-sm text-amber-200">Du hast die maximale Anzahl von {maxSubmissions} Einreichungen erreicht. Du kannst bestehende Sessions bearbeiten.</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Title */}
                        <div>
                            <label className="k-caption tracking-widest block mb-1">
                                Session-Titel <span className="text-red-500">*</span>
                            </label>
                            <input type="text" value={form.titel} onChange={e => handleChange('titel', e.target.value)}
                                placeholder="z.B. KI und die Zukunft der Arbeit" required
                                className="w-full k-input px-3 py-2 text-sm" />
                        </div>

                        {/* Kurzbeschreibung */}
                        <div>
                            <label className="k-caption tracking-widest block mb-1">
                                Kurzbeschreibung (max. 200 Zeichen)
                            </label>
                            <input type="text" value={form.kurzbeschreibung} onChange={e => handleChange('kurzbeschreibung', e.target.value)}
                                placeholder="Kurzer Teaser-Text..." maxLength={200}
                                className="w-full k-input px-3 py-2 text-sm" />
                            <span className="text-xs text-white/40">{form.kurzbeschreibung.length}/200</span>
                        </div>

                        {/* Beschreibung */}
                        <div>
                            <label className="k-caption tracking-widest block mb-1">Ausführliche Beschreibung</label>
                            <textarea value={form.beschreibung} onChange={e => handleChange('beschreibung', e.target.value)}
                                placeholder="Beschreibe die Session im Detail..." rows={4} maxLength={2000}
                                className="w-full k-input px-3 py-2 text-sm resize-none" />
                            <span className="text-xs text-white/40">{form.beschreibung.length}/2000</span>
                        </div>

                        {/* Format + Dauer */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="k-caption tracking-widest block mb-1">Format</label>
                                <select value={form.format} onChange={e => handleChange('format', e.target.value)}
                                    className="w-full k-input px-3 py-2 text-sm">
                                    <option value="">— wählen —</option>
                                    {(metadata.formate || ['Talk', 'Panel', 'Workshop', 'Lesung']).map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="k-caption tracking-widest block mb-1">Dauer (Minuten)</label>
                                <select value={form.dauer} onChange={e => handleChange('dauer', parseInt(e.target.value))}
                                    className="w-full k-input px-3 py-2 text-sm">
                                    {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Thema + Bereich */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="k-caption tracking-widest block mb-1">Thema</label>
                                <select value={form.thema} onChange={e => handleChange('thema', e.target.value)}
                                    className="w-full k-input px-3 py-2 text-sm">
                                    <option value="">— wählen —</option>
                                    {(metadata.themen || []).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="k-caption tracking-widest block mb-1">Bereich</label>
                                <select value={form.bereich} onChange={e => handleChange('bereich', e.target.value)}
                                    className="w-full k-input px-3 py-2 text-sm">
                                    <option value="">— wählen —</option>
                                    {(metadata.bereiche || []).map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Sprache */}
                        <div>
                            <label className="k-caption tracking-widest block mb-1">Sprache</label>
                            <div className="flex gap-4 p-2">
                                {['DE', 'EN', 'Bilingual'].map(lang => (
                                    <label key={lang} className="flex items-center gap-2 text-sm cursor-pointer text-white hover:text-[var(--k-accent-teal)] transition-colors">
                                        <input type="radio" name="sprache" value={lang} checked={form.sprache === lang}
                                            onChange={() => handleChange('sprache', lang)}
                                            className="text-[var(--k-accent-teal)] bg-[#161616] border-slate-600 focus:ring-[var(--k-accent-teal)]" />
                                        {lang}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Notizen */}
                        <div>
                            <label className="k-caption tracking-widest block mb-1">Notizen (intern)</label>
                            <textarea value={form.notizen} onChange={e => handleChange('notizen', e.target.value)}
                                placeholder="Interne Anmerkungen..." rows={2}
                                className="w-full k-input px-3 py-2 text-sm resize-none" />
                        </div>

                        {/* Speaker Picker */}
                        <div>
                            <label className="k-caption tracking-widest block mb-1">Speaker*innen</label>
                            {form.selectedSpeakers.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {form.selectedSpeakers.map(s => (
                                        <span key={s.id}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${isDummy(s)
                                                ? 'bg-amber-900/40 text-amber-200 border border-amber-500/30'
                                                : 'bg-[var(--k-accent-teal)]/20 text-white border border-[var(--k-accent-teal)]/40'}`}>
                                            {s.fullName} {isDummy(s) && '(Dummy)'}
                                            <button type="button" onClick={() => removeSpeaker(s.id)} className="ml-1 hover:text-red-400">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="relative">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="w-4 h-4 text-white/40 absolute left-3 top-2.5" />
                                        <input type="text" value={speakerSearch}
                                            onChange={e => { setSpeakerSearch(e.target.value); setShowSpeakerPicker(true); }}
                                            onFocus={() => setShowSpeakerPicker(true)}
                                            placeholder="Speaker suchen (Name, Organisation, ID)..."
                                            className="w-full pl-9 pr-3 py-2 k-input text-sm" />
                                    </div>
                                    {onRegisterSpeaker && (
                                        <button type="button" onClick={onRegisterSpeaker}
                                            className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-sm flex items-center gap-1 text-white transition-colors">
                                            <UserPlus className="w-4 h-4" /> Neu
                                        </button>
                                    )}
                                </div>
                                {showSpeakerPicker && filteredSpeakers.length > 0 && (
                                    <div className="absolute z-50 mt-1 w-full bg-[#12141a] border border-white/20 rounded-lg shadow-xl max-h-48 overflow-y-auto KDS-glass">
                                        {filteredSpeakers.map(s => (
                                            <button key={s.id} type="button" onClick={() => addSpeaker(s)}
                                                disabled={form.selectedSpeakers.some(sel => sel.id === s.id)}
                                                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 text-white flex items-center justify-between transition-colors ${form.selectedSpeakers.some(sel => sel.id === s.id) ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                                <span>
                                                    <strong>{s.fullName}</strong>
                                                    {s.organisation && <span className="text-white/50 ml-1">({s.organisation})</span>}
                                                    {isDummy(s) && <span className="ml-1 text-[9px] bg-amber-900/40 text-amber-300 px-1 py-0.5 rounded">Dummy</span>}
                                                </span>
                                                <span className="text-[9px] font-mono text-white/30">{s.id}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {showSpeakerPicker && filteredSpeakers.length === 0 && speakerSearch.trim() && (
                                    <div className="absolute z-50 mt-1 w-full bg-black/60 backdrop-blur-md border border-white/20 rounded-lg shadow-xl p-3 text-center text-sm text-white/60">
                                        Keine Speaker gefunden.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Status messages */}
                        {status.error && (
                            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                <p className="text-sm text-red-200">{status.error}</p>
                            </div>
                        )}
                        {status.success && (
                            <div className="flex items-center gap-2 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <p className="text-sm text-emerald-200">{status.success}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button type="submit" disabled={status.loading || (!isEditing && !canSubmitNew)}
                            className={`w-full py-2.5 px-4 flex items-center justify-center gap-2 transition-colors ${isEditing
                                    ? 'k-btn-primary !bg-amber-600 border-amber-500 text-white hover:!bg-amber-500 disabled:!bg-[#161616] disabled:!text-[#161616]/60 disabled:!border-slate-800'
                                    : 'k-btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
                                }`}>
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
            )}

            {/* MY SUBMISSIONS — dashboard cards */}
            {mySubmissions.length > 0 && (
                <div className="k-panel-glass text-white my-6 border-white/10 p-6">
                    <button onClick={() => setShowMySubmissions(!showMySubmissions)}
                        className="flex items-center gap-2 w-full text-left transition-colors hover:text-[var(--k-accent-teal)] pt-1">
                        <Edit3 className="w-5 h-5 text-[var(--k-accent-teal)]" />
                        <h2 className="text-lg font-bold flex-1">Meine Einreichungen ({mySubmissions.length}/{maxSubmissions})</h2>
                        {showMySubmissions ? <ChevronUp className="w-5 h-5 text-white/40" /> : <ChevronDown className="w-5 h-5 text-white/40" />}
                    </button>

                    {showMySubmissions && (
                        <div className="mt-4 space-y-3">
                            {mySubmissions.map(sub => {
                                const isThis = editingSubmission === sub.id;
                                return (
                                    <div key={sub.id} className={`border rounded-lg p-4 transition-all ${isThis ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/10 hover:border-white/30 bg-black/20'}`}>
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-bold text-white text-sm">{sub.title}</h3>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sub.status === 'Akzeptiert' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30' :
                                                            sub.status === 'Abgelehnt' ? 'bg-red-900/30 text-red-400 border border-red-500/30' :
                                                                'bg-amber-900/30 text-amber-500 border border-amber-500/30'}`}>
                                                        {sub.status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] text-white/50">
                                                    {sub.format && <span className="bg-[var(--k-accent-teal)]/20 text-[var(--k-accent-teal)] px-1.5 py-0.5 rounded font-bold">{sub.format}</span>}
                                                    {sub.duration && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{sub.duration}′</span>}
                                                    {sub.language && <span className="flex items-center gap-0.5"><Globe className="w-3 h-3" />{sub.language}</span>}
                                                    {sub.speakers && <span className="truncate max-w-[150px]">🎤 {sub.speakers}</span>}
                                                </div>
                                                {sub.shortDescription && (
                                                    <p className="text-xs text-white/60 mt-1 line-clamp-2">{sub.shortDescription}</p>
                                                )}
                                            </div>
                                            <button onClick={() => isThis ? cancelEditing() : startEditing(sub)}
                                                className={`text-xs font-bold shrink-0 transition-colors ${isThis ? 'text-amber-500 hover:text-amber-400' : 'text-[var(--k-accent-teal)] hover:text-emerald-400'}`}>
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
                <div className="space-y-4 pt-4">
                    <div className="bg-amber-900/40 border border-amber-500/40 rounded-xl p-3 flex items-start gap-2 text-amber-200">
                        <span className="text-amber-400">⚠️</span>
                        <p className="text-xs"><strong>Hinweis:</strong> Zeiten sind vorläufig, bis eine Session <strong className="text-emerald-400">fixiert</strong> ist.</p>
                    </div>
                    <div className="k-panel-glass text-white border-white/10 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Globe className="w-5 h-5 text-[var(--k-accent-teal)]" />
                            <h2 className="text-lg font-bold">Meine Sessions ({mySessions.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {mySessions.map((session, i) => {
                                const isFixed = (session.status || '').toLowerCase() === 'fixiert';
                                const stageName = stages.find(s => s.id === session.stage)?.name || session.stage;
                                return (
                                    <div key={session.id || i} className={`border rounded-lg p-4 bg-black/20 transition-colors ${isFixed ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-white/10 hover:border-white/30'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-sm text-white">{session.title || 'Ohne Titel'}</h3>
                                                <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] text-white/50">
                                                    {stageName && <span className="bg-white/10 text-white/70 px-1.5 py-0.5 rounded font-bold border border-white/5">{stageName}</span>}
                                                    {session.format && <span className="bg-[var(--k-accent-teal)]/20 text-[var(--k-accent-teal)] px-1.5 py-0.5 rounded font-bold border border-[var(--k-accent-teal)]/20">{session.format}</span>}
                                                    {session.startTime && session.startTime !== '-' && (
                                                        <span className={`flex items-center gap-0.5 ${isFixed ? 'text-emerald-400 font-bold' : 'text-amber-500 italic'}`}>
                                                            <Clock className="w-3 h-3" />{session.startTime} {!isFixed && '(vorläufig)'}
                                                        </span>
                                                    )}
                                                    {session.speakers && <span className="line-clamp-1 max-w-[200px]">🎤 {session.speakers}</span>}
                                                </div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 border ${isFixed ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/30 text-amber-500 border-amber-500/30'}`}>
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

        </div>
    );
};

export default SessionSubmission;
