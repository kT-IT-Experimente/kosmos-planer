import React, { useState, useEffect, useMemo } from 'react';
import { User, Save, Globe, Mail, MapPin, Languages, Building2, FileText, Camera, Loader2, CheckCircle2 } from 'lucide-react';

/**
 * SpeakerProfile — Allows speakers/participants to edit their own profile data.
 * Editable: Vorname, Nachname, Pronomen, Organisation, Bio, Webseite, Sprache, Herkunft, Bild-URL
 * Read-only: ID, Status, Registriert_am
 */
const SpeakerProfile = ({ speaker, onSave }) => {
    const [form, setForm] = useState({
        vorname: '',
        nachname: '',
        pronomen: '',
        organisation: '',
        bio: '',
        webseite: '',
        sprache: '',
        herkunft: '',
        bildUrl: ''
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Sync from speaker prop
    useEffect(() => {
        if (!speaker) return;
        const nameParts = (speaker.fullName || '').split(' ');
        setForm({
            vorname: nameParts[0] || '',
            nachname: nameParts.slice(1).join(' ') || '',
            pronomen: speaker.pronoun || '',
            organisation: speaker.organisation || '',
            bio: speaker.bio || '',
            webseite: speaker.webseite || '',
            sprache: speaker.sprache || '',
            herkunft: speaker.herkunft || '',
            bildUrl: speaker.bildUrl || ''
        });
        setHasChanges(false);
    }, [speaker]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
        setSaved(false);
    };

    const handleSave = async () => {
        if (!onSave || !speaker) return;
        setSaving(true);
        try {
            await onSave({
                ...speaker,
                fullName: `${form.vorname} ${form.nachname}`.trim(),
                pronoun: form.pronomen,
                organisation: form.organisation,
                bio: form.bio,
                webseite: form.webseite,
                sprache: form.sprache,
                herkunft: form.herkunft,
                bildUrl: form.bildUrl
            });
            setSaved(true);
            setHasChanges(false);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            console.error('Profile save error:', e);
        }
        setSaving(false);
    };

    if (!speaker) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
                <div className="text-center max-w-md">
                    <User className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-700 mb-2">Kein Profil gefunden</h2>
                    <p className="text-sm text-slate-400">Deine E-Mail-Adresse ist noch nicht in der SprecherInnen-Datenbank hinterlegt. Bitte wende dich an das Admin-Team.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <User className="w-8 h-8 text-indigo-600" />
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Mein Profil</h2>
                        <p className="text-xs text-slate-400">Bearbeite deine SprecherInnen-Daten</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
                    {/* Read-only info */}
                    <div className="flex gap-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
                        <span><strong>ID:</strong> {speaker.id}</span>
                        <span><strong>Status:</strong> {speaker.status}</span>
                        <span><strong>E-Mail:</strong> {speaker.email}</span>
                    </div>

                    {/* Avatar / Image URL */}
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                            {form.bildUrl ? (
                                <img src={form.bildUrl} alt="Profilbild" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                            ) : (
                                <User className="w-10 h-10 text-indigo-400" />
                            )}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Camera className="w-3 h-3" /> Profilbild-URL
                            </label>
                            <input type="url" value={form.bildUrl} onChange={e => handleChange('bildUrl', e.target.value)}
                                placeholder="https://example.com/bild.jpg"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                    </div>

                    {/* Name */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Vorname</label>
                            <input type="text" value={form.vorname} onChange={e => handleChange('vorname', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Nachname</label>
                            <input type="text" value={form.nachname} onChange={e => handleChange('nachname', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>

                    {/* Pronomen + Organisation */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Pronomen</label>
                            <input type="text" value={form.pronomen} onChange={e => handleChange('pronomen', e.target.value)}
                                placeholder="z.B. sie/ihr, er/ihm, they/them"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> Organisation
                            </label>
                            <input type="text" value={form.organisation} onChange={e => handleChange('organisation', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>

                    {/* Bio */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Bio
                        </label>
                        <textarea value={form.bio} onChange={e => handleChange('bio', e.target.value)}
                            placeholder="Erzähle etwas über dich..."
                            rows={5} maxLength={2000}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 resize-none" />
                        <span className="text-xs text-slate-400">{form.bio.length}/2000</span>
                    </div>

                    {/* Webseite */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                            <Globe className="w-3 h-3" /> Webseite
                        </label>
                        <input type="url" value={form.webseite} onChange={e => handleChange('webseite', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                    </div>

                    {/* Sprache + Herkunft */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Languages className="w-3 h-3" /> Sprache(n)
                            </label>
                            <input type="text" value={form.sprache} onChange={e => handleChange('sprache', e.target.value)}
                                placeholder="z.B. Deutsch, Englisch"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> Herkunft
                            </label>
                            <input type="text" value={form.herkunft} onChange={e => handleChange('herkunft', e.target.value)}
                                placeholder="Stadt, Land"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>

                    {/* Save button */}
                    <div className="pt-2 flex items-center gap-3">
                        <button onClick={handleSave} disabled={saving || !hasChanges}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm active:scale-95 ${hasChanges ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Wird gespeichert...' : 'Profil speichern'}
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
