import React, { useState, useMemo } from 'react';
import {
    Search, ChevronDown, ChevronUp, Star, MessageSquare,
    Users, AlertCircle, LayoutDashboard, Send, Clock, Globe,
    FileText, X, User, Tag, Plus
} from 'lucide-react';

const CurationDashboard = ({
    sessions = [], metadata = {}, userRole = 'GUEST', userEmail = '',
    ratings = {}, speakers = [], users = [],
    onUpdateMetadata, onSaveRating, onAddTag
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ bereich: '', thema: '', status: '', format: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'average_score', direction: 'desc' });
    const [expandedSession, setExpandedSession] = useState(null);
    const [expandedReviews, setExpandedReviews] = useState({});
    const [showLongDesc, setShowLongDesc] = useState({});
    const [editingCell, setEditingCell] = useState(null);
    const [draftRatings, setDraftRatings] = useState({});
    const [speakerPopup, setSpeakerPopup] = useState(null);

    const isAdmin = userRole === 'ADMIN';

    // Build user email->name lookup for displaying reviewer names
    const userNameMap = useMemo(() => {
        const map = {};
        users.forEach(u => { if (u.email) map[u.email.toLowerCase()] = u.name || u.email; });
        return map;
    }, [users]);

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
            formate: getUnique('format', config.formate)
        };
    }, [sessions, config]);

    // Build speaker lookup map
    const speakerMap = useMemo(() => {
        const map = {};
        speakers.forEach(sp => {
            if (sp.fullName) map[sp.fullName.toLowerCase()] = sp;
            if (sp.email) map[sp.email.toLowerCase()] = sp;
        });
        return map;
    }, [speakers]);

    const findSpeaker = (name) => {
        if (!name) return null;
        return speakerMap[name.trim().toLowerCase()] || null;
    };

    // Merge ratings into sessions — use latest score per reviewer for average
    const sessionsWithRatings = useMemo(() => {
        // Extract reviewer's organisation domain for COI detection
        const reviewerDomain = userEmail ? userEmail.split('@')[1]?.toLowerCase() : '';

        return sessions.map(s => {
            const sessionRatings = ratings[s.id] || [];
            // Group by reviewer email, keep only latest score per reviewer for average
            const latestByReviewer = {};
            sessionRatings.forEach(r => {
                const key = (r.reviewer || '').toLowerCase();
                if (!key) return;
                if (!latestByReviewer[key] || r.timestamp > latestByReviewer[key].timestamp) {
                    latestByReviewer[key] = r;
                }
            });
            const latestScores = Object.values(latestByReviewer).map(r => r.score).filter(v => v > 0);
            const avg = latestScores.length > 0 ? (latestScores.reduce((a, b) => a + b, 0) / latestScores.length).toFixed(1) : null;
            const myLatest = latestByReviewer[userEmail?.toLowerCase()];

            // --- COI Check (Cosmoplan Modul 2) ---
            // Detect if current reviewer's organisation matches any speaker's organisation
            let hasCOI = false;
            if (reviewerDomain && reviewerDomain !== 'gmail.com' && reviewerDomain !== 'googlemail.com'
                && reviewerDomain !== 'outlook.com' && reviewerDomain !== 'hotmail.com' && reviewerDomain !== 'gmx.de'
                && reviewerDomain !== 'web.de' && reviewerDomain !== 'yahoo.com' && reviewerDomain !== 'icloud.com') {
                const speakerNames = (s.speakers || '').split(',').map(n => n.trim()).filter(Boolean);
                hasCOI = speakerNames.some(name => {
                    const sp = speakers.find(dbSp => dbSp.fullName?.toLowerCase() === name.toLowerCase());
                    if (!sp) return false;
                    // Check org name match
                    const spOrg = (sp.organisation || '').toLowerCase();
                    if (spOrg && reviewerDomain && spOrg.includes(reviewerDomain.split('.')[0])) return true;
                    // Check email domain match
                    const spDomain = sp.email ? sp.email.split('@')[1]?.toLowerCase() : '';
                    return spDomain && spDomain === reviewerDomain;
                });
            }

            return {
                ...s,
                average_score: avg,
                review_count: Object.keys(latestByReviewer).length,
                _ratings: sessionRatings, // all entries for comments display
                _myScore: myLatest?.score || 0,
                _myKommentar: myLatest?.kommentar || '',
                _hasCOI: hasCOI
            };
        });
    }, [sessions, ratings, userEmail, speakers]);

    const processedSessions = useMemo(() => {
        return sessionsWithRatings
            .filter(s => {
                const q = searchQuery.toLowerCase();
                const matchesSearch = !q ||
                    (s.title || '').toLowerCase().includes(q) ||
                    (s.id || '').toLowerCase().includes(q) ||
                    (s.speakers || '').toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q);
                return matchesSearch &&
                    (!filters.bereich || s.bereich === filters.bereich) &&
                    (!filters.thema || s.thema === filters.thema) &&
                    (!filters.format || s.format === filters.format) &&
                    (!filters.status || s.status === filters.status);
            })
            .sort((a, b) => {
                if (!sortConfig.key) return 0;
                let aVal = a[sortConfig.key] ?? '';
                let bVal = b[sortConfig.key] ?? '';
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
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const getDraft = (id) => draftRatings[id] || { score: 0, kommentar: '' };
    const setDraftScore = (id, score) => setDraftRatings(prev => ({ ...prev, [id]: { ...getDraft(id), score } }));
    const setDraftKommentar = (id, k) => setDraftRatings(prev => ({ ...prev, [id]: { ...getDraft(id), kommentar: k } }));
    const submitRating = (id) => {
        const d = getDraft(id);
        if (d.score === 0 && !d.kommentar.trim()) return;
        if (onSaveRating) onSaveRating(id, d.score, d.kommentar.trim());
        setDraftRatings(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    // Parse speaker names from comma-separated string
    const parseSpeakerNames = (speakerStr) => {
        if (!speakerStr) return [];
        return speakerStr.split(',').map(s => s.trim()).filter(Boolean);
    };

    return (
        <div className="flex flex-col h-full p-6 overflow-hidden">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <p className="k-caption flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> {userEmail} · <span className="font-bold uppercase tracking-tighter">{userRole}</span>
                    </p>
                </div>
                <span className="bg-[var(--k-accent-teal)]/20 text-[var(--k-accent-teal)] border border-[var(--k-accent-teal)]/50 px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm">
                    {processedSessions.length} Sessions
                </span>
            </div>

            {/* FILTERS */}
            <div className="k-panel-glass p-5 mb-6 flex flex-wrap gap-4 items-end text-white border-white/10">
                <div className="flex-1 min-w-[250px]">
                    <label className="k-caption mb-1.5 block">Suche</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#161616]/40 w-4 h-4" />
                        <input type="text" className="k-input pl-10 text-sm py-2.5"
                            placeholder="Titel, Speaker, ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                </div>
                {[
                    { key: 'bereich', label: 'Bereich', options: lists.bereiche },
                    { key: 'thema', label: 'Thema', options: lists.themen },
                    { key: 'format', label: 'Format', options: lists.formate },
                    { key: 'status', label: 'Status', options: ['Vorschlag', 'Eingeladen', 'Akzeptiert', 'Abgelehnt'] }
                ].map(({ key, label, options }) => (
                    <div key={key} className="w-36">
                        <label className="k-caption mb-1.5 block">{label}</label>
                        <select className="k-input text-sm py-2.5 px-3 appearance-none"
                            value={filters[key]} onChange={(e) => setFilters(prev => ({ ...prev, [key]: e.target.value }))}>
                            <option value="">Alle</option>
                            {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                ))}
            </div>

            {/* SORT BAR */}
            <div className="flex gap-4 mb-3 k-caption px-1">
                {[
                    { key: 'title', label: 'Titel' },
                    { key: 'average_score', label: '∅ Score' },
                    { key: 'review_count', label: 'Reviews' },
                    { key: 'status', label: 'Status' }
                ].map(({ key, label }) => (
                    <button key={key} onClick={() => handleSort(key)}
                        className={`flex items-center gap-1 hover:text-[var(--k-accent-teal)] transition-colors ${sortConfig.key === key ? 'text-[var(--k-accent-teal)]' : ''}`}>
                        {label}
                        {sortConfig.key === key && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </button>
                ))}
            </div>

            {/* SESSION CARDS */}
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                {processedSessions.map(session => {
                    const isExpanded = expandedSession === session.id;
                    const showReviews = expandedReviews[session.id];
                    const showLong = showLongDesc[session.id];
                    const draft = getDraft(session.id);
                    const activeScore = draft.score || session._myScore;
                    const speakerNames = parseSpeakerNames(session.speakers);

                    return (
                        <div key={session.id} className={`k-card transition-all ${isExpanded ? 'border-[var(--k-accent-teal)] shadow-lg shadow-[var(--k-accent-teal)]/10' : 'hover:border-white/20'}`}>
                            {/* CARD HEADER */}
                            <div className="p-4 cursor-pointer flex gap-4 items-start" onClick={() => setExpandedSession(isExpanded ? null : session.id)}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-2 mb-1.5">
                                        <span className="font-mono text-[9px] text-[var(--k-accent-teal)] bg-[var(--k-accent-teal)]/10 border border-[var(--k-accent-teal)]/30 px-1.5 py-0.5 rounded shrink-0 mt-0.5">{session.id}</span>
                                        {session._hasCOI && (
                                            <span className="text-[9px] font-bold text-amber-600 bg-amber-100 border border-amber-400 px-1.5 py-0.5 rounded shrink-0 mt-0.5 flex items-center gap-0.5" title="Interessenkonflikt: Deine Organisation stimmt mit einem Speaker überein">
                                                <AlertCircle className="w-3 h-3" /> COI
                                            </span>
                                        )}
                                        <h3 className="font-extrabold text-white text-base leading-tight">{session.title}</h3>
                                    </div>
                                    {/* Speakers — clickable */}
                                    <div className="flex items-center gap-1 text-xs text-[var(--k-accent-teal)] font-bold mb-1.5 flex-wrap">
                                        <Users className="w-3 h-3 shrink-0" />
                                        {speakerNames.map((name, i) => (
                                            <span key={i}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); const sp = findSpeaker(name); setSpeakerPopup(sp || { fullName: name }); }}
                                                    className="hover:underline hover:text-white transition-colors"
                                                >{name}</button>
                                                {i < speakerNames.length - 1 && <span className="text-[#161616]/60 mx-0.5">·</span>}
                                            </span>
                                        ))}
                                    </div>
                                    {/* Short description always visible */}
                                    {session.shortDescription && (
                                        <p className="k-caption line-clamp-2">{session.shortDescription}</p>
                                    )}
                                    {!session.shortDescription && !isExpanded && session.description && (
                                        <p className="k-caption italic line-clamp-2">{session.description.substring(0, 200)}</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    {/* Metadata chips (read-only display) */}
                                    <div className="flex flex-col gap-1 text-right">
                                        {session.format && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{session.format}</span>}
                                        {session.bereich && <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{session.bereich}</span>}
                                        {session.thema && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{session.thema}</span>}
                                    </div>

                                    {/* Meta info */}
                                    <div className="flex flex-col items-center gap-0.5 text-[9px] text-[#161616]/40">
                                        {session.duration && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {session.duration}′</span>}
                                        {session.language && <span className="flex items-center gap-0.5"><Globe className="w-3 h-3" /> {session.language}</span>}
                                    </div>

                                    {/* Average score — only visible after own rating submitted */}
                                    <div className="text-center">
                                        {session._myScore > 0 ? (
                                            session.average_score ? (
                                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg border-2 shadow-sm ${Number(session.average_score) >= 4 ? 'bg-green-500/20 border-green-500/50 text-green-400' :
                                                    Number(session.average_score) >= 3 ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' :
                                                        'bg-red-500/20 border-red-500/50 text-red-400'}`}>
                                                    {session.average_score}
                                                </div>
                                            ) : <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[#161616]/40 border-2 border-white/10 text-sm">—</div>
                                        ) : (
                                            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[#161616]/40 border-2 border-white/10 text-sm" title="Erst nach eigener Bewertung sichtbar">?</div>
                                        )}
                                        <span className="text-[9px] text-[#161616]/40 font-bold mt-0.5 block">{session.review_count || 0} Rev.</span>
                                    </div>

                                    {/* My stars (compact preview) */}
                                    <div className="flex gap-0.5">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <Star key={s} className={`w-3.5 h-3.5 ${session._myScore >= s ? 'text-amber-500 fill-amber-500' : 'text-slate-200'}`} />
                                        ))}
                                    </div>

                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border ${session.status === 'Akzeptiert' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                                        session.status === 'Abgelehnt' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                            'bg-amber-500/20 text-amber-400 border-amber-500/50'}`}>
                                        {session.status}
                                    </span>

                                    {isExpanded ? <ChevronUp className="w-5 h-5 text-[var(--k-accent-teal)]" /> : <ChevronDown className="w-5 h-5 text-[#161616]/40" />}
                                </div>
                            </div>

                            {/* EXPANDED CONTENT */}
                            {isExpanded && (
                                <div className="border-t border-white/10 mt-3 pt-3">
                                    {/* Internal notes */}
                                    {session.notes && (
                                        <div className="mx-5 mt-4 p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg">
                                            <div className="flex items-center gap-1.5 k-caption text-amber-400 mb-1">
                                                <AlertCircle className="w-3 h-3" /> Interne Notiz
                                            </div>
                                            <p className="k-caption text-amber-200 italic">{session.notes}</p>
                                        </div>
                                    )}

                                    {/* Submitter info */}
                                    {(session.submitterName || session.submitterEmail) && (
                                        <div className="mx-5 mt-3 flex items-center gap-2 k-caption text-[#161616]/40">
                                            <Send className="w-3 h-3 shrink-0" />
                                            <span>Eingereicht von: </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const sp = findSpeaker(session.submitterName) || findSpeaker(session.submitterEmail);
                                                    setSpeakerPopup(sp || {
                                                        fullName: session.submitterName || '',
                                                        email: session.submitterEmail || ''
                                                    });
                                                }}
                                                className="font-bold text-white hover:underline"
                                            >
                                                {session.submitterName || session.submitterEmail}
                                            </button>
                                        </div>
                                    )}

                                    {/* Short description (always) + Long description (toggle) */}
                                    <div className="px-5 pt-4">
                                        {session.shortDescription && (
                                            <div className="mb-3">
                                                <h4 className="k-caption mb-1">Kurzbeschreibung</h4>
                                                <p className="k-body text-slate-300 leading-relaxed">{session.shortDescription}</p>
                                            </div>
                                        )}
                                        {session.description && (
                                            <div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setShowLongDesc(prev => ({ ...prev, [session.id]: !prev[session.id] })); }}
                                                    className="flex items-center gap-1.5 k-caption text-[var(--k-accent-teal)] tracking-tighter hover:text-white transition-colors mb-2"
                                                >
                                                    <FileText className="w-3 h-3" />
                                                    {showLong ? 'Langbeschreibung ausblenden' : 'Langbeschreibung anzeigen'}
                                                    {showLong ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                </button>
                                                {showLong && (
                                                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-72 overflow-y-auto custom-scrollbar mb-2">
                                                        <p className="k-body text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                            {session.description}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Admin-only metadata editing */}
                                    {isAdmin && (
                                        <div className="px-5 pt-3">
                                            <h4 className="k-caption mb-2">Metadaten bearbeiten (Admin)</h4>
                                            <div className="flex gap-4">
                                                {[
                                                    { field: 'format', label: 'Format', options: config.formate },
                                                    { field: 'bereich', label: 'Bereich', options: config.bereiche },
                                                    { field: 'thema', label: 'Thema', options: config.themen }
                                                ].map(({ field, label, options }) => (
                                                    <div key={field} className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</span>
                                                        <select
                                                            className="k-input p-1.5 text-xs"
                                                            value={session[field] || ''}
                                                            onChange={(e) => { onUpdateMetadata(session.id, field, e.target.value); }}
                                                        >
                                                            <option value="">- Wählen -</option>
                                                            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* TAG PICKER — Curators + Admins */}
                                    <div className="px-5 pt-3">
                                        <h4 className="k-caption mb-2 flex items-center gap-1.5">
                                            <Tag className="w-3 h-3" /> Tags
                                        </h4>
                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                            {(session.tags || '').split(',').filter(t => t.trim()).map(tag => (
                                                <span key={tag.trim()} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[10px] font-bold border border-indigo-300">
                                                    {tag.trim()}
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        const currentTags = (session.tags || '').split(',').map(t => t.trim()).filter(Boolean);
                                                        const newTags = currentTags.filter(t => t !== tag.trim()).join(', ');
                                                        onUpdateMetadata(session.id, 'tags', newTags);
                                                    }} className="hover:text-red-400 transition-colors">
                                                        <X className="w-2.5 h-2.5" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <div className="relative flex-1">
                                                <input
                                                    type="text"
                                                    list={`tags-list-${session.id}`}
                                                    placeholder="Tag hinzufügen..."
                                                    className="k-input px-3 py-1.5 text-xs"
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && e.target.value.trim()) {
                                                            e.stopPropagation();
                                                            const newTag = e.target.value.trim();
                                                            const currentTags = (session.tags || '').split(',').map(t => t.trim()).filter(Boolean);
                                                            if (!currentTags.includes(newTag)) {
                                                                const updatedTags = [...currentTags, newTag].join(', ');
                                                                onUpdateMetadata(session.id, 'tags', updatedTags);
                                                                // If it's a new tag not in config, add it
                                                                if (!config.tags?.includes(newTag) && onAddTag) {
                                                                    onAddTag(newTag);
                                                                }
                                                            }
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                />
                                                <datalist id={`tags-list-${session.id}`}>
                                                    {(config.tags || []).filter(t => {
                                                        const currentTags = (session.tags || '').split(',').map(x => x.trim());
                                                        return !currentTags.includes(t);
                                                    }).map(t => <option key={t} value={t} />)}
                                                </datalist>
                                            </div>
                                        </div>
                                    </div>

                                    {/* RATING — combined stars + comment + submit */}
                                    <div className="px-5 pt-4 pb-2">
                                        <h4 className="k-caption mb-3 flex items-center gap-2">
                                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                            Deine Bewertung
                                            {session._myScore > 0 && <span className="text-amber-500 normal-case tracking-normal font-bold">(aktuell: {session._myScore}★)</span>}
                                        </h4>
                                        <div className="flex items-center gap-3">
                                            <div className="flex gap-1">
                                                {[1, 2, 3, 4, 5].map(star => (
                                                    <button key={star}
                                                        onClick={(e) => { e.stopPropagation(); setDraftScore(session.id, star); }}
                                                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border ${activeScore >= star ? 'bg-amber-100 border-amber-400 text-amber-600' : 'bg-slate-100 border-slate-300 text-slate-400 hover:border-amber-400 hover:text-amber-500'}`}>
                                                        <Star className={`w-4 h-4 ${activeScore >= star ? 'fill-current' : ''}`} />
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex-1 relative">
                                                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                <input type="text" placeholder="Kommentar zur Bewertung..."
                                                    value={draft.kommentar} onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => setDraftKommentar(session.id, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') submitRating(session.id); }}
                                                    className="k-input pl-9 pr-4 py-2 text-xs" />
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); submitRating(session.id); }}
                                                disabled={activeScore === 0 && !draft.kommentar.trim()}
                                                className="k-btn-primary px-4 py-2 text-xs shadow-sm active:scale-95">
                                                <Send className="w-3.5 h-3.5 mr-1 inline" /> Absenden
                                            </button>
                                        </div>
                                    </div>

                                    {/* REVIEWS — visible after own rating submitted */}
                                    <div className="px-5 pt-2 pb-5">
                                        {session._ratings.length > 0 ? (
                                            session._myScore > 0 ? (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setExpandedReviews(prev => ({ ...prev, [session.id]: !prev[session.id] })); }}
                                                        className="flex items-center gap-2 k-caption text-[var(--k-accent-teal)] hover:text-white transition-colors"
                                                    >
                                                        {showReviews ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                        {session._ratings.length} Bewertung{session._ratings.length !== 1 ? 'en' : ''} {showReviews ? 'ausblenden' : 'anzeigen'}
                                                    </button>
                                                    {showReviews && (
                                                        <div className="mt-3 space-y-2">
                                                            {session._ratings.map((r, i) => {
                                                                const isMe = r.reviewer?.toLowerCase() === userEmail?.toLowerCase();
                                                                const reviewerName = isMe ? 'Du' : (userNameMap[r.reviewer?.toLowerCase()] || r.reviewer || 'Anonym');
                                                                return (
                                                                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isMe ? 'bg-[var(--k-accent-teal)]/10 border-[var(--k-accent-teal)]/30' : 'bg-white/5 border-white/10'}`}>
                                                                        <div className="flex gap-0.5 shrink-0 pt-0.5">
                                                                            {[1, 2, 3, 4, 5].map(s => (
                                                                                <Star key={s} className={`w-3 h-3 ${r.score >= s ? 'text-amber-500 fill-amber-500' : 'text-[#161616]/90'}`} />
                                                                            ))}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                                <span className={`text-[10px] font-bold ${isMe ? 'text-[var(--k-accent-teal)]' : 'text-white'}`}>{isMe ? '🟢 ' : ''}{reviewerName}</span>
                                                                                {r.kategorie && <span className="text-[9px] text-slate-300 bg-white/10 px-1.5 py-0.5 rounded">{r.kategorie}</span>}
                                                                                <span className="text-[9px] text-[#161616]/40">{r.timestamp ? new Date(r.timestamp).toLocaleDateString('de-DE') : ''}</span>
                                                                            </div>
                                                                            {r.kommentar && <p className="text-xs text-slate-300 leading-relaxed">{r.kommentar}</p>}
                                                                            {!r.kommentar && <p className="text-[10px] text-[#161616]/60 italic">Kein Kommentar</p>}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-[10px] text-slate-300 italic flex items-center gap-1.5">
                                                    <Star className="w-3 h-3" /> Bewerte diese Session, um die {session._ratings.length} Bewertung{session._ratings.length !== 1 ? 'en' : ''} anderer KuratorInnen zu sehen.
                                                </p>
                                            )
                                        ) : (
                                            <p className="text-[10px] text-slate-300 italic">Noch keine Bewertungen</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {processedSessions.length === 0 && (
                    <div className="text-center py-20 text-white/40">
                        <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-bold">Keine Sessions gefunden</p>
                        <p className="text-xs mt-1">Passe die Filter oder die Suche an.</p>
                    </div>
                )}
            </div>

            {/* SPEAKER POPUP */}
            {speakerPopup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setSpeakerPopup(null)}>
                    <div className="k-panel-glass text-white shadow-2xl border-white/10 max-w-md w-full p-6 relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setSpeakerPopup(null)} className="absolute top-4 right-4 text-[#161616]/40 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-16 h-16 bg-[var(--k-accent-teal)]/20 rounded-full flex items-center justify-center shrink-0">
                                <User className="w-8 h-8 text-[var(--k-accent-teal)]" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-white text-lg">{speakerPopup.fullName}</h3>
                                {speakerPopup.pronoun && <span className="k-caption">({speakerPopup.pronoun})</span>}
                                {speakerPopup.organisation && <p className="k-body font-bold mt-0.5 text-[var(--k-accent-teal)]">{speakerPopup.organisation}</p>}
                            </div>
                        </div>
                        {speakerPopup.bio ? (
                            <div className="mb-4">
                                <h4 className="k-caption mb-2">Bio</h4>
                                <p className="k-body text-white/80 leading-relaxed whitespace-pre-wrap">{speakerPopup.bio}</p>
                            </div>
                        ) : (
                            <p className="k-caption italic mb-4">Keine Bio hinterlegt.</p>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-[#161616]/40">
                            {speakerPopup.email && (
                                <a href={`mailto:${speakerPopup.email}`} className="flex items-center gap-1 text-[var(--k-accent-teal)] hover:underline">
                                    ✉️ {speakerPopup.email}
                                </a>
                            )}
                            {speakerPopup.webseite && (
                                <a href={speakerPopup.webseite} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--k-accent-teal)] hover:underline">
                                    🌐 Webseite
                                </a>
                            )}
                            {speakerPopup.herkunft && <span>📍 {speakerPopup.herkunft}</span>}
                            {speakerPopup.sprache && <span>🗣️ {speakerPopup.sprache}</span>}
                        </div>
                        {speakerPopup.status && (
                            <div className="mt-3 pt-3 border-t border-white/10">
                                <span className="k-caption">Status: </span>
                                <span className="k-body font-bold text-white ml-2">{speakerPopup.status}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CurationDashboard;
