import React, { useState, useMemo } from 'react';
import {
    Search, Filter, ChevronDown, ChevronUp, Star, MessageSquare,
    Users, CheckCircle2, XCircle, AlertCircle, LayoutDashboard
} from 'lucide-react';

const CurationDashboard = ({ sessions = [], metadata = {}, userRole = 'GUEST', ratings = {}, onUpdateStatus, onUpdateMetadata, onSaveRating }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ bereich: '', thema: '', status: '', format: '', tag: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'average_score', direction: 'desc' });
    const [expandedSession, setExpandedSession] = useState(null);
    const [editingCell, setEditingCell] = useState(null); // { id, field }

    const config = useMemo(() => ({
        bereiche: metadata.bereiche || [],
        themen: metadata.themen || [],
        tags: metadata.tags || [],
        formate: metadata.formate || []
    }), [metadata]);

    const lists = useMemo(() => {
        const getUnique = (key, defaults) => {
            const fromData = [...new Set(sessions.map(s => s[key]))].filter(Boolean);
            return [...new Set([...defaults, ...fromData])];
        };
        return {
            bereiche: getUnique('bereich', config.bereiche),
            themen: getUnique('thema', config.themen),
            formate: getUnique('format', config.formate),
            tags: getUnique('tags', config.tags)
        };
    }, [sessions, config]);

    const canEdit = userRole === 'ADMIN' || userRole === 'CURATOR';

    // Merge ratings data into sessions
    const sessionsWithRatings = useMemo(() => {
        return sessions.map(s => {
            const sessionRatings = ratings[s.id] || [];
            const scores = sessionRatings.map(r => r.score).filter(s => s > 0);
            const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
            return {
                ...s,
                average_score: avg || s.average_score || null,
                review_count: sessionRatings.length || s.review_count || 0,
                _ratings: sessionRatings
            };
        });
    }, [sessions, ratings]);

    const processedSessions = useMemo(() => {
        return sessionsWithRatings
            .filter(s => {
                const matchesSearch =
                    (s.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (s.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (s.speakers || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (s.description || '').toLowerCase().includes(searchQuery.toLowerCase());

                const matchesBereich = !filters.bereich || s.bereich === filters.bereich;
                const matchesThema = !filters.thema || s.thema === filters.thema;
                const matchesFormat = !filters.format || s.format === filters.format;
                const matchesStatus = !filters.status || s.status === filters.status;

                return matchesSearch && matchesBereich && matchesThema && matchesFormat && matchesStatus;
            })
            .sort((a, b) => {
                if (!sortConfig.key) return 0;
                let aVal = a[sortConfig.key] || '';
                let bVal = b[sortConfig.key] || '';

                if (sortConfig.key === 'average_score' || sortConfig.key === 'review_count') {
                    return sortConfig.direction === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
                }

                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [sessionsWithRatings, searchQuery, filters, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const isConflict = (key, value) => {
        if (!value) return false;
        if (key === 'bereich') return !config.bereiche.includes(value);
        if (key === 'thema') return !config.themen.includes(value);
        if (key === 'format') return !config.formate.includes(value);
        return false;
    };

    const EditableCell = ({ session, field, value, options, listKey }) => {
        const isEditing = editingCell?.id === session.id && editingCell?.field === field;
        const hasConflict = isConflict(field, value);

        if (isEditing && canEdit) {
            return (
                <div className="flex flex-col animate-in fade-in duration-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{field}</span>
                    <select
                        autoFocus
                        className="text-xs font-bold bg-white border border-indigo-300 rounded px-1 py-0.5 outline-none ring-2 ring-indigo-100"
                        value={value || ''}
                        onBlur={() => setEditingCell(null)}
                        onChange={(e) => {
                            onUpdateMetadata(session.id, field, e.target.value);
                            setEditingCell(null);
                        }}
                    >
                        <option value="">- Wählen -</option>
                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
            );
        }

        return (
            <div
                className={`flex flex-col group/cell ${canEdit ? 'cursor-pointer' : ''}`}
                onClick={() => canEdit && setEditingCell({ id: session.id, field })}
            >
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                    {field}
                    {canEdit && <Search className="w-2 h-2 opacity-0 group-hover/cell:opacity-100 transition-opacity" />}
                </span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded transition-colors ${hasConflict ? 'bg-red-100 text-red-700 border border-red-200' :
                    canEdit ? 'group-hover/cell:bg-indigo-50 text-slate-700' : 'text-slate-700'
                    }`}>
                    {value || '-'}
                </span>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 p-6 overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard className="text-indigo-600 w-8 h-8" /> Curation Center Dashboard
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Angemeldet als: <span className="font-bold text-slate-600 uppercase tracking-tighter">{userRole}</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <span className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">
                        {processedSessions.length} Vorschläge
                    </span>
                </div>
            </div>

            {/* FILTERS & SEARCH */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[250px]">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block tracking-widest">Suche</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all"
                            placeholder="Titel, Speaker, ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="w-40">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block tracking-widest">Bereich</label>
                    <select
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none appearance-none"
                        value={filters.bereich}
                        onChange={(e) => setFilters(prev => ({ ...prev, bereich: e.target.value }))}
                    >
                        <option value="">Alle</option>
                        {lists.bereiche.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>

                <div className="w-40">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block tracking-widest">Thema</label>
                    <select
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none appearance-none"
                        value={filters.thema}
                        onChange={(e) => setFilters(prev => ({ ...prev, thema: e.target.value }))}
                    >
                        <option value="">Alle</option>
                        {lists.themen.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                <div className="w-40">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block tracking-widest">Format</label>
                    <select
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none appearance-none"
                        value={filters.format}
                        onChange={(e) => setFilters(prev => ({ ...prev, format: e.target.value }))}
                    >
                        <option value="">Alle</option>
                        {lists.formate.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>

                <div className="w-40">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block tracking-widest">Status</label>
                    <select
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none appearance-none"
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    >
                        <option value="">Alle</option>
                        <option value="Vorschlag">Vorschlag</option>
                        <option value="Akzeptiert">Akzeptiert</option>
                        <option value="Abgelehnt">Abgelehnt</option>
                    </select>
                </div>
            </div>

            {/* TABLE */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col font-sans">
                <div className="overflow-x-auto overflow-y-auto custom-scrollbar">
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                                <th className="p-4 text-left font-bold text-slate-500 uppercase text-[10px] tracking-widest cursor-pointer w-24" onClick={() => handleSort('id')}>ID</th>
                                <th className="p-4 text-left font-bold text-slate-500 uppercase text-[10px] tracking-widest cursor-pointer" onClick={() => handleSort('title')}>Session & Beschreibung</th>
                                <th className="p-4 text-left font-bold text-slate-500 uppercase text-[10px] tracking-widest">Details</th>
                                <th className="p-4 text-center font-bold text-slate-500 uppercase text-[10px] tracking-widest cursor-pointer" onClick={() => handleSort('average_score')}>∅ Score</th>
                                <th className="p-4 text-center font-bold text-slate-500 uppercase text-[10px] tracking-widest w-20">Rev.</th>
                                <th className="p-4 text-center font-bold text-slate-500 uppercase text-[10px] tracking-widest cursor-pointer" onClick={() => handleSort('status')}>Status</th>
                                <th className="p-4 text-right font-bold text-slate-500 uppercase text-[10px] tracking-widest">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {processedSessions.map(session => {
                                const isExpanded = expandedSession === session.id;
                                const displayShortDesc = session.shortDescription || (session.description || '').substring(0, 300) + (session.description?.length > 300 ? '...' : '');

                                return (
                                    <React.Fragment key={session.id}>
                                        <tr className={`hover:bg-slate-50/80 transition-all group ${isExpanded ? 'bg-indigo-50/50' : ''}`}>
                                            <td className="p-4 font-mono text-[9px] text-slate-400 align-top">{session.id}</td>
                                            <td className="p-4 max-w-xl align-top">
                                                <div className="font-extrabold text-slate-800 text-base leading-tight mb-1">{session.title}</div>
                                                <div className="text-xs text-indigo-600 font-bold flex items-center gap-1.5 mb-3">
                                                    <Users className="w-3.5 h-3.5" /> {session.speakers}
                                                </div>

                                                <div
                                                    className={`p-3 rounded-xl cursor-pointer transition-all border ${isExpanded ? 'bg-white shadow-sm border-indigo-200' : 'bg-slate-50/50 border-transparent hover:border-slate-200'}`}
                                                    onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                                                >
                                                    {isExpanded ? (
                                                        <div className="animate-in fade-in zoom-in-95 duration-200">
                                                            {session.notes && (
                                                                <div className="mb-4 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                                                                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-600 tracking-tighter mb-1">
                                                                        <AlertCircle className="w-3 h-3" /> Interne Notiz (Planung)
                                                                    </div>
                                                                    <p className="text-xs text-amber-800 italic">{session.notes}</p>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-tighter">Beschreibung</span>
                                                                <ChevronUp className="w-4 h-4 text-indigo-400" />
                                                            </div>
                                                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mb-4">{session.description || 'Keine ausführliche Beschreibung vorhanden.'}</p>

                                                            {/* VOTING INTERFACE */}
                                                            <div className="mt-4 pt-4 border-t border-slate-100">
                                                                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-2">
                                                                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                                                    Deine Bewertung
                                                                </h4>
                                                                <div className="flex flex-wrap gap-4 items-center">
                                                                    <div className="flex gap-1">
                                                                        {[1, 2, 3, 4, 5].map(star => (
                                                                            <button
                                                                                key={star}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (onSaveRating) onSaveRating(session.id, star, '');
                                                                                }}
                                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border ${Math.round(session.average_score || 0) >= star
                                                                                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                                                                                    : 'bg-slate-50 border-slate-100 text-slate-300 hover:border-amber-200 hover:text-amber-400'
                                                                                    }`}
                                                                            >
                                                                                <Star className={`w-4 h-4 ${Math.round(session.average_score || 0) >= star ? 'fill-current' : ''}`} />
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    <div className="flex-1 min-w-[200px] relative">
                                                                        <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Kurzer Kommentar..."
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    if (onSaveRating) onSaveRating(session.id, 0, e.target.value);
                                                                                    e.target.value = '';
                                                                                    e.target.blur();
                                                                                }
                                                                            }}
                                                                            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-start gap-3">
                                                            <p className="text-xs text-slate-500 italic flex-1 line-clamp-2">{displayShortDesc || 'Keine Beschreibung'}</p>
                                                            <ChevronDown className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500" />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="space-y-3">
                                                    <EditableCell
                                                        session={session}
                                                        field="format"
                                                        value={session.format}
                                                        options={config.formate}
                                                    />
                                                    <EditableCell
                                                        session={session}
                                                        field="bereich"
                                                        value={session.bereich}
                                                        options={config.bereiche}
                                                    />
                                                    <EditableCell
                                                        session={session}
                                                        field="thema"
                                                        value={session.thema}
                                                        options={config.themen}
                                                    />
                                                </div>
                                            </td>
                                            <td className="p-4 text-center align-top pt-8">
                                                {session.average_score ? (
                                                    <div className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center font-black text-lg border-2 shadow-sm ${Number(session.average_score) >= 4 ? 'bg-green-50 border-green-200 text-green-700' :
                                                        Number(session.average_score) >= 3 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                                                            'bg-red-50 border-red-200 text-red-700'
                                                        }`}>
                                                        {session.average_score}
                                                    </div>
                                                ) : <span className="text-slate-200">-</span>}
                                            </td>
                                            <td className="p-4 text-center align-top pt-9 text-xs font-black text-slate-400">
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center mx-auto border border-slate-100 bg-slate-50">
                                                    {session.review_count || 0}
                                                </div>
                                            </td>
                                            <td className="p-4 text-center align-top pt-9">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border ${session.status === 'Akzeptiert' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    session.status === 'Abgelehnt' ? 'bg-red-100 text-red-700 border-red-200' :
                                                        'bg-amber-100 text-amber-700 border-amber-200'
                                                    }`}>
                                                    {session.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right align-top pt-9">
                                                {canEdit && (
                                                    <div className="flex justify-end gap-1.5">
                                                        <button
                                                            onClick={() => onUpdateStatus(session.id, 'Akzeptiert')}
                                                            className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-green-600 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-100 active:scale-95"
                                                            title="Akzeptieren"
                                                        >
                                                            <CheckCircle2 className="w-4.5 h-4.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => onUpdateStatus(session.id, 'Abgelehnt')}
                                                            className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-red-600 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-100 active:scale-95"
                                                            title="Ablehnen"
                                                        >
                                                            <XCircle className="w-4.5 h-4.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CurationDashboard;
