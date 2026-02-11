'use client';

import { useState, useMemo } from 'react';
import { useSessionStore } from '@/lib/store';
import { Responsibility } from '@/lib/types';
import { saveSelections, updateParticipant, updateSessionMode } from '@/lib/firestore';
import { calculateParticipantLoad, getLoadStatus, getLoadLabel, getLoadMessage } from '@/lib/calculations';

interface AcquiringModeProps {
    isOwner: boolean;
}

export default function AcquiringMode({ isOwner }: AcquiringModeProps) {
    const { session, responsibilities, participants, selections, currentParticipant } = useSessionStore();
    const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    if (!session || !currentParticipant) return null;

    const activeResps = responsibilities.filter(r => r.status !== 'archived');
    const nonOwnerParticipants = participants.filter(p => !p.is_owner && p.status !== 'removed');
    const guidance = session.selection_guidance;

    // Determine which responsibilities are claimed by the owner (for filtering participant view)
    const ownerParticipant = participants.find(p => p.is_owner);
    const ownerSelectionIds = new Set(
        selections.filter(s => s.participant_id === ownerParticipant?.id).map(s => s.responsibility_id)
    );

    // For participant view: show all active responsibilities (unavailable ones will be disabled)
    const participantVisibleResps = activeResps;

    const toggleSelection = (respId: string) => {
        const newSet = new Set(localSelectedIds);
        if (newSet.has(respId)) {
            newSet.delete(respId);
        } else {
            if (newSet.size < guidance.max_responsibilities) {
                newSet.add(respId);
            }
        }
        setLocalSelectedIds(newSet);
    };

    const currentLoad = calculateParticipantLoad(
        currentParticipant.id,
        [...localSelectedIds],
        activeResps
    );
    const loadStatus = getLoadStatus(currentLoad);

    const handleSubmit = async () => {
        if (localSelectedIds.size < guidance.min_responsibilities) {
            alert(`Please select at least ${guidance.min_responsibilities} responsibilities.`);
            return;
        }
        setIsSubmitting(true);
        try {
            await saveSelections(currentParticipant.id, session.id, [...localSelectedIds]);
            await updateParticipant(currentParticipant.id, { round1_submitted: true });
            setSubmitted(true);
        } catch (err) {
            console.error(err);
            alert('Failed to submit selections.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Owner Dashboard Data
    const selectionsByResp = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const sel of selections) {
            if (!map.has(sel.responsibility_id)) {
                map.set(sel.responsibility_id, []);
            }
            map.get(sel.responsibility_id)!.push(sel.participant_id);
        }
        return map;
    }, [selections]);

    const unselectedResps = activeResps.filter(r => !selectionsByResp.has(r.id));
    const conflictResps = activeResps.filter(r => {
        const resp = responsibilities.find(x => x.id === r.id);
        const selectedBy = selectionsByResp.get(r.id) || [];
        return (resp?.sharing_allowed === 'closed' || resp?.sharing_allowed === null) && selectedBy.length > 1;
    });

    const submittedCount = nonOwnerParticipants.filter(p => p.round1_submitted).length;
    const allSubmitted = submittedCount === nonOwnerParticipants.length && nonOwnerParticipants.length > 0;

    const handleProceedToEvaluating = async () => {
        if (!allSubmitted) {
            alert(`Waiting for ${nonOwnerParticipants.length - submittedCount} more participant(s) to submit.`);
            return;
        }
        await updateSessionMode(session.id, 'evaluating');
    };

    // ─── OWNER VIEW ─────────────────────────────────────────────
    if (isOwner) {
        return (
            <div>
                <h2 className="section-title">Owner Dashboard — Acquiring Mode</h2>
                <p className="section-subtitle">Monitor participant selections as they come in.</p>

                {/* Stats */}
                <div className="stat-grid">
                    <div className="stat-card">
                        <div className="stat-value">{submittedCount}/{nonOwnerParticipants.length}</div>
                        <div className="stat-label">Submitted</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{conflictResps.length}</div>
                        <div className="stat-label">Conflicts</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{unselectedResps.length}</div>
                        <div className="stat-label">Unselected</div>
                    </div>
                </div>

                {/* Participant Links */}
                <div className="card mb-xl">
                    <h3 className="card-title mb-md">🔗 Participant Links</h3>
                    <p className="text-sm text-secondary mb-md">Share these links with each participant to let them select responsibilities.</p>

                    {nonOwnerParticipants.map(p => (
                        <div key={p.id} className="flex justify-between items-center mb-sm" style={{ padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)' }}>
                            <div>
                                <span className="font-semibold">{p.name}</span>
                                {p.round1_submitted && <span className="badge badge-green" style={{ marginLeft: 'var(--space-sm)' }}>Submitted</span>}
                            </div>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => {
                                    const url = `${window.location.origin}/join/${p.access_token}`;
                                    navigator.clipboard.writeText(url);
                                    alert(`Link copied for ${p.name}!`);
                                }}
                            >
                                📋 Copy Link
                            </button>
                        </div>
                    ))}
                </div>

                {/* Selection Matrix */}
                {selections.length > 0 && (
                    <div className="card mb-xl">
                        <h3 className="card-title mb-md">📊 Selection Matrix</h3>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Responsibility</th>
                                        <th>Weight</th>
                                        <th>Sharing</th>
                                        {participants.filter(p => p.status !== 'removed').map(p => (
                                            <th key={p.id}>{p.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeResps.map(resp => {
                                        const selectedBy = selectionsByResp.get(resp.id) || [];
                                        const isConflict = (resp.sharing_allowed === 'closed' || resp.sharing_allowed === null) && selectedBy.length > 1;
                                        return (
                                            <tr key={resp.id} style={isConflict ? { background: 'var(--load-red-bg)' } : {}}>
                                                <td className="font-semibold">
                                                    {resp.title}
                                                    {isConflict && <span className="badge badge-red" style={{ marginLeft: 4 }}>⚠️</span>}
                                                </td>
                                                <td>{(resp.weight * 100).toFixed(1)}%</td>
                                                <td>
                                                    <span className={`badge ${resp.sharing_allowed === 'open' ? 'badge-green' : 'badge-orange'}`}>
                                                        {resp.sharing_allowed === 'open' ? 'Open' : 'Closed'}
                                                    </span>
                                                </td>
                                                {participants.filter(p => p.status !== 'removed').map(p => (
                                                    <td key={p.id} style={{ textAlign: 'center' }}>
                                                        {selectedBy.includes(p.id) ? '✓' : '—'}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Proceed */}
                <div className="flex justify-between">
                    <button className="btn btn-secondary" onClick={() => updateSessionMode(session.id, 'processing')}>
                        ← Back to Processing
                    </button>
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleProceedToEvaluating}
                        disabled={!allSubmitted}
                    >
                        {allSubmitted ? '✅ Proceed to Evaluation →' : `Waiting for ${nonOwnerParticipants.length - submittedCount} participant(s)...`}
                    </button>
                </div>
            </div>
        );
    }

    // ─── PARTICIPANT VIEW ──────────────────────────────────────
    if (submitted || currentParticipant.round1_submitted) {
        return (
            <div className="empty-state" style={{ padding: 'var(--space-3xl)' }}>
                <div className="empty-state-icon">✅</div>
                <h2 className="empty-state-title">Selections Submitted</h2>
                <p className="empty-state-text">
                    Your selections have been recorded. The session owner will proceed to evaluation once all participants have submitted.
                </p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="section-title">Select Your Responsibilities</h2>
            <p className="section-subtitle">
                Choose the responsibilities you want to take on. Select {guidance.min_responsibilities}–{guidance.max_responsibilities} items.
            </p>

            {/* Load Bar */}
            <div className="card mb-xl" style={{ padding: 'var(--space-md)' }}>
                <div className="flex justify-between items-center mb-sm">
                    <span className="font-semibold">Your Workload</span>
                    <span className={`badge badge-${loadStatus}`}>
                        {loadStatus === 'green' ? '🟢' : loadStatus === 'yellow' ? '🟡' : loadStatus === 'orange' ? '🟠' : '🔴'} {getLoadLabel(loadStatus)}
                    </span>
                </div>
                <div className="load-bar-track">
                    <div className={`load-bar-fill ${loadStatus}`} style={{ width: `${Math.min(currentLoad, 100)}%` }} />
                </div>
                <p className="text-sm text-muted mt-md">{getLoadMessage(loadStatus)}</p>
                <div className="load-bar-label">
                    <span className="text-xs text-muted">Selected: {localSelectedIds.size} responsibilities</span>
                </div>
            </div>

            {/* Selection Grid (NO WEIGHTS SHOWN — BLIND) */}
            {Object.entries(
                participantVisibleResps.reduce<Record<string, Responsibility[]>>((acc, r) => {
                    if (!acc[r.category]) acc[r.category] = [];
                    acc[r.category].push(r);
                    return acc;
                }, {})
            ).sort().map(([category, resps]) => (
                <div key={category} className="category-section">
                    <div className="category-header">
                        <h3 className="category-title">{category}</h3>
                    </div>
                    <div className="category-grid">
                        {resps.map(resp => {
                            const takenBy = selections.find(s => s.responsibility_id === resp.id && s.participant_id !== currentParticipant.id);
                            const isUnavailable = (resp.sharing_allowed === 'closed' || resp.sharing_allowed === null) && !!takenBy;
                            const unavailableBy = isUnavailable ? participants.find(p => p.id === takenBy?.participant_id) : null;

                            return (
                                <div
                                    key={resp.id}
                                    className={`resp-card ${localSelectedIds.has(resp.id) ? 'selected' : ''} ${isUnavailable ? 'unavailable' : ''}`}
                                    onClick={() => !isUnavailable && toggleSelection(resp.id)}
                                >
                                    <div className="resp-card-header">
                                        <div className={`checkbox ${localSelectedIds.has(resp.id) ? 'checked' : ''}`} />
                                        <span className="resp-card-title">{resp.title}</span>
                                    </div>
                                    <p className="resp-card-description">{resp.description}</p>
                                    <div className="resp-card-meta">
                                        <span className={`badge ${resp.criticality === 'Critical' ? 'badge-red' :
                                            resp.criticality === 'High' ? 'badge-orange' :
                                                resp.criticality === 'Medium' ? 'badge-yellow' : 'badge-blue'
                                            }`}>
                                            {resp.criticality}
                                        </span>
                                        <span className="text-xs text-muted">⏱ {resp.typical_time_commitment || 'TBD'}</span>
                                        {isUnavailable && (
                                            <span className="badge badge-red flex items-center gap-xs">
                                                🔒 Taken by {unavailableBy?.name || 'Someone'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Submit */}
            <div className="flex justify-center mt-xl">
                <button
                    className="btn btn-primary btn-lg"
                    onClick={handleSubmit}
                    disabled={isSubmitting || localSelectedIds.size < guidance.min_responsibilities}
                >
                    {isSubmitting ? (
                        <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Submitting...</>
                    ) : (
                        `📤 Submit Selections (${localSelectedIds.size})`
                    )}
                </button>
            </div>
        </div>
    );
}
