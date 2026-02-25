import React, { useState, useEffect } from 'react';
import { User, Save, Globe, MapPin, Languages, Building2, FileText, Camera, Loader2, CheckCircle2, UserPlus, Eye, EyeOff, Link2 } from 'lucide-react';

/**
 * Field — Reusable form field wrapper. Defined OUTSIDE SpeakerProfile
 * to prevent React from unmounting inputs on every re-render.
 */
const Field = ({ label, icon: Icon, children }) => (
    <div>
        <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
            {Icon && <Icon className="w-3 h-3" />} {label}
        </label>
        {children}
    </div>
);

const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

/**
 * SpeakerProfile — Allows any authenticated user to create/edit their speaker profile.
 * If no speaker record exists, shows a registration form.
 * Toggle: "Als SprecherIn auswählbar" controls visibility in speaker picker.
 */
const SpeakerProfile = ({ speaker, userEmail, onSave, onRegister }) => {
    const isNew = !speaker;
    const [form, setForm] = useState({
        vorname: '',
        nachname: '',
        pronomen: '',
        organisation: '',
        bio: '',
        webseite: '',
        sprache: '',
        herkunft: '',
        bildUrl: '',
        linkedin: '',
        instagram: '',
        socialSonstiges: '',
        auswaehlbar: true // toggle: visible as speaker in picker
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

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
            pronomen: speaker.pronoun || '',
            organisation: speaker.organisation || '',
            bio: speaker.bio || '',
            webseite: speaker.webseite || '',
            sprache: speaker.sprache || '',
            herkunft: speaker.herkunft || '',
            bildUrl: speaker.bildUrl || '',
            linkedin: speaker.linkedin || '',
            instagram: speaker.instagram || '',
            socialSonstiges: speaker.socialSonstiges || '',
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
        setSaving(true);
        try {
            if (isNew && onRegister) {
                // Register as new speaker
                await onRegister({
                    fullName: `${form.vorname} ${form.nachname}`.trim(),
                    email: userEmail,
                    pronoun: form.pronomen,
                    organisation: form.organisation,
                    bio: form.bio,
                    webseite: form.webseite,
                    sprache: form.sprache,
                    herkunft: form.herkunft,
                    bildUrl: form.bildUrl,
                    linkedin: form.linkedin,
                    instagram: form.instagram,
                    socialSonstiges: form.socialSonstiges,
                    status: form.auswaehlbar ? 'CFP' : 'CFP_Teilnehmerin'
                });
            } else if (onSave && speaker) {
                await onSave({
                    ...speaker,
                    fullName: `${form.vorname} ${form.nachname}`.trim(),
                    pronoun: form.pronomen,
                    organisation: form.organisation,
                    bio: form.bio,
                    webseite: form.webseite,
                    sprache: form.sprache,
                    herkunft: form.herkunft,
                    bildUrl: form.bildUrl,
                    linkedin: form.linkedin,
                    instagram: form.instagram,
                    socialSonstiges: form.socialSonstiges,
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
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    {isNew ? <UserPlus className="w-8 h-8 text-indigo-600" /> : <User className="w-8 h-8 text-indigo-600" />}
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{isNew ? 'Profil anlegen' : 'Mein Profil'}</h2>
                        <p className="text-xs text-slate-400">{userEmail}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
                    {/* Read-only info for existing speakers */}
                    {!isNew && (
                        <div className="flex gap-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
                            <span><strong>ID:</strong> {speaker.id}</span>
                            <span><strong>Status:</strong> {speaker.status}</span>
                        </div>
                    )}

                    {isNew && (
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700">
                            <strong>Willkommen!</strong> Erstelle dein Profil, um Sessions einzureichen oder als SprecherIn sichtbar zu werden.
                        </div>
                    )}

                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                            {form.bildUrl ? (
                                <img src={form.bildUrl} alt="Profilbild" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                            ) : (
                                <User className="w-10 h-10 text-indigo-400" />
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

                    {/* Pronomen + Organisation */}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Pronomen">
                            <input type="text" value={form.pronomen} onChange={e => handleChange('pronomen', e.target.value)}
                                placeholder="z.B. sie/ihr, er/ihm" className={inputCls} />
                        </Field>
                        <Field label="Organisation" icon={Building2}>
                            <input type="text" value={form.organisation} onChange={e => handleChange('organisation', e.target.value)} className={inputCls} />
                        </Field>
                    </div>

                    {/* Bio */}
                    <Field label="Bio" icon={FileText}>
                        <textarea value={form.bio} onChange={e => handleChange('bio', e.target.value)}
                            placeholder="Erzähle etwas über dich..." rows={5} maxLength={1000} className={inputCls + ' resize-none'} />
                        <span className="text-xs text-slate-400">{form.bio.length}/1000</span>
                    </Field>

                    {/* Webseite */}
                    <Field label="Webseite" icon={Globe}>
                        <input type="url" value={form.webseite} onChange={e => handleChange('webseite', e.target.value)}
                            placeholder="https://..." className={inputCls} />
                    </Field>

                    {/* Social Media */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Link2 className="w-3 h-3" /> Social Media</p>
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
                        <Field label="Sprache(n)" icon={Languages}>
                            <input type="text" value={form.sprache} onChange={e => handleChange('sprache', e.target.value)}
                                placeholder="z.B. Deutsch, Englisch" className={inputCls} />
                        </Field>
                        <Field label="Herkunft" icon={MapPin}>
                            <input type="text" value={form.herkunft} onChange={e => handleChange('herkunft', e.target.value)}
                                placeholder="Stadt, Land" className={inputCls} />
                        </Field>
                    </div>

                    {/* Speaker visibility toggle */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <button onClick={() => handleChange('auswaehlbar', !form.auswaehlbar)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${form.auswaehlbar ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.auswaehlbar ? 'translate-x-5' : ''}`} />
                        </button>
                        <div className="flex-1">
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                {form.auswaehlbar ? <Eye className="w-4 h-4 text-indigo-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                                Als SprecherIn auswählbar
                            </span>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {form.auswaehlbar ? 'Du bist als SprecherIn in der Suche sichtbar.' : 'Du bist nur als TeilnehmerIn registriert (nicht als SprecherIn auswählbar).'}
                            </p>
                        </div>
                    </div>

                    {/* Save */}
                    <div className="pt-2 flex items-center gap-3">
                        <button onClick={handleSave} disabled={saving || (!hasChanges && !isNew) || (!form.vorname && !form.nachname)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm active:scale-95 ${(hasChanges || isNew) && (form.vorname || form.nachname) ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isNew ? <UserPlus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Wird gespeichert...' : isNew ? 'Profil anlegen' : 'Profil speichern'}
                        </button>
                        {saved && (
                            <span className="flex items-center gap-1 text-green-600 text-sm font-bold">
                                <CheckCircle2 className="w-4 h-4" /> Gespeichert
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SpeakerProfile;
