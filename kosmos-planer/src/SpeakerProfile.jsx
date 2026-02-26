import React, { useState, useEffect } from 'react';
import { User, Save, Globe, MapPin, Languages, Building2, FileText, Camera, Loader2, CheckCircle2, UserPlus, Eye, EyeOff, Link2, Trash2, AlertTriangle, Phone, Home } from 'lucide-react';

/**
 * Field — Reusable form field wrapper. Defined OUTSIDE SpeakerProfile
 * to prevent React from unmounting inputs on every re-render.
 */
const Field = ({ label, icon: Icon, children }) => (
    <div>
        <label className="k-caption tracking-widest block mb-2 flex items-center gap-1">
            {Icon && <Icon className="w-3 h-3" />} {label}
        </label>
        {children}
    </div>
);

const inputCls = "w-full k-input px-3 py-2 text-sm";

/**
 * SpeakerProfile — Allows any authenticated user to create/edit their speaker profile.
 * If no speaker record exists, shows a registration form.
 * Toggle: "Als SprecherIn auswählbar" controls visibility in speaker picker.
 */
const SpeakerProfile = ({ speaker, userEmail, onSave, onRegister, onDelete }) => {
    const isNew = !speaker;
    const [form, setForm] = useState({
        vorname: '',
        nachname: '',
        geschlecht: '',
        organisation: '',
        bio: '',
        webseite: '',
        sprache: '',
        herkunft: '',
        bildUrl: '',
        linkedin: '',
        instagram: '',
        socialSonstiges: '',
        telefon: '',
        adresse: '',
        ansprache: '',
        auswaehlbar: true // toggle: visible as speaker in picker
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});

    useEffect(() => {
        if (!speaker) {
            setForm(prev => ({ ...prev, vorname: '', nachname: '' }));
            setHasChanges(false);
            return;
        }
        const nameParts = (speaker.fullName || '').split(' ');
        const statusLower = (speaker.status || '').toLowerCase();
        setForm({
            vorname: nameParts[0] || '',
            nachname: nameParts.slice(1).join(' ') || '',
            geschlecht: speaker.pronoun || '',
            organisation: speaker.organisation || '',
            bio: speaker.bio || '',
            webseite: speaker.webseite || '',
            sprache: speaker.sprache || '',
            herkunft: speaker.herkunft || '',
            bildUrl: speaker.bildUrl || '',
            linkedin: speaker.linkedin || '',
            instagram: speaker.instagram || '',
            socialSonstiges: speaker.socialSonstiges || '',
            telefon: speaker.telefon || '',
            adresse: speaker.adresse || '',
            ansprache: speaker.ansprache || '',
            auswaehlbar: !statusLower.includes('teilnehm') // CFP_Teilnehmerin = not selectable as speaker
        });
        setHasChanges(false);
    }, [speaker]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
        setSaved(false);
    };

    const handleSave = async () => {
        if (!form.vorname && !form.nachname) return;
        // Validate required fields
        const errs = {};
        if (!form.telefon.trim()) errs.telefon = 'Telefonnummer ist erforderlich';
        if (!form.adresse.trim()) errs.adresse = 'Adresse ist erforderlich';
        if (Object.keys(errs).length > 0) {
            setValidationErrors(errs);
            return;
        }
        setValidationErrors({});
        setSaving(true);
        try {
            if (isNew && onRegister) {
                // Register as new speaker
                await onRegister({
                    fullName: `${form.vorname} ${form.nachname}`.trim(),
                    email: userEmail,
                    pronoun: form.geschlecht,
                    organisation: form.organisation,
                    bio: form.bio,
                    webseite: form.webseite,
                    sprache: form.sprache,
                    herkunft: form.herkunft,
                    bildUrl: form.bildUrl,
                    linkedin: form.linkedin,
                    instagram: form.instagram,
                    socialSonstiges: form.socialSonstiges,
                    telefon: form.telefon,
                    adresse: form.adresse,
                    ansprache: form.ansprache,
                    status: form.auswaehlbar ? 'CFP' : 'CFP_Teilnehmerin'
                });
            } else if (onSave && speaker) {
                await onSave({
                    ...speaker,
                    fullName: `${form.vorname} ${form.nachname}`.trim(),
                    pronoun: form.geschlecht,
                    organisation: form.organisation,
                    bio: form.bio,
                    webseite: form.webseite,
                    sprache: form.sprache,
                    herkunft: form.herkunft,
                    bildUrl: form.bildUrl,
                    linkedin: form.linkedin,
                    instagram: form.instagram,
                    socialSonstiges: form.socialSonstiges,
                    telefon: form.telefon,
                    adresse: form.adresse,
                    ansprache: form.ansprache,
                    status: form.auswaehlbar
                        ? ((speaker.status || '').toLowerCase().includes('teilnehm') ? 'CFP' : speaker.status)
                        : 'CFP_Teilnehmerin'
                });
            }
            setSaved(true);
            setHasChanges(false);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            console.error('Profile save error:', e);
        }
        setSaving(false);
    };

    return (
        <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    {isNew ? <UserPlus className="w-8 h-8 text-[var(--k-accent-teal)]" /> : <User className="w-8 h-8 text-[var(--k-accent-teal)]" />}
                    <div>
                        <h2 className="k-h2">{isNew ? 'Profil anlegen' : 'Mein Profil'}</h2>
                        <p className="k-caption">{userEmail}</p>
                    </div>
                </div>

                <div className="k-panel-glass text-white border-white/10 p-6 space-y-5">
                    {/* Read-only info for existing speakers */}
                    {!isNew && (
                        <div className="flex gap-4 p-3 bg-black/40 rounded-lg text-xs text-white/70">
                            <span><strong>ID:</strong> {speaker.id}</span>
                            <span><strong>Status:</strong> {speaker.status}</span>
                        </div>
                    )}

                    {isNew && (
                        <div className="p-3 bg-[var(--k-accent-teal)]/10 border border-[var(--k-accent-teal)]/30 rounded-lg text-sm text-white">
                            <strong>Willkommen!</strong> Erstelle dein Profil, um Sessions einzureichen oder als SprecherIn sichtbar zu werden.
                        </div>
                    )}

                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-[var(--k-accent-teal)]/20 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                            {form.bildUrl ? (
                                <img src={form.bildUrl} alt="Profilbild" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                            ) : (
                                <User className="w-10 h-10 text-[var(--k-accent-teal)]" />
                            )}
                        </div>
                        <Field label="Profilbild-URL" icon={Camera}>
                            <input type="url" value={form.bildUrl} onChange={e => handleChange('bildUrl', e.target.value)}
                                placeholder="https://example.com/bild.jpg" className={inputCls} />
                        </Field>
                    </div>

                    {/* Name */}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Vorname">
                            <input type="text" value={form.vorname} onChange={e => handleChange('vorname', e.target.value)} className={inputCls} required />
                        </Field>
                        <Field label="Nachname">
                            <input type="text" value={form.nachname} onChange={e => handleChange('nachname', e.target.value)} className={inputCls} />
                        </Field>
                    </div>

                    {/* Geschlecht + Organisation */}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Geschlecht">
                            <select value={form.geschlecht} onChange={e => handleChange('geschlecht', e.target.value)} className={inputCls}>
                                <option value="">Bitte wählen</option>
                                <option value="männlich">männlich</option>
                                <option value="weiblich">weiblich</option>
                                <option value="divers">divers</option>
                            </select>
                        </Field>
                        <Field label="Organisation" icon={Building2}>
                            <input type="text" value={form.organisation} onChange={e => handleChange('organisation', e.target.value)} className={inputCls} />
                        </Field>
                    </div>

                    {/* Bio */}
                    <Field label="Bio" icon={FileText}>
                        <textarea value={form.bio} onChange={e => handleChange('bio', e.target.value)}
                            placeholder="Erzähle etwas über dich..." rows={5} maxLength={1000} className={inputCls + ' resize-none'} />
                        <span className="text-xs text-white/40">{form.bio.length}/1000</span>
                    </Field>

                    {/* Webseite */}
                    <Field label="Webseite" icon={Globe}>
                        <input type="url" value={form.webseite} onChange={e => handleChange('webseite', e.target.value)}
                            placeholder="https://..." className={inputCls} />
                    </Field>

                    {/* Social Media */}
                    <div className="space-y-3">
                        <p className="k-caption flex items-center gap-1"><Link2 className="w-3 h-3" /> Social Media</p>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="LinkedIn">
                                <input type="url" value={form.linkedin} onChange={e => handleChange('linkedin', e.target.value)}
                                    placeholder="https://linkedin.com/in/..." className={inputCls} />
                            </Field>
                            <Field label="Instagram">
                                <input type="text" value={form.instagram} onChange={e => handleChange('instagram', e.target.value)}
                                    placeholder="@handle oder URL" className={inputCls} />
                            </Field>
                        </div>
                        <Field label="Sonstige Links">
                            <input type="text" value={form.socialSonstiges} onChange={e => handleChange('socialSonstiges', e.target.value)}
                                placeholder="z.B. Twitter, Mastodon, YouTube..." className={inputCls} />
                        </Field>
                    </div>

                    {/* Sprache + Herkunft */}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Sprache" icon={Languages}>
                            <select value={form.sprache} onChange={e => handleChange('sprache', e.target.value)} className={inputCls}>
                                <option value="">Bitte wählen</option>
                                <option value="Deutsch">Deutsch</option>
                                <option value="Englisch">Englisch</option>
                            </select>
                        </Field>
                        <Field label="Herkunft" icon={MapPin}>
                            <input type="text" value={form.herkunft} onChange={e => handleChange('herkunft', e.target.value)}
                                placeholder="Stadt, Land" className={inputCls} />
                        </Field>
                    </div>

                    {/* Wie möchte ich angesprochen werden */}
                    <Field label="Wie möchte ich angesprochen werden?">
                        <input type="text" value={form.ansprache} onChange={e => handleChange('ansprache', e.target.value)}
                            placeholder="z.B. Frau Dr. Müller, Enrique, they/them..." className={inputCls} />
                    </Field>

                    {/* Telefon + Adresse (Pflichtfelder) */}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Telefon *" icon={Phone}>
                            <input type="tel" value={form.telefon} onChange={e => handleChange('telefon', e.target.value)}
                                placeholder="+49 123 456789" className={`${inputCls} ${validationErrors.telefon ? 'border-red-500/50 ring-2 ring-red-500/50' : ''}`} />
                            {validationErrors.telefon && <span className="text-xs text-red-400 mt-1 block">{validationErrors.telefon}</span>}
                        </Field>
                        <Field label="Adresse *" icon={Home}>
                            <input type="text" value={form.adresse} onChange={e => handleChange('adresse', e.target.value)}
                                placeholder="Straße, PLZ Ort" className={`${inputCls} ${validationErrors.adresse ? 'border-red-500/50 ring-2 ring-red-500/50' : ''}`} />
                            {validationErrors.adresse && <span className="text-xs text-red-400 mt-1 block">{validationErrors.adresse}</span>}
                        </Field>
                    </div>

                    {/* Speaker visibility toggle */}
                    <div className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/10">
                        <button onClick={() => handleChange('auswaehlbar', !form.auswaehlbar)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${form.auswaehlbar ? 'bg-[var(--k-accent-teal)]' : 'bg-[#161616]'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.auswaehlbar ? 'translate-x-5' : ''}`} />
                        </button>
                        <div className="flex-1">
                            <span className="text-sm font-bold text-white flex items-center gap-1.5">
                                {form.auswaehlbar ? <Eye className="w-4 h-4 text-[var(--k-accent-teal)]" /> : <EyeOff className="w-4 h-4 text-[#161616]/60" />}
                                Als SprecherIn auswählbar
                            </span>
                            <p className="text-xs text-white/50 mt-0.5">
                                {form.auswaehlbar ? 'Du bist als SprecherIn in der Suche sichtbar.' : 'Du bist nur als TeilnehmerIn registriert (nicht als SprecherIn auswählbar).'}
                            </p>
                        </div>
                    </div>

                    {/* Save */}
                    <div className="pt-2 flex items-center gap-3">
                        <button onClick={handleSave} disabled={saving || (!hasChanges && !isNew) || (!form.vorname && !form.nachname)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm active:scale-95 ${(hasChanges || isNew) && (form.vorname || form.nachname) ? 'k-btn-primary' : 'bg-[#161616] text-[#161616]/60 cursor-not-allowed'}`}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isNew ? <UserPlus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Wird gespeichert...' : isNew ? 'Profil anlegen' : 'Profil speichern'}
                        </button>
                        {saved && (
                            <span className="flex items-center gap-1 text-emerald-400 text-sm font-bold">
                                <CheckCircle2 className="w-4 h-4" /> Gespeichert
                            </span>
                        )}
                    </div>

                    {/* Delete Profile (only for existing speakers) */}
                    {!isNew && onDelete && (
                        <div className="mt-6 pt-4 border-t border-red-900/30">
                            {!showDeleteConfirm ? (
                                <button onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-2 text-xs text-red-500 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" /> Profil und alle personenbezogenen Daten löschen
                                </button>
                            ) : (
                                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 space-y-3">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold text-red-300">Profil endgültig löschen?</p>
                                            <p className="text-xs text-red-200 mt-1">
                                                Alle personenbezogenen Daten (Name, Bio, Kontakt, Social Media) werden unwiderruflich gelöscht.
                                                Du wirst aus allen verknüpften Sessions entfernt und die Session-Ersteller werden benachrichtigt.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={async () => { setDeleting(true); await onDelete(); }}
                                            disabled={deleting}
                                            className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500 disabled:opacity-50 flex items-center gap-1.5">
                                            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            {deleting ? 'Wird gelöscht...' : 'Ja, endgültig löschen'}
                                        </button>
                                        <button onClick={() => setShowDeleteConfirm(false)}
                                            className="px-4 py-2 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/20">
                                            Abbrechen
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SpeakerProfile;
