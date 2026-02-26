import React, { useState, useEffect } from 'react';
import { UserCog, Shield, Lock, Users, ChevronRight, Save, Trash2, Plus, Clock, Settings, Download, Eye, EyeOff, Tag, Mic, MapPin, ToggleLeft, ToggleRight, Send, Loader2 } from 'lucide-react';

export default function AdminDashboard({
    users = [], stages = [], config = {}, configThemen = {},
    onUpdateUserRole, onDeleteUser, onAddUser, onUpdateConfig,
    onSaveStages, onSaveConfigThemen,
    openCallClosed = false, onToggleOpenCall, onInviteUser,
    curationApiUrl = '', userEmail = '', readOnly = false
}) {
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState('REVIEWER');
    const [localConfig, setLocalConfig] = useState({
        startHour: config.startHour ?? 8,
        endHour: config.endHour ?? 22,
        bufferMin: config.bufferMin ?? 0,
        maxSubmissions: configThemen?.maxSubmissions || config.maxSubmissions || 5
    });
    const [configDirty, setConfigDirty] = useState(false);

    // Sync maxSubmissions from sheet when configThemen loads
    useEffect(() => {
        if (configThemen?.maxSubmissions) {
            setLocalConfig(prev => ({ ...prev, maxSubmissions: configThemen.maxSubmissions }));
        }
    }, [configThemen?.maxSubmissions]);

    // --- Stage editing ---
    const [localStages, setLocalStages] = useState(stages);
    const [stagesDirty, setStagesDirty] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    useEffect(() => { setLocalStages(stages); setStagesDirty(false); }, [stages]);

    const updateStage = (id, field, value) => {
        setLocalStages(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
        setStagesDirty(true);
    };
    const deleteStage = (id) => {
        if (!window.confirm('Bühne wirklich löschen? Zugewiesene Sessions verlieren ihre Bühne.')) return;
        setLocalStages(prev => prev.filter(s => s.id !== id));
        setStagesDirty(true);
    };
    const addStage = () => {
        if (!newStageName.trim()) return;
        const id = `st-${Date.now()}`;
        setLocalStages(prev => [...prev, { id, name: newStageName.trim(), capacity: '', maxMics: 4, hidden: false }]);
        setNewStageName('');
        setStagesDirty(true);
    };

    // --- Config_Themen editing ---
    const [localThemen, setLocalThemen] = useState(configThemen);
    const [themenDirty, setThemenDirty] = useState(false);
    const [newItems, setNewItems] = useState({ bereiche: '', themen: '', tags: '', formate: '' });
    useEffect(() => { setLocalThemen(configThemen); setThemenDirty(false); }, [configThemen]);

    const addThemenItem = (category) => {
        const val = newItems[category]?.trim();
        if (!val) return;
        if (localThemen[category]?.includes(val)) return;
        setLocalThemen(prev => ({ ...prev, [category]: [...(prev[category] || []), val] }));
        setNewItems(prev => ({ ...prev, [category]: '' }));
        setThemenDirty(true);
    };
    const removeThemenItem = (category, item) => {
        setLocalThemen(prev => ({ ...prev, [category]: (prev[category] || []).filter(i => i !== item) }));
        setThemenDirty(true);
    };

    const handleConfigChange = (key, value) => {
        const num = parseInt(value);
        if (isNaN(num)) return;
        setLocalConfig(prev => ({ ...prev, [key]: num }));
        setConfigDirty(true);
    };

    const handleSaveConfig = () => {
        if (onUpdateConfig) {
            onUpdateConfig(localConfig);
            setConfigDirty(false);
        }
    };

    const categoryLabels = {
        bereiche: { label: 'Festivalbereiche', icon: MapPin, color: 'indigo' },
        formate: { label: 'Formate', icon: Mic, color: 'emerald' },
        themen: { label: 'Themen', icon: Tag, color: 'amber' },
        tags: { label: 'Tags', icon: Tag, color: 'rose' }
    };

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-5xl mx-auto space-y-8">
                {/* HEADER */}
                <div className="flex justify-between items-end">
                    <div>
                        <h2 className="k-h2 flex items-center gap-3">
                            <Shield className="w-8 h-8 text-[var(--k-accent-teal)]" />
                            Admin Control Center
                        </h2>
                        <p className="k-caption mt-1">Verwalte Nutzer, Bühnen, Themen und Open Call.</p>
                    </div>
                    {/* OPEN CALL TOGGLE */}
                    <button
                        onClick={readOnly ? undefined : onToggleOpenCall}
                        disabled={readOnly}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md active:scale-95 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''} ${openCallClosed
                            ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200'
                            }`}
                    >
                        {openCallClosed ? <ToggleLeft className="w-5 h-5" /> : <ToggleRight className="w-5 h-5" />}
                        Open Call: {openCallClosed ? 'Geschlossen' : 'Offen'}
                    </button>
                </div>

                {readOnly && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
                        <Eye className="w-4 h-4 text-amber-600" />
                        <span className="text-sm text-amber-700 font-medium">Nur Lesezugriff — Änderungen sind ADMINs vorbehalten.</span>
                    </div>
                )}

                {/* SCHEDULE CONTROL */}
                <div className="k-panel-glass text-white border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-[var(--k-accent-teal)]" />
                            Programmeinstellungen
                        </h3>
                        {configDirty && !readOnly && (
                            <button
                                onClick={handleSaveConfig}
                                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                            >
                                <Save className="w-3.5 h-3.5" />
                                Speichern
                            </button>
                        )}
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="k-caption tracking-widest block mb-2">
                                    Programmstart (Uhr)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={0} max={23} value={localConfig.startHour}
                                        onChange={e => handleConfigChange('startHour', e.target.value)}
                                        className="w-24 k-input px-4 py-2.5 text-lg text-center" />
                                    <span className="text-[#161616]/40 text-sm">:00 Uhr</span>
                                </div>
                                <p className="text-[10px] text-[#161616]/60 mt-1.5">Timeline beginnt hier</p>
                            </div>
                            <div>
                                <label className="k-caption tracking-widest block mb-2">
                                    Programmende (Uhr)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={1} max={24} value={localConfig.endHour}
                                        onChange={e => handleConfigChange('endHour', e.target.value)}
                                        className="w-24 k-input px-4 py-2.5 text-lg text-center" />
                                    <span className="text-[#161616]/40 text-sm">:00 Uhr</span>
                                </div>
                                <p className="text-[10px] text-[#161616]/60 mt-1.5">Timeline endet hier</p>
                            </div>
                            <div>
                                <label className="k-caption tracking-widest block mb-2">
                                    Pausenzeit (Minuten)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={0} max={60} value={localConfig.bufferMin}
                                        onChange={e => handleConfigChange('bufferMin', e.target.value)}
                                        className="w-24 k-input px-4 py-2.5 text-lg text-center" />
                                    <span className="text-[#161616]/40 text-sm">min</span>
                                </div>
                                <p className="text-[10px] text-[#161616]/60 mt-1.5">Mindestpause zwischen Sessions</p>
                            </div>
                            <div>
                                <label className="k-caption tracking-widest block mb-2">
                                    Max Einreichungen
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={1} max={50} value={localConfig.maxSubmissions || 5}
                                        onChange={e => handleConfigChange('maxSubmissions', parseInt(e.target.value) || 5)}
                                        className="w-24 k-input px-4 py-2.5 text-lg text-center" />
                                    <span className="text-[#161616]/40 text-sm">pro User</span>
                                </div>
                                <p className="text-[10px] text-[#161616]/60 mt-1.5">Max. Session-Einreichungen pro Person</p>
                            </div>
                        </div>
                        {localConfig.startHour >= localConfig.endHour && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 font-medium">
                                ⚠️ Programmstart muss vor Programmende liegen.
                            </div>
                        )}
                    </div>
                </div>

                {/* ROLE MANAGEMENT */}
                <div className="k-panel-glass text-white border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                            <Users className="w-5 h-5 text-[var(--k-accent-teal)]" />
                            User & Role Management
                        </h3>
                    </div>
                    <div className="p-6">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-bold text-white/60 uppercase tracking-widest border-b border-white/10">
                                    <th className="pb-3 px-2">Email Address</th>
                                    <th className="pb-3 px-2">Assigned Role</th>
                                    <th className="pb-3 px-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10 text-sm">
                                {users.map(user => (
                                    <tr key={user.email} className="hover:bg-white/5 transition-colors">
                                        <td className="py-4 px-2 font-medium text-white">{user.email}</td>
                                        <td className="py-4 px-2">
                                            <div className="flex flex-wrap gap-1">
                                                {['ADMIN', 'CURATOR', 'REVIEWER', 'ORGANISATION', 'SPRECHERIN', 'TEILNEHMENDE', 'SPEAKER', 'PRODUCTION', 'BAND', 'GUEST'].map(role => {
                                                    const userRolesArr = (user.role || '').split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
                                                    const hasThis = userRolesArr.includes(role);
                                                    return (
                                                        <button key={role} onClick={() => {
                                                            let newRoles;
                                                            if (hasThis) {
                                                                newRoles = userRolesArr.filter(r => r !== role);
                                                                if (newRoles.length === 0) newRoles = ['GUEST'];
                                                            } else {
                                                                newRoles = [...userRolesArr.filter(r => r !== 'GUEST'), role];
                                                            }
                                                            onUpdateUserRole(user.email, newRoles.join(','));
                                                        }}
                                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all cursor-pointer ${hasThis
                                                                ? role === 'ADMIN' ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                                                                    : role === 'CURATOR' ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                                                                        : role === 'REVIEWER' ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                                                                            : 'bg-[var(--k-accent-teal)]/20 text-[var(--k-accent-teal)] ring-1 ring-[var(--k-accent-teal)]/50'
                                                                : 'bg-white/5 text-[#161616]/40 hover:bg-white/10'}`}>
                                                            {role}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="py-4 px-2 text-right flex items-center gap-1 justify-end">
                                            {!readOnly && onInviteUser && (
                                                <button onClick={() => onInviteUser(user.email)}
                                                    className="p-2 text-[#161616]/40 hover:text-[var(--k-accent-teal)] transition-colors" title="Magic Link senden">
                                                    <Send className="w-4 h-4" />
                                                </button>
                                            )}
                                            {!readOnly && (
                                                <button onClick={() => onDeleteUser(user.email)}
                                                    className="p-2 text-[#161616]/40 hover:text-red-400 transition-colors" title="Delete User">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {!readOnly && (
                                    <tr className="bg-black/20">
                                        <td className="py-4 px-2">
                                            <input type="email" placeholder="new-user@example.com" value={newUserEmail}
                                                onChange={(e) => setNewUserEmail(e.target.value)}
                                                className="w-full k-input px-3 py-1.5 text-xs" />
                                        </td>
                                        <td className="py-4 px-2">
                                            <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}
                                                className="text-xs font-bold py-1.5 px-2 rounded k-input cursor-pointer">
                                                <option value="ADMIN">ADMIN</option>
                                                <option value="CURATOR">CURATOR</option>
                                                <option value="REVIEWER">REVIEWER</option>
                                                <option value="ORGANISATION">ORGANISATION</option>
                                                <option value="SPRECHERIN">SPRECHERIN</option>
                                                <option value="TEILNEHMENDE">TEILNEHMENDE</option>
                                                <option value="SPEAKER">SPEAKER</option>
                                                <option value="PRODUCTION">PRODUCTION</option>
                                                <option value="BAND">BAND</option>
                                                <option value="GUEST">GUEST</option>
                                            </select>
                                        </td>
                                        <td className="py-4 px-2 text-right">
                                            <button
                                                onClick={() => { if (newUserEmail) { onAddUser(newUserEmail, newUserRole); setNewUserEmail(''); } }}
                                                className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700 transition-all flex items-center gap-2 text-xs font-bold ml-auto shadow-md active:scale-95">
                                                <Plus className="w-3.5 h-3.5" /> Add User
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* STAGE MANAGEMENT */}
                <div className="k-panel-glass text-white border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-[var(--k-accent-teal)]" />
                            Bühnen-Verwaltung
                        </h3>
                        {stagesDirty && (
                            <button onClick={() => onSaveStages(localStages)}
                                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md active:scale-95">
                                <Save className="w-3.5 h-3.5" /> Änderungen speichern
                            </button>
                        )}
                    </div>
                    <div className="p-6">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-bold text-white/60 uppercase tracking-widest border-b border-white/10">
                                    <th className="pb-3 px-2">Name</th>
                                    <th className="pb-3 px-2 w-24">Kapazität</th>
                                    <th className="pb-3 px-2 w-24">Max Mics</th>
                                    <th className="pb-3 px-2 w-24 text-center">Sichtbar</th>
                                    <th className="pb-3 px-2 w-16 text-right">Aktion</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10 text-sm">
                                {localStages.map(stage => (
                                    <tr key={stage.id} className={`hover:bg-white/5 transition-colors ${stage.hidden ? 'opacity-50' : ''}`}>
                                        <td className="py-3 px-2">
                                            <input type="text" value={stage.name}
                                                onChange={e => updateStage(stage.id, 'name', e.target.value)}
                                                className="w-full bg-transparent border-b border-transparent hover:border-white/30 focus:border-[var(--k-accent-teal)] outline-none py-1 font-medium text-white" />
                                        </td>
                                        <td className="py-3 px-2">
                                            <input type="number" min={0} value={stage.capacity || ''}
                                                onChange={e => updateStage(stage.id, 'capacity', e.target.value)}
                                                className="w-20 k-input px-2 py-1 text-xs text-center" />
                                        </td>
                                        <td className="py-3 px-2">
                                            <input type="number" min={0} max={20} value={stage.maxMics || 4}
                                                onChange={e => updateStage(stage.id, 'maxMics', parseInt(e.target.value) || 0)}
                                                className="w-20 k-input px-2 py-1 text-xs text-center" />
                                        </td>
                                        <td className="py-3 px-2 text-center">
                                            <button onClick={() => updateStage(stage.id, 'hidden', !stage.hidden)}
                                                className={`p-1.5 rounded transition-colors ${stage.hidden ? 'text-red-400 hover:text-red-300 bg-red-900/40' : 'text-emerald-400 hover:text-emerald-300 bg-emerald-900/40'}`}
                                                title={stage.hidden ? 'Versteckt — klicken zum Anzeigen' : 'Sichtbar — klicken zum Verstecken'}>
                                                {stage.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            <button onClick={() => deleteStage(stage.id)}
                                                className="p-1.5 text-[#161616]/40 hover:text-red-400 transition-colors" title="Bühne löschen">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-black/20">
                                    <td className="py-3 px-2" colSpan={3}>
                                        <input type="text" placeholder="Neue Bühne..." value={newStageName}
                                            onChange={e => setNewStageName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addStage()}
                                            className="w-full k-input px-3 py-1.5 text-xs" />
                                    </td>
                                    <td className="py-3 px-2 text-right" colSpan={2}>
                                        <button onClick={addStage}
                                            className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700 transition-all flex items-center gap-2 text-xs font-bold ml-auto shadow-md active:scale-95">
                                            <Plus className="w-3.5 h-3.5" /> Hinzufügen
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* CONFIG_THEMEN MANAGEMENT */}
                <div className="k-panel-glass text-white border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                            <Tag className="w-5 h-5 text-[var(--k-accent-teal)]" />
                            Festivalbereiche & Themen
                        </h3>
                        {themenDirty && (
                            <button onClick={() => { onSaveConfigThemen(localThemen); setThemenDirty(false); }}
                                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md active:scale-95">
                                <Save className="w-3.5 h-3.5" /> Änderungen speichern
                            </button>
                        )}
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries(categoryLabels).map(([key, { label, icon: Icon, color }]) => (
                            <div key={key} className="border border-white/10 rounded-lg p-4">
                                <h4 className="k-caption mb-3 flex items-center gap-2">
                                    <Icon className="w-4 h-4 text-[var(--k-accent-teal)]" />
                                    {label}
                                </h4>
                                <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
                                    {(localThemen[key] || []).map(item => (
                                        <span key={item}
                                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full
                                                ${color === 'indigo' ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' : ''}
                                                ${color === 'emerald' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : ''}
                                                ${color === 'amber' ? 'bg-amber-100 text-amber-800 border border-amber-300' : ''}
                                                ${color === 'rose' ? 'bg-rose-100 text-rose-800 border border-rose-300' : ''}
                                            `}>
                                            {item}
                                            <button onClick={() => removeThemenItem(key, item)}
                                                className={`ml-0.5 hover:text-red-600 transition-colors`}>×</button>
                                        </span>
                                    ))}
                                    {(!localThemen[key] || localThemen[key].length === 0) && (
                                        <span className="text-xs text-slate-400 italic">Keine Einträge</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" placeholder={`${label} hinzufügen...`}
                                        value={newItems[key] || ''}
                                        onChange={e => setNewItems(prev => ({ ...prev, [key]: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && addThemenItem(key)}
                                        className="flex-1 k-input px-3 py-1.5 text-xs" />
                                    <button onClick={() => addThemenItem(key)}
                                        className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 p-1.5 rounded transition-colors">
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* DATA EXPORT */}
                <div className="k-panel-glass text-white border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                            <Download className="w-5 h-5 text-[var(--k-accent-teal)]" />
                            Daten-Export
                        </h3>
                    </div>
                    <div className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-white">Mail-Merge CSV Export</p>
                                <p className="k-caption mt-1">Komma-sichere CSV mit allen Programmdaten und Speaker-Emails.</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (!curationApiUrl) { alert('Keine Curation API URL konfiguriert.'); return; }
                                    const sep = curationApiUrl.includes('?') ? '&' : '?';
                                    window.open(`${curationApiUrl}${sep}action=exportCSV&email=${encodeURIComponent(userEmail)}`, '_blank');
                                }}
                                disabled={!curationApiUrl}
                                className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md active:scale-95">
                                <Download className="w-4 h-4" /> CSV herunterladen
                            </button>
                        </div>
                    </div>
                </div>

                {/* INFO */}
                <div className="bg-[var(--k-accent-teal)]/10 border border-[var(--k-accent-teal)]/30 rounded-lg p-4 flex gap-3 items-start">
                    <ChevronRight className="w-5 h-5 text-[var(--k-accent-teal)] shrink-0" />
                    <div className="text-white leading-relaxed text-xs">
                        <strong>Hinweis:</strong> Alle Änderungen an Nutzern, Bühnen und Themen werden über den sicheren n8n-Proxy direkt ins Google Sheet geschrieben. Der Open-Call-Status steuert, ob neue Session-Einreichungen möglich sind.
                    </div>
                </div>
            </div>
        </div>
    );
}
