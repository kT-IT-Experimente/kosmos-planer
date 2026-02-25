import React, { useState, useEffect } from 'react';
import { UserCog, Shield, Lock, Users, ChevronRight, Save, Trash2, Plus, Clock, Settings, Download, Eye, EyeOff, Tag, Mic, MapPin, ToggleLeft, ToggleRight, Send, Loader2 } from 'lucide-react';

export default function AdminDashboard({
    users = [], stages = [], config = {}, configThemen = {},
    onUpdateUserRole, onDeleteUser, onAddUser, onUpdateConfig,
    onSaveStages, onSaveConfigThemen,
    openCallClosed = false, onToggleOpenCall, onInviteUser,
    curationApiUrl = '', userEmail = ''
}) {
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState('REVIEWER');
    const [localConfig, setLocalConfig] = useState({
        startHour: config.startHour ?? 8,
        endHour: config.endHour ?? 22,
        bufferMin: config.bufferMin ?? 0
    });
    const [configDirty, setConfigDirty] = useState(false);

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
        <div className="flex-1 overflow-auto bg-slate-50 p-6 custom-scrollbar">
            <div className="max-w-5xl mx-auto space-y-8">
                {/* HEADER */}
                <div className="flex justify-between items-end">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                            <Shield className="w-8 h-8 text-indigo-600" />
                            Admin Control Center
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">Verwalte Nutzer, Bühnen, Themen und Open Call.</p>
                    </div>
                    {/* OPEN CALL TOGGLE */}
                    <button
                        onClick={onToggleOpenCall}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md active:scale-95 ${openCallClosed
                            ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200'
                            }`}
                    >
                        {openCallClosed ? <ToggleLeft className="w-5 h-5" /> : <ToggleRight className="w-5 h-5" />}
                        Open Call: {openCallClosed ? 'Geschlossen' : 'Offen'}
                    </button>
                </div>

                {/* SCHEDULE CONTROL */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-indigo-500" />
                            Programmeinstellungen
                        </h3>
                        {configDirty && (
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
                                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest">
                                    Programmstart (Uhr)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={0} max={23} value={localConfig.startHour}
                                        onChange={e => handleConfigChange('startHour', e.target.value)}
                                        className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-700 text-center outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                    <span className="text-slate-400 text-sm">:00 Uhr</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5">Timeline beginnt hier</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest">
                                    Programmende (Uhr)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={1} max={24} value={localConfig.endHour}
                                        onChange={e => handleConfigChange('endHour', e.target.value)}
                                        className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-700 text-center outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                    <span className="text-slate-400 text-sm">:00 Uhr</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5">Timeline endet hier</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest">
                                    Pausenzeit (Minuten)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={0} max={60} value={localConfig.bufferMin}
                                        onChange={e => handleConfigChange('bufferMin', e.target.value)}
                                        className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-700 text-center outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                    <span className="text-slate-400 text-sm">min</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5">Mindestpause zwischen Sessions</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest">
                                    Max Einreichungen
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={1} max={50} value={localConfig.maxSubmissions || 10}
                                        onChange={e => handleConfigChange('maxSubmissions', parseInt(e.target.value) || 10)}
                                        className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-700 text-center outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                                    <span className="text-slate-400 text-sm">pro User</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5">Max. Session-Einreichungen pro Person</p>
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-500" />
                            User & Role Management
                        </h3>
                    </div>
                    <div className="p-6">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b">
                                    <th className="pb-3 px-2">Email Address</th>
                                    <th className="pb-3 px-2">Assigned Role</th>
                                    <th className="pb-3 px-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-sm">
                                {users.map(user => (
                                    <tr key={user.email} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-4 px-2 font-medium text-slate-700">{user.email}</td>
                                        <td className="py-4 px-2">
                                            <div className="flex flex-wrap gap-1">
                                                {['ADMIN', 'CURATOR', 'REVIEWER', 'SPRECHERIN', 'TEILNEHMENDE', 'SPEAKER', 'PRODUCTION', 'PARTNER', 'BAND', 'GUEST'].map(role => {
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
                                                                ? role === 'ADMIN' ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                                                                    : role === 'CURATOR' ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
                                                                        : role === 'REVIEWER' ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                                                                            : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                                                                : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}>
                                                            {role}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="py-4 px-2 text-right flex items-center gap-1 justify-end">
                                            {onInviteUser && (
                                                <button onClick={() => onInviteUser(user.email)}
                                                    className="p-2 text-slate-300 hover:text-indigo-600 transition-colors" title="Magic Link senden">
                                                    <Send className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button onClick={() => onDeleteUser(user.email)}
                                                className="p-2 text-slate-300 hover:text-red-500 transition-colors" title="Delete User">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-indigo-50/30">
                                    <td className="py-4 px-2">
                                        <input type="email" placeholder="new-user@example.com" value={newUserEmail}
                                            onChange={(e) => setNewUserEmail(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    </td>
                                    <td className="py-4 px-2">
                                        <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}
                                            className="text-xs font-bold py-1.5 px-2 rounded border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                                            <option value="ADMIN">ADMIN</option>
                                            <option value="CURATOR">CURATOR</option>
                                            <option value="REVIEWER">REVIEWER</option>
                                            <option value="SPRECHERIN">SPRECHERIN</option>
                                            <option value="TEILNEHMENDE">TEILNEHMENDE</option>
                                            <option value="SPEAKER">SPEAKER</option>
                                            <option value="PRODUCTION">PRODUCTION</option>
                                            <option value="PARTNER">PARTNER</option>
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
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* STAGE MANAGEMENT */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-indigo-500" />
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
                                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b">
                                    <th className="pb-3 px-2">Name</th>
                                    <th className="pb-3 px-2 w-24">Kapazität</th>
                                    <th className="pb-3 px-2 w-24">Max Mics</th>
                                    <th className="pb-3 px-2 w-24 text-center">Sichtbar</th>
                                    <th className="pb-3 px-2 w-16 text-right">Aktion</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-sm">
                                {localStages.map(stage => (
                                    <tr key={stage.id} className={`hover:bg-slate-50 transition-colors ${stage.hidden ? 'opacity-50' : ''}`}>
                                        <td className="py-3 px-2">
                                            <input type="text" value={stage.name}
                                                onChange={e => updateStage(stage.id, 'name', e.target.value)}
                                                className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none py-1 font-medium text-slate-700" />
                                        </td>
                                        <td className="py-3 px-2">
                                            <input type="number" min={0} value={stage.capacity || ''}
                                                onChange={e => updateStage(stage.id, 'capacity', e.target.value)}
                                                className="w-20 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-center outline-none focus:ring-2 focus:ring-indigo-500" />
                                        </td>
                                        <td className="py-3 px-2">
                                            <input type="number" min={0} max={20} value={stage.maxMics || 4}
                                                onChange={e => updateStage(stage.id, 'maxMics', parseInt(e.target.value) || 0)}
                                                className="w-20 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-center outline-none focus:ring-2 focus:ring-indigo-500" />
                                        </td>
                                        <td className="py-3 px-2 text-center">
                                            <button onClick={() => updateStage(stage.id, 'hidden', !stage.hidden)}
                                                className={`p-1.5 rounded transition-colors ${stage.hidden ? 'text-red-400 hover:text-red-600 bg-red-50' : 'text-emerald-500 hover:text-emerald-700 bg-emerald-50'}`}
                                                title={stage.hidden ? 'Versteckt — klicken zum Anzeigen' : 'Sichtbar — klicken zum Verstecken'}>
                                                {stage.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            <button onClick={() => deleteStage(stage.id)}
                                                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors" title="Bühne löschen">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-indigo-50/30">
                                    <td className="py-3 px-2" colSpan={3}>
                                        <input type="text" placeholder="Neue Bühne..." value={newStageName}
                                            onChange={e => setNewStageName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addStage()}
                                            className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-indigo-500" />
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
                            <div key={key} className="border border-slate-100 rounded-lg p-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </h4>
                                <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
                                    {(localThemen[key] || []).map(item => (
                                        <span key={item}
                                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-${color}-50 text-${color}-700 border border-${color}-100`}>
                                            {item}
                                            <button onClick={() => removeThemenItem(key, item)}
                                                className={`ml-0.5 hover:text-${color}-900 transition-colors`}>×</button>
                                        </span>
                                    ))}
                                    {(!localThemen[key] || localThemen[key].length === 0) && (
                                        <span className="text-xs text-slate-300 italic">Keine Einträge</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" placeholder={`${label} hinzufügen...`}
                                        value={newItems[key] || ''}
                                        onChange={e => setNewItems(prev => ({ ...prev, [key]: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && addThemenItem(key)}
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    <button onClick={() => addThemenItem(key)}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded transition-colors">
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* DATA EXPORT */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Download className="w-5 h-5 text-indigo-500" />
                            Daten-Export
                        </h3>
                    </div>
                    <div className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-700">Mail-Merge CSV Export</p>
                                <p className="text-xs text-slate-400 mt-1">Komma-sichere CSV mit allen Programmdaten und Speaker-Emails.</p>
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
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 items-start">
                    <ChevronRight className="w-5 h-5 text-blue-500 shrink-0" />
                    <div className="text-xs text-blue-700 leading-relaxed">
                        <strong>Hinweis:</strong> Alle Änderungen an Nutzern, Bühnen und Themen werden über den sicheren n8n-Proxy direkt ins Google Sheet geschrieben. Der Open-Call-Status steuert, ob neue Session-Einreichungen möglich sind.
                    </div>
                </div>
            </div>
        </div>
    );
}
