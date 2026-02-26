import React, { useState, useMemo } from 'react';
import { AlertTriangle, Mic2, Headphones, Music, Monitor, Wrench, CheckCircle2, Clock, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * ProductionTimeline — Stage × Time grid showing tech requirements per session.
 *
 * Props:
 * - sessions: array of program sessions (with tech fields)
 * - stages: array of stage objects
 * - productionData: array of production export rows from 26_Kosmos_Produktions_Export
 * - startHour / endHour: timeline range
 */

const PIXELS_PER_MINUTE = 1.2;
const HEADER_HEIGHT = 60;

function timeToMin(t) {
    if (!t || t === '-') return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function minToTime(m) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Merge production data into sessions by Session_ID
function mergeProductionData(sessions, productionData) {
    const prodMap = new Map();
    productionData.forEach(p => {
        if (p.sessionId) prodMap.set(p.sessionId, p);
    });

    return sessions.map(s => {
        const prod = prodMap.get(s.id);
        if (prod) {
            return {
                ...s,
                micCountWireless: parseInt(prod.micCountWireless) || 0,
                micCountHeadset: parseInt(prod.micCountHeadset) || 0,
                dIBoxes: parseInt(prod.dIBoxes) || 0,
                audioFeeds: prod.audioFeeds || '',
                visuals: prod.visuals || '',
                specialRequirements: prod.specialRequirements || '',
                productionStatus: prod.productionStatus || '',
                setupStart: prod.setupStart || '',
            };
        }
        return {
            ...s,
            micCountWireless: s.micCountWireless || 0,
            micCountHeadset: s.micCountHeadset || 0,
            dIBoxes: s.dIBoxes || 0,
            audioFeeds: s.audioFeeds || '',
            visuals: s.visuals || '',
            specialRequirements: s.specialRequirements || '',
            productionStatus: s.productionStatus || '',
            setupStart: s.setupStart || '',
        };
    });
}

// Color for production status
function statusColor(status) {
    const s = (status || '').toLowerCase();
    if (s === 'confirmed' || s === 'bestätigt') return 'bg-emerald-100 text-emerald-800 border-emerald-400';
    if (s === 'pending' || s === 'offen') return 'bg-amber-100 text-amber-800 border-amber-400';
    if (s === 'canceled' || s === 'abgesagt') return 'bg-red-100 text-red-800 border-red-400';
    return 'bg-slate-100 text-slate-600 border-slate-300';
}

function ProductionTimeline({ sessions = [], stages = [], productionData = [], startHour = 9, endHour = 22 }) {
    const [expandedStage, setExpandedStage] = useState(null);
    const [viewType, setViewType] = useState('timeline'); // 'timeline' or 'table'

    const totalMinutes = (endHour - startHour) * 60;
    const timelineHeight = totalMinutes * PIXELS_PER_MINUTE;

    // Merge production data into sessions
    const enrichedSessions = useMemo(
        () => mergeProductionData(sessions, productionData),
        [sessions, productionData]
    );

    // Only show sessions that are placed on a stage
    const placedSessions = useMemo(
        () => enrichedSessions.filter(s => s.stage !== 'INBOX' && s.start && s.start !== '-'),
        [enrichedSessions]
    );

    // Group sessions by stage
    const sessionsByStage = useMemo(() => {
        const map = {};
        stages.forEach(st => { map[st.id] = []; });
        placedSessions.forEach(s => {
            if (map[s.stage]) map[s.stage].push(s);
        });
        // Sort by start time within each stage
        Object.values(map).forEach(arr => arr.sort((a, b) => timeToMin(a.start) - timeToMin(b.start)));
        return map;
    }, [placedSessions, stages]);

    // Equipment overbooking check per timeslot
    const overbookingWarnings = useMemo(() => {
        const warnings = [];
        stages.forEach(stage => {
            const stageSessions = sessionsByStage[stage.id] || [];
            for (let i = 0; i < stageSessions.length; i++) {
                for (let j = i + 1; j < stageSessions.length; j++) {
                    const a = stageSessions[i];
                    const b = stageSessions[j];
                    const aStart = timeToMin(a.start);
                    const aEnd = aStart + (a.duration || 60);
                    const bStart = timeToMin(b.start);
                    const bEnd = bStart + (b.duration || 60);

                    // Check overlap
                    if (aStart < bEnd && bStart < aEnd) {
                        const totalWireless = (a.micCountWireless || 0) + (b.micCountWireless || 0);
                        const totalHeadset = (a.micCountHeadset || 0) + (b.micCountHeadset || 0);
                        const totalMics = totalWireless + totalHeadset;
                        if (totalMics > (stage.maxMics || 4)) {
                            warnings.push({
                                stageId: stage.id,
                                stageName: stage.name,
                                sessionA: a.title,
                                sessionB: b.title,
                                totalMics,
                                maxMics: stage.maxMics || 4,
                                timeRange: `${a.start}–${minToTime(Math.max(aEnd, bEnd))}`,
                            });
                        }
                    }
                }
            }
        });
        return warnings;
    }, [sessionsByStage, stages]);

    // Global equipment summary
    const equipmentSummary = useMemo(() => {
        const summary = {
            totalWireless: 0,
            totalHeadset: 0,
            totalDIBoxes: 0,
            peakWireless: 0,
            peakHeadset: 0,
            sessionCount: placedSessions.length,
            confirmedCount: placedSessions.filter(s => ['confirmed', 'bestätigt'].includes((s.productionStatus || '').toLowerCase())).length,
        };

        // Track peak concurrent usage per 15-min slot
        const slots = {};
        for (let m = startHour * 60; m < endHour * 60; m += 15) {
            slots[m] = { wireless: 0, headset: 0 };
        }

        placedSessions.forEach(s => {
            summary.totalWireless += s.micCountWireless || 0;
            summary.totalHeadset += s.micCountHeadset || 0;
            summary.totalDIBoxes += s.dIBoxes || 0;

            const sStart = timeToMin(s.start);
            const sEnd = sStart + (s.duration || 60);
            for (let m = startHour * 60; m < endHour * 60; m += 15) {
                if (m < sEnd && m + 15 > sStart) {
                    slots[m].wireless += s.micCountWireless || 0;
                    slots[m].headset += s.micCountHeadset || 0;
                }
            }
        });

        Object.values(slots).forEach(sl => {
            if (sl.wireless > summary.peakWireless) summary.peakWireless = sl.wireless;
            if (sl.headset > summary.peakHeadset) summary.peakHeadset = sl.headset;
        });

        return summary;
    }, [placedSessions, startHour, endHour]);

    // Hour markers
    const hours = [];
    for (let h = startHour; h <= endHour; h++) hours.push(h);

    return (
        <div className="flex flex-col h-full overflow-hidden k-panel-glass text-white border-white/10">
            {/* Header */}
            <div className="bg-white/5 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0">
                <div>
                    <h2 className="k-h2 flex items-center gap-2 mb-0">
                        <Wrench className="w-5 h-5 text-[var(--k-accent-teal)]" />
                        Produktions-Zeitplan
                    </h2>
                    <p className="k-caption mt-0.5">
                        {equipmentSummary.sessionCount} Sessions • {equipmentSummary.confirmedCount} bestätigt • Peak: {equipmentSummary.peakWireless} Funk + {equipmentSummary.peakHeadset} Headset
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {overbookingWarnings.length > 0 && (
                        <div className="flex items-center gap-1.5 text-red-400 bg-red-900/20 px-3 py-1.5 rounded-full border border-red-500/30 text-xs font-bold animate-pulse">
                            <AlertTriangle className="w-4 h-4" />
                            {overbookingWarnings.length} Überbuchung{overbookingWarnings.length > 1 ? 'en' : ''}
                        </div>
                    )}

                    <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                        <button
                            onClick={() => setViewType('timeline')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewType === 'timeline' ? 'bg-[var(--k-accent-teal)]/20 text-[var(--k-accent-teal)]' : 'text-white/50 hover:text-white'}`}
                        >
                            Timeline
                        </button>
                        <button
                            onClick={() => setViewType('table')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewType === 'table' ? 'bg-[var(--k-accent-teal)]/20 text-[var(--k-accent-teal)]' : 'text-white/50 hover:text-white'}`}
                        >
                            Tabelle
                        </button>
                    </div>
                </div>
            </div>

            {/* Overbooking Warnings */}
            {overbookingWarnings.length > 0 && (
                <div className="bg-red-900/20 border-b border-red-500/30 px-4 py-2">
                    {overbookingWarnings.map((w, i) => (
                        <div key={i} className="text-xs text-red-300 flex items-center gap-2 py-0.5">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span><strong>{w.stageName}</strong> ({w.timeRange}): „{w.sessionA}" + „{w.sessionB}" = {w.totalMics} Mics (max {w.maxMics})</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                {viewType === 'timeline' ? (
                    /* ===== TIMELINE VIEW ===== */
                    <div className="flex min-w-fit">
                        {/* Time axis */}
                        <div className="w-16 shrink-0 bg-indigo-50 border-r border-indigo-200 relative" style={{ height: timelineHeight + HEADER_HEIGHT }}>
                            <div className="sticky top-0 bg-indigo-900 border-b border-indigo-700 text-center text-[10px] font-bold text-yellow-300/70 uppercase" style={{ height: HEADER_HEIGHT, lineHeight: `${HEADER_HEIGHT}px` }}>
                                Zeit
                            </div>
                            {hours.map(h => (
                                <div
                                    key={h}
                                    className="absolute w-full text-right pr-2 text-[10px] font-mono text-white/40 border-t border-white/5"
                                    style={{ top: HEADER_HEIGHT + (h - startHour) * 60 * PIXELS_PER_MINUTE }}
                                >
                                    {`${String(h).padStart(2, '0')}:00`}
                                </div>
                            ))}
                        </div>

                        {/* Stage columns */}
                        {stages.filter(s => !s.hidden).map(stage => {
                            const stageSess = sessionsByStage[stage.id] || [];
                            return (
                                <div
                                    key={stage.id}
                                    className="min-w-[260px] max-w-[320px] w-full border-r border-indigo-200 relative bg-indigo-50/30"
                                    style={{ height: timelineHeight + HEADER_HEIGHT }}
                                >
                                    {/* Stage header */}
                                    <div
                                        className="sticky top-0 z-10 bg-indigo-900 border-b border-indigo-700 p-2 text-center"
                                        style={{ height: HEADER_HEIGHT }}
                                    >
                                        <div className="font-bold text-sm text-yellow-300 truncate">{stage.name}</div>
                                        <div className="flex justify-center gap-3 text-[10px] text-yellow-300/50 font-mono mt-0.5">
                                            <span className="flex items-center gap-0.5"><Mic2 className="w-3 h-3 text-[var(--k-accent-teal)]" /> {stage.maxMics || '?'}</span>
                                            <span className="flex items-center gap-0.5">{stageSess.length} Sessions</span>
                                        </div>
                                    </div>

                                    {/* Hour gridlines */}
                                    {hours.map(h => (
                                        <div
                                            key={h}
                                            className="absolute w-full border-t border-indigo-100"
                                            style={{ top: HEADER_HEIGHT + (h - startHour) * 60 * PIXELS_PER_MINUTE }}
                                        />
                                    ))}

                                    {/* Session blocks */}
                                    {stageSess.map(session => {
                                        const sStart = timeToMin(session.start);
                                        const top = HEADER_HEIGHT + (sStart - startHour * 60) * PIXELS_PER_MINUTE;
                                        const height = Math.max((session.duration || 60) * PIXELS_PER_MINUTE, 24);
                                        const isCanceled = (session.status || '').toLowerCase().includes('cancel') || (session.status || '').toLowerCase().includes('abgesagt');

                                        return (
                                            <div
                                                key={session.id}
                                                className={`absolute left-1 right-1 rounded border px-2 py-1 overflow-hidden transition-all hover:shadow-[0_0_15px_rgba(45,212,191,0.2)] cursor-default z-10 ${isCanceled ? 'bg-red-900/30 border-red-500/40 text-red-200 opacity-60' : 'bg-[var(--k-accent-teal)]/10 border-[var(--k-accent-teal)]/40 hover:border-[var(--k-accent-teal)]'
                                                    }`}
                                                style={{ top, height }}
                                                title={`${session.title}\n${session.start}–${session.end}\nFunk: ${session.micCountWireless} | Headset: ${session.micCountHeadset}\nDI: ${session.dIBoxes} | Audio: ${session.audioFeeds}\nVisuals: ${session.visuals}\n${session.specialRequirements ? 'Special: ' + session.specialRequirements : ''}`}
                                            >
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className={`font-bold text-[10px] truncate leading-tight ${isCanceled ? 'text-red-300 line-through' : 'text-[var(--k-accent-teal)]'}`}>
                                                        {isCanceled && <span className="text-red-500 mr-1">[ABGESAGT]</span>}
                                                        {session.title || 'Unbenannt'}
                                                    </span>
                                                    <span className="text-[9px] font-mono text-white/40 shrink-0">{session.start}</span>
                                                </div>

                                                {height > 35 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {(session.micCountWireless > 0) && (
                                                            <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-900/40 text-blue-300 px-1 rounded border border-blue-500/30">
                                                                <Mic2 className="w-2.5 h-2.5" />{session.micCountWireless}
                                                            </span>
                                                        )}
                                                        {(session.micCountHeadset > 0) && (
                                                            <span className="inline-flex items-center gap-0.5 text-[9px] bg-purple-900/40 text-purple-300 px-1 rounded border border-purple-500/30">
                                                                <Headphones className="w-2.5 h-2.5" />{session.micCountHeadset}
                                                            </span>
                                                        )}
                                                        {(session.dIBoxes > 0) && (
                                                            <span className="inline-flex items-center gap-0.5 text-[9px] bg-emerald-900/40 text-emerald-300 px-1 rounded border border-emerald-500/30">
                                                                <Music className="w-2.5 h-2.5" />{session.dIBoxes} DI
                                                            </span>
                                                        )}
                                                        {session.visuals && (
                                                            <span className="inline-flex items-center gap-0.5 text-[9px] bg-amber-900/40 text-amber-300 px-1 rounded border border-amber-500/30">
                                                                <Monitor className="w-2.5 h-2.5" />{session.visuals}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {height > 55 && session.specialRequirements && (
                                                    <div className="text-[9px] text-white/50 mt-1 truncate italic">
                                                        {session.specialRequirements}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ===== TABLE VIEW ===== */
                    <div className="p-4">
                        <table className="w-full text-xs border-collapse text-left">
                            <thead>
                                <tr className="border-b border-white/20 text-white/70 uppercase tracking-widest text-[10px]">
                                    <th className="p-2 font-bold">Bühne</th>
                                    <th className="p-2 font-bold">Start</th>
                                    <th className="p-2 font-bold">Ende</th>
                                    <th className="p-2 font-bold">Session</th>
                                    <th className="text-center p-2 font-bold" title="Funk-Mikrofone">🎤 Funk</th>
                                    <th className="text-center p-2 font-bold" title="Headsets">🎧 Headset</th>
                                    <th className="text-center p-2 font-bold" title="DI-Boxen">🎸 DI</th>
                                    <th className="p-2 font-bold">Audio</th>
                                    <th className="p-2 font-bold">Visuals</th>
                                    <th className="p-2 font-bold">Special</th>
                                    <th className="text-center p-2 font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stages.filter(s => !s.hidden).map(stage => {
                                    const stageSess = sessionsByStage[stage.id] || [];
                                    const isExpanded = expandedStage === stage.id || expandedStage === null;

                                    return (
                                        <React.Fragment key={stage.id}>
                                            {/* Stage group header */}
                                            <tr
                                                className="bg-indigo-100 cursor-pointer hover:bg-indigo-200 border-b border-indigo-200 transition-colors"
                                                onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                                            >
                                                <td colSpan={11} className="p-2 font-bold text-indigo-900">
                                                    <div className="flex items-center gap-2">
                                                        {isExpanded ? <ChevronDown className="w-3 h-3 text-[var(--k-accent-teal)]" /> : <ChevronRight className="w-3 h-3 text-[var(--k-accent-teal)]" />}
                                                        {stage.name}
                                                        <span className="text-indigo-400 font-normal">({stageSess.length} Sessions, max {stage.maxMics || '?'} Mics)</span>
                                                    </div>
                                                </td>
                                            </tr>

                                            {isExpanded && stageSess.map(session => {
                                                const isCanceled = (session.status || '').toLowerCase().includes('cancel') || (session.status || '').toLowerCase().includes('abgesagt');
                                                return (
                                                    <tr
                                                        key={session.id}
                                                        className={`border-b border-indigo-100 hover:bg-indigo-50 transition-colors ${isCanceled ? 'opacity-50 line-through text-slate-400' : 'text-slate-700'}`}
                                                    >
                                                        <td className="p-2 text-slate-400 font-mono">{stage.name}</td>
                                                        <td className="p-2 font-mono">{session.start}</td>
                                                        <td className="p-2 font-mono">{session.end || '-'}</td>
                                                        <td className="p-2 font-medium text-[var(--k-accent-teal)] max-w-[200px] truncate">{session.title || 'Unbenannt'}</td>
                                                        <td className="p-2 text-center font-bold">{session.micCountWireless || '-'}</td>
                                                        <td className="p-2 text-center font-bold">{session.micCountHeadset || '-'}</td>
                                                        <td className="p-2 text-center font-bold">{session.dIBoxes || '-'}</td>
                                                        <td className="p-2 text-slate-500">{session.audioFeeds || '-'}</td>
                                                        <td className="p-2 text-slate-500">{session.visuals || '-'}</td>
                                                        <td className="p-2 text-slate-400 max-w-[150px] truncate" title={session.specialRequirements}>{session.specialRequirements || '-'}</td>
                                                        <td className="p-2 text-center">
                                                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusColor(session.productionStatus)}`}>
                                                                {session.productionStatus || 'Offen'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Equipment Summary Footer */}
            <div className="bg-indigo-50 border-t border-indigo-200 px-4 py-3 flex items-center gap-6 text-xs shrink-0">
                <div className="flex items-center gap-1.5 text-blue-700 font-bold">
                    <Mic2 className="w-3.5 h-3.5" />
                    Peak Funk: {equipmentSummary.peakWireless}
                </div>
                <div className="flex items-center gap-1.5 text-purple-700 font-bold">
                    <Headphones className="w-3.5 h-3.5" />
                    Peak Headset: {equipmentSummary.peakHeadset}
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <Music className="w-3.5 h-3.5" />
                    Total DI: {equipmentSummary.totalDIBoxes}
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 ml-auto font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {equipmentSummary.confirmedCount}/{equipmentSummary.sessionCount} bestätigt
                </div>
            </div>
        </div>
    );
}

export default ProductionTimeline;
