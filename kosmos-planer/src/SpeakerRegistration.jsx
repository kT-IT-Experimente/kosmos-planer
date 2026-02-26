import React, { useState } from 'react';
import { UserPlus, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * SpeakerRegistration - Allows registering new speakers via n8n webhook.
 * Supports both real speakers and "dummy" placeholders.
 */
const SpeakerRegistration = ({ n8nBaseUrl, accessToken, onSuccess, registeredBy = '' }) => {
    const [form, setForm] = useState({
        vorname: '',
        nachname: '',
        email: '',
        telefon: '',
        bio: '',
        organisation: '',
        webseite: '',
        pronomen: '',
        isDummy: false
    });
    const [status, setStatus] = useState({ loading: false, error: null, success: null });

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!n8nBaseUrl) {
            setStatus({ loading: false, error: 'n8n Webhook-URL nicht konfiguriert. Bitte in den Einstellungen hinterlegen.', success: null });
            return;
        }

        // Validation
        if (!form.isDummy && (!form.vorname || !form.email)) {
            setStatus({ loading: false, error: 'Vorname und E-Mail sind Pflichtfelder.', success: null });
            return;
        }
        if (form.isDummy && !form.vorname) {
            setStatus({ loading: false, error: 'Bitte gib zumindest einen Platzhalter-Namen ein.', success: null });
            return;
        }

        setStatus({ loading: true, error: null, success: null });

        try {
            const res = await fetch(`${n8nBaseUrl}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({
                    ...form,
                    registeredBy: registeredBy
                })
            });

            if (!res.ok) throw new Error(`Server-Fehler: ${res.status}`);

            let data = {};
            try {
                const text = await res.text();
                data = text ? JSON.parse(text) : {};
            } catch (_) { /* empty or non-JSON response is OK */ }

            if (data.error) throw new Error(data.error);

            setStatus({
                loading: false,
                error: null,
                success: `${form.isDummy ? 'Dummy-Speaker' : 'Speaker'} registriert! ID: ${data.id}`
            });

            // Reset form
            setForm({
                vorname: '', nachname: '', email: '', telefon: '',
                bio: '', organisation: '', webseite: '', pronomen: '', isDummy: false
            });

            if (onSuccess) onSuccess(data);
        } catch (err) {
            setStatus({ loading: false, error: err.message, success: null });
        }
    };

    return (
        <div className="k-panel-glass text-white border-white/10 p-6 max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <UserPlus className="w-6 h-6 text-[var(--k-accent-teal)]" />
                <h2 className="k-h2">Speaker Registrierung</h2>
            </div>

            {/* Dummy Toggle */}
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input
                    type="checkbox"
                    checked={form.isDummy}
                    onChange={e => handleChange('isDummy', e.target.checked)}
                    className="rounded border-slate-700 bg-[#161616] text-[var(--k-accent-teal)] focus:ring-[var(--k-accent-teal)]"
                />
                <span className="text-sm text-white/70">
                    Platzhalter-Speaker (Dummy) — Daten werden später ergänzt
                </span>
            </label>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Row: Vorname + Nachname */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="k-caption tracking-widest block mb-1">
                            Vorname <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.vorname}
                            onChange={e => handleChange('vorname', e.target.value)}
                            placeholder={form.isDummy ? 'z.B. TBD' : 'Maria'}
                            className="w-full k-input px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="k-caption tracking-widest block mb-1">Nachname</label>
                        <input
                            type="text"
                            value={form.nachname}
                            onChange={e => handleChange('nachname', e.target.value)}
                            placeholder={form.isDummy ? 'Panel-Klima' : 'Müller'}
                            className="w-full k-input px-3 py-2 text-sm"
                        />
                    </div>
                </div>

                {/* E-Mail (hidden for dummy) */}
                {!form.isDummy && (
                    <div>
                        <label className="k-caption tracking-widest block mb-1">
                            E-Mail <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => handleChange('email', e.target.value)}
                            placeholder="speaker@example.com"
                            className="w-full k-input px-3 py-2 text-sm"
                            required={!form.isDummy}
                        />
                    </div>
                )}

                {/* Pronomen */}
                <div>
                    <label className="k-caption tracking-widest block mb-1">Pronomen</label>
                    <select
                        value={form.pronomen}
                        onChange={e => handleChange('pronomen', e.target.value)}
                        className="w-full k-input px-3 py-2 text-sm"
                    >
                        <option value="">— wählen —</option>
                        <option value="sie/ihr">sie/ihr</option>
                        <option value="er/ihm">er/ihm</option>
                        <option value="they/them">they/them</option>
                        <option value="keine Angabe">keine Angabe</option>
                    </select>
                </div>

                {/* Organisation + Bio (hidden for dummy) */}
                {!form.isDummy && (
                    <>
                        <div>
                            <label className="k-caption tracking-widest block mb-1">Organisation</label>
                            <input
                                type="text"
                                value={form.organisation}
                                onChange={e => handleChange('organisation', e.target.value)}
                                placeholder="z.B. TU Berlin"
                                className="w-full k-input px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="k-caption tracking-widest block mb-1">Kurze Biografie</label>
                            <textarea
                                value={form.bio}
                                onChange={e => handleChange('bio', e.target.value)}
                                placeholder="Max. 300 Zeichen..."
                                maxLength={300}
                                rows={3}
                                className="w-full k-input px-3 py-2 text-sm resize-none"
                            />
                            <span className="text-xs text-white/40">{form.bio.length}/300</span>
                        </div>
                    </>
                )}

                {/* Status Messages */}
                {status.error && (
                    <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-200">{status.error}</span>
                    </div>
                )}
                {status.success && (
                    <div className="flex items-start gap-2 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-emerald-200">{status.success}</span>
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={status.loading}
                    className="w-full k-btn-primary py-2.5 flex items-center justify-center gap-2"
                >
                    {status.loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Wird registriert...</>
                    ) : (
                        <><UserPlus className="w-4 h-4" /> {form.isDummy ? 'Dummy anlegen' : 'Speaker registrieren'}</>
                    )}
                </button>
            </form>
        </div>
    );
};

export default SpeakerRegistration;
