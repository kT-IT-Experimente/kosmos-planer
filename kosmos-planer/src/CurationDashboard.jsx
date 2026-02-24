import React, { useState, useMemo } from 'react';
import {
    Search, Filter, ChevronDown, ChevronUp, Star, MessageSquare,
    Users, AlertCircle, LayoutDashboard, Send, Clock, Globe
} from 'lucide-react';

const CurationDashboard = ({ sessions = [], metadata = {}, userRole = 'GUEST', userEmail = '', ratings = {}, onUpdateStatus, onUpdateMetadata, onSaveRating }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ bereich: '', thema: '', status: '', format: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'average_score', direction: 'desc' });
    const [expandedSession, setExpandedSession] = useState(null);
    const [expandedReviews, setExpandedReviews] = useState({});
    const [editingCell, setEditingCell] = useState(null);
    // Per-session draft rating state: { [sessionId]: { score, kommentar } }
    const [draftRatings, setDraftRatings] = useState({});

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
            // Find current user's rating
            const myRating = sessionRatings.find(r => r.reviewer?.toLowerCase() === userEmail?.toLowerCase());
            return {
                ...s,
                average_score: avg || s.average_score || null,
                review_count: sessionRatings.length || s.review_count || 0,
                _ratings: sessionRatings,
                _myScore: myRating?.score || 0,
                _myKommentar: myRating?.kommentar || ''
            };
        });
    }, [sessions, ratings, userEmail]);

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

    const getDraftRating = (sessionId) => draftRatings[sessionId] || { score: 0, kommentar: '' };

    const setDraftScore = (sessionId, score) => {
        setDraftRatings(prev => ({
            ...prev,
            [sessionId]: { ...getDraftRating(sessionId), score }
        }));
    };

    const setDraftKommentar = (sessionId, kommentar) => {
        setDraftRatings(prev => ({
            ...prev,
            [sessionId]: { ...getDraftRating(sessionId), kommentar }
        }));
    };

    const submitRating = (sessionId) => {
        const draft = getDraftRating(sessionId);
        if (draft.score === 0 && !draft.kommentar.trim()) return;
        if (onSaveRating) onSaveRating(sessionId, draft.score, draft.kommentar.trim());
        // Clear draft after submit
        setDraftRatings(prev => {
            const next = { ...prev };
            delete next[sessionId];
            return next;
        });
    };

    const isConflict = (key, value) => {
        if (!value) return false;
        if (key === 'bereich') return !config.bereiche.includes(value);
        if (key === 'thema') return !config.themen.includes(value);
        if (key === 'format') return !config.formate.includes(value);
        return false;
    };

    const EditableCell = ({ session, field, value, options }) => {
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

    const SortHeader = ({ label, sortKey, className = '' }) => (
        <th
            className={`p-4 font-bold text-slate-500 uppercase text-[10px] tracking-widest cursor-pointer hover:text-indigo-600 transition-colors ${className}`}
            onClick={() => handleSort(sortKey)}
        >
            <span className="flex items-center gap-1">
                {label}
                {sortConfig.key === sortKey && (
                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                )}
            </span>
        </th>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50 p-6 overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard className="text-indigo-600 w-8 h-8" /> Curation Center
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> {userEmail} · <span className="font-bold text-slate-600 uppercase tracking-tighter">{userRole}</span>
                    </p>
                </div>
                <span className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">
                    {processedSessions.length} Sessions
                </span>
            </div>

            {/* FILTERS & SEARCH */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[250px]">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block tracking-widest">Suche</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-100"
                            placeholder="Titel, Speaker, ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {[
                    { key: 'bereich', label: 'Bereich', options: lists.bereiche },
                    { key: 'thema', label: 'Thema', options: lists.themen },
                    { key: 'format', label: 'Format', options: lists.formate },
                    { key: 'status', label: 'Status', options: ['Vorschlag', 'Akzeptiert', 'Abgelehnt'] }
                ].map(({ key, label, options }) => (
                    <div key={key} className="w-36">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block tracking-widest">{label}</label>
                        <select
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none appearance-none"
                            value={filters[key]}
                            onChange={(e) => setFilters(prev => ({ ...prev, [key]: e.target.value }))}
                        >
                            <option value="">Alle</option>
                            {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                ))}
            </div>

            {/* SESSION CARDS */}
            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-1">
                {processedSessions.map(session => {
                    const isExpanded = expandedSession === session.id;
                    const showReviews = expandedReviews[session.id];
                    const draft = getDraftRating(session.id);
                    const activeScore = draft.score || session._myScore;
                    const displayDesc = session.shortDescription || (session.description || '').substring(0, 200);

                    return (
                        <div key={session.id} className={`bg-white rounded-xl shadow-sm border transition-all ${isExpanded ? 'border-indigo-200 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
                            {/* CARD HEADER — always visible */}
                            <div
                                className="p-5 cursor-pointer flex gap-5 items-start"
                                onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                            >
                                {/* Left: Title + Speaker + Short Desc */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-3 mb-2">
                                        <span className="font-mono text-[9px] text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded shrink-0">{session.id}</span>
                                        <h3 className="font-extrabold text-slate-800 text-base leading-tight">{session.title}</h3>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
                                        <span className="flex items-center gap-1 text-indigo-600 font-bold">
                                            <Users className="w-3 h-3" /> {session.speakers}
                                        </span>
                                        {session.duration && (
                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {session.duration} min</span>
                                        )}
                                        {session.language && (
                                            <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {session.language}</span>
                                        )}
                                    </div>
                                    {!isExpanded && displayDesc && (
                                        <p className="text-xs text-slate-400 italic line-clamp-2">{displayDesc}</p>
                                    )}
                                </div>

                                {/* Right: Metadata + Stats */}
                                <div className="flex items-center gap-4 shrink-0">
                                    {/* Metadata chips */}
                                    <div className="flex flex-col gap-1 text-right">
                                        {session.format && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{session.format}</span>}
                                        {session.bereich && <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{session.bereich}</span>}
                                        {session.thema && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{session.thema}</span>}
                                    </div>

                                    {/* Average Score */}
                                    <div className="text-center">
                                        {session.average_score ? (
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg border-2 shadow-sm ${Number(session.average_score) >= 4 ? 'bg-green-50 border-green-200 text-green-700' :
                                                Number(session.average_score) >= 3 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                                                    'bg-red-50 border-red-200 text-red-700'
                                                }`}>
                                                {session.average_score}
                                            </div>
                                        ) : <div className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-200 border-2 border-slate-100">-</div>}
                                        <span className="text-[9px] text-slate-400 font-bold mt-0.5 block">{session.review_count} Rev.</span>
                                    </div>

                                    {/* My Stars (compact) */}
                                    <div className="flex gap-0.5">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <Star key={star} className={`w-3.5 h-3.5 ${session._myScore >= star ? 'text-amber-500 fill-amber-500' : 'text-slate-200'}`} />
                                        ))}
                                    </div>

                                    {/* Status */}
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border ${session.status === 'Akzeptiert' ? 'bg-green-100 text-green-700 border-green-200' :
                                        session.status === 'Abgelehnt' ? 'bg-red-100 text-red-700 border-red-200' :
                                            'bg-amber-100 text-amber-700 border-amber-200'
                                        }`}>
                                        {session.status}
                                    </span>

                                    {/* Expand chevron */}
                                    {isExpanded ? <ChevronUp className="w-5 h-5 text-indigo-400" /> : <ChevronDown className="w-5 h-5 text-slate-300" />}
                                </div>
                            </div>

                            {/* EXPANDED CONTENT */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {/* Internal Notes */}
                                    {session.notes && (
                                        <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-600 tracking-tighter mb-1">
                                                <AlertCircle className="w-3 h-3" /> Interne Notiz (Planung)
                                            </div>
                                            <p className="text-xs text-amber-800 italic">{session.notes}</p>
                                        </div>
                                    )}

                                    {/* Description — full, scrollable */}
                                    <div className="px-5 pt-4">
                                        <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-tighter mb-2">Beschreibung</h4>
                                        <div className="bg-slate-50 rounded-lg p-4 max-h-60 overflow-y-auto custom-scrollbar">
                                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                {session.description || 'Keine ausführliche Beschreibung vorhanden.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Editable Metadata */}
                                    {canEdit && (
                                        <div className="px-5 pt-4 flex gap-6">
                                            <EditableCell session={session} field="format" value={session.format} options={config.formate} />
                                            <EditableCell session={session} field="bereich" value={session.bereich} options={config.bereiche} />
                                            <EditableCell session={session} field="thema" value={session.thema} options={config.themen} />
                                        </div>
                                    )}

                                    {/* RATING SECTION — combined stars + comment + submit */}
                                    <div className="px-5 pt-5 pb-2">
                                        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-2">
                                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                            Deine Bewertung
                                            {session._myScore > 0 && (
                                                <span className="text-amber-600 normal-case tracking-normal font-bold">
                                                    (aktuell: {session._myScore}★)
                                                </span>
                                            )}
                                        </h4>
                                        <div className="flex items-center gap-4">
                                            {/* Stars */}
                                            <div className="flex gap-1">
                                                {[1, 2, 3, 4, 5].map(star => (
                                                    <button
                                                        key={star}
                                                        onClick={(e) => { e.stopPropagation(); setDraftScore(session.id, star); }}
                                                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border ${activeScore >= star
                                                            ? 'bg-amber-50 border-amber-200 text-amber-600'
                                                            : 'bg-slate-50 border-slate-100 text-slate-300 hover:border-amber-200 hover:text-amber-400'
                                                            }`}
                                                    >
                                                        <Star className={`w-4 h-4 ${activeScore >= star ? 'fill-current' : ''}`} />
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Comment input */}
                                            <div className="flex-1 relative">
                                                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Kommentar zur Bewertung..."
                                                    value={draft.kommentar}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => setDraftKommentar(session.id, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') submitRating(session.id); }}
                                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                                />
                                            </div>

                                            {/* Submit button */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); submitRating(session.id); }}
                                                disabled={activeScore === 0 && !draft.kommentar.trim()}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                                            >
                                                <Send className="w-3.5 h-3.5" /> Absenden
                                            </button>
                                        </div>
                                    </div>

                                    {/* REVIEWS SECTION — collapsible */}
                                    {session._ratings.length > 0 && (
                                        <div className="px-5 pt-3 pb-5">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedReviews(prev => ({ ...prev, [session.id]: !prev[session.id] }));
                                                }}
                                                className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 tracking-widest hover:text-indigo-600 transition-colors"
                                            >
                                                {showReviews ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                {session._ratings.length} Bewertung{session._ratings.length !== 1 ? 'en' : ''} anzeigen
                                            </button>

                                            {showReviews && (
                                                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    {session._ratings.map((r, i) => (
                                                        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${r.reviewer?.toLowerCase() === userEmail?.toLowerCase() ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50/50 border-slate-100'}`}>
                                                            <div className="flex gap-0.5 shrink-0 pt-0.5">
                                                                {[1, 2, 3, 4, 5].map(s => (
                                                                    <Star key={s} className={`w-3 h-3 ${r.score >= s ? 'text-amber-500 fill-amber-500' : 'text-slate-200'}`} />
                                                                ))}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-0.5">
                                                                    <span className="text-[10px] font-bold text-slate-600">
                                                                        {r.reviewer?.toLowerCase() === userEmail?.toLowerCase() ? 'Du' : (r.reviewer || 'Anonym')}
                                                                    </span>
                                                                    <span className="text-[9px] text-slate-300">
                                                                        {r.timestamp ? new Date(r.timestamp).toLocaleDateString('de-DE') : ''}
                                                                    </span>
                                                                </div>
                                                                {r.kommentar && (
                                                                    <p className="text-xs text-slate-600 leading-relaxed">{r.kommentar}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {session._ratings.length === 0 && <div className="pb-4" />}
                                </div>
                            )}
                        </div>
                    );
                })}

                {processedSessions.length === 0 && (
                    <div className="text-center py-20 text-slate-400">
                        <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-bold">Keine Sessions gefunden</p>
                        <p className="text-xs mt-1">Passe die Filter oder die Suche an.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CurationDashboard;
