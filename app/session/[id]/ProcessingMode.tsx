'use client';

import { useState } from 'react';
import { useSessionStore } from '@/lib/store';
import { Responsibility } from '@/lib/types';
import {
    updateResponsibilitiesBatch,
    updateSessionMode,
    updateSessionGuidance,
    saveSelections,
} from '@/lib/firestore';
import { rebalanceWeights, getLoadStatus, getLoadLabel, calculateParticipantLoad } from '@/lib/calculations';

type ProcessingStep = 'weights' | 'selection' | 'sharing';

export default function ProcessingMode({ isOwner }: { isOwner: boolean }) {
    const {
        session, responsibilities, setResponsibilities,
        currentParticipant, ownerSelectedIds, toggleOwnerSelection,
        lockedWeights, toggleWeightLock,
    } = useSessionStore();

    const [step, setStep] = useState<ProcessingStep>('weights');
    const [isAutoWeighting, setIsAutoWeighting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [guidanceMin, setGuidanceMin] = useState(session?.selection_guidance.min_responsibilities || 3);
    const [guidanceMax, setGuidanceMax] = useState(session?.selection_guidance.max_responsibilities || 12);
    const [targetLoadMin, setTargetLoadMin] = useState(session?.selection_guidance.target_load_min || 20);
    const [targetLoadMax, setTargetLoadMax] = useState(session?.selection_guidance.target_load_max || 40);

    if (!session || !currentParticipant) return null;

    // Non-owners see a waiting screen during processing
    if (!isOwner) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
                <div className="empty-state">
                    <div className="empty-state-icon">⏳</div>
                    <h2 className="empty-state-title">Owner is setting things up</h2>
                    <p className="empty-state-text">
                        The session owner is assigning weights and configuring responsibilities.
                        You&apos;ll be notified when it&apos;s your turn to select.
                    </p>
                    <div className="spinner spinner-lg" style={{ margin: 'var(--space-xl) auto' }} />
                </div>
            </div>
        );
    }

    const activeResps = responsibilities.filter(r => r.status !== 'archived');
    const totalWeight = activeResps.reduce((sum, r) => sum + r.weight, 0);

    const handleAIWeights = async () => {
        setIsAutoWeighting(true);
        try {
            const res = await fetch('/api/ai/weights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    responsibilities: activeResps.map(r => ({
                        id: r.id, title: r.title, description: r.description,
                        criticality: r.criticality, typical_time_commitment: r.typical_time_commitment,
                    })),
                    business_type: session.business_profile?.type || 'General',
                    stage: session.business_profile?.stage || 'Early-stage',
                }),
            });

            if (!res.ok) throw new Error('Weight assignment failed');

            const weights: Array<{ responsibility_id: string; suggested_weight: number }> = await res.json();

            const updatedResps = activeResps.map(r => {
                const w = weights.find(x => x.responsibility_id === r.id);
                return { ...r, weight: w ? w.suggested_weight : r.weight };
            });

            // Normalize to 1.0
            const sum = updatedResps.reduce((s, r) => s + r.weight, 0);
            if (sum > 0) {
                updatedResps.forEach(r => { r.weight = r.weight / sum; });
            }

            const updates = updatedResps.map(r => ({ id: r.id, data: { weight: r.weight } }));
            await updateResponsibilitiesBatch(updates);
            setResponsibilities(responsibilities.map(r => {
                const updated = updatedResps.find(u => u.id === r.id);
                return updated ? { ...r, weight: updated.weight } : r;
            }));
        } catch (err) {
            console.error(err);
            alert('AI weight assignment failed. Assign weights manually.');
        } finally {
            setIsAutoWeighting(false);
        }
    };

    const handleWeightChange = (respId: string, newWeight: number) => {
        const newWeightDecimal = newWeight / 100;
        const rebalanced = rebalanceWeights(activeResps, respId, newWeightDecimal, lockedWeights);
        setResponsibilities(responsibilities.map(r => {
            const updated = rebalanced.find(u => u.id === r.id);
            return updated ? { ...r, weight: updated.weight } : r;
        }));
    };

    const saveWeights = async () => {
        setIsSaving(true);
        const updates = activeResps.map(r => ({ id: r.id, data: { weight: r.weight } }));
        await updateResponsibilitiesBatch(updates);
        setIsSaving(false);
    };

    const handleNextToSelection = async () => {
        await saveWeights();
        setStep('selection');
    };

    const ownerLoad = calculateParticipantLoad(
        currentParticipant.id,
        [...ownerSelectedIds],
        activeResps
    );
    const ownerLoadStatus = getLoadStatus(ownerLoad);

    const handleSharingToggle = async (respId: string) => {
        const resp = responsibilities.find(r => r.id === respId);
        if (!resp) return;
        const newSharing = resp.sharing_allowed === 'open' ? 'closed' : 'open';
        await updateResponsibilitiesBatch([{ id: respId, data: { sharing_allowed: newSharing } }]);
        setResponsibilities(responsibilities.map(r =>
            r.id === respId ? { ...r, sharing_allowed: newSharing } : r
        ));
    };

    const handleSetAllSharing = async (status: 'open' | 'closed') => {
        const updates = activeResps.map(r => ({ id: r.id, data: { sharing_allowed: status as Responsibility['sharing_allowed'] } }));
        await updateResponsibilitiesBatch(updates);
        setResponsibilities(responsibilities.map(r =>
            r.status !== 'archived' ? { ...r, sharing_allowed: status } : r
        ));
    };

    const handleProceedToAcquiring = async () => {
        if (ownerSelectedIds.size === 0) {
            alert('Please select at least one responsibility for yourself.');
            return;
        }

        // Save owner selections to Firestore
        await saveSelections(currentParticipant.id, session.id, [...ownerSelectedIds]);

        // Save guidance
        await updateSessionGuidance(session.id, {
            min_responsibilities: guidanceMin,
            max_responsibilities: guidanceMax,
            target_load_min: targetLoadMin,
            target_load_max: targetLoadMax,
        });

        // Ensure all have sharing status
        const needsSharing = activeResps.filter(r => r.sharing_allowed === null);
        if (needsSharing.length > 0) {
            const updates = needsSharing.map(r => ({
                id: r.id,
                data: { sharing_allowed: 'open' as Responsibility['sharing_allowed'] },
            }));
            await updateResponsibilitiesBatch(updates);
        }

        await updateSessionMode(session.id, 'acquiring');
    };

    return (
        <div>
            {/* Step Tabs */}
            <div className="tabs">
                <button className={`tab ${step === 'weights' ? 'active' : ''}`} onClick={() => setStep('weights')}>
                    1. Assign Weights
                </button>
                <button className={`tab ${step === 'selection' ? 'active' : ''}`} onClick={() => setStep('selection')}>
                    2. Your Selection
                </button>
                <button className={`tab ${step === 'sharing' ? 'active' : ''}`} onClick={() => setStep('sharing')}>
                    3. Sharing Rules
                </button>
            </div>

            {/* STEP 1: Weight Assignment */}
            {step === 'weights' && (
                <div>
                    <div className="flex justify-between items-center mb-lg">
                        <div>
                            <h2 className="section-title">Weight Assignment</h2>
                            <p className="section-subtitle">Assign importance weights to each responsibility. Total must equal 100%.</p>
                        </div>
                        <div className="flex gap-sm">
                            <button className="btn btn-secondary" onClick={handleAIWeights} disabled={isAutoWeighting}>
                                {isAutoWeighting ? (
                                    <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> AI Weighing...</>
                                ) : 'AI Auto-Weight'}
                            </button>
                        </div>
                    </div>

                    {/* Total Indicator */}
                    <div className={`alert ${Math.abs(totalWeight - 1) < 0.01 ? 'alert-success' : 'alert-warning'} mb-lg`}>
                        Total: {(totalWeight * 100).toFixed(1)}% {Math.abs(totalWeight - 1) < 0.01 ? '✓' : '— must equal 100%'}
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Responsibility</th>
                                    <th>Criticality</th>
                                    <th>Time</th>
                                    <th style={{ width: 100 }}>Weight %</th>
                                    <th style={{ width: 60 }}>Lock</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeResps.sort((a, b) => a.category.localeCompare(b.category) || b.weight - a.weight).map(resp => (
                                    <tr key={resp.id}>
                                        <td className="text-xs text-muted">{resp.category}</td>
                                        <td>
                                            <span className="font-semibold">{resp.title}</span>
                                        </td>
                                        <td>
                                            <span className={`badge ${resp.criticality === 'Critical' ? 'badge-red' :
                                                resp.criticality === 'High' ? 'badge-orange' :
                                                    resp.criticality === 'Medium' ? 'badge-yellow' : 'badge-blue'
                                                }`}>
                                                {resp.criticality}
                                            </span>
                                        </td>
                                        <td className="text-xs text-muted">{resp.typical_time_commitment || '–'}</td>
                                        <td>
                                            <input
                                                type="number"
                                                className="weight-input"
                                                value={(resp.weight * 100).toFixed(1)}
                                                onChange={e => handleWeightChange(resp.id, parseFloat(e.target.value) || 0)}
                                                min={0.1}
                                                max={15}
                                                step={0.1}
                                            />
                                        </td>
                                        <td>
                                            <button
                                                className={`btn btn-sm ${lockedWeights.has(resp.id) ? 'btn-primary' : 'btn-ghost'}`}
                                                onClick={() => toggleWeightLock(resp.id)}
                                                title={lockedWeights.has(resp.id) ? 'Unlock' : 'Lock'}
                                            >
                                                {lockedWeights.has(resp.id) ? '🔒' : '🔓'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => updateSessionMode(session.id, 'editing')}>
                            ← Back to Editing
                        </button>
                        <button className="btn btn-primary" onClick={handleNextToSelection} disabled={Math.abs(totalWeight - 1) > 0.01 || isSaving}>
                            {isSaving ? 'Saving...' : 'Next: Your Selection →'}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: Owner Selection */}
            {step === 'selection' && (
                <div>
                    <h2 className="section-title">Select Your Responsibilities</h2>
                    <p className="section-subtitle">Choose the responsibilities you&apos;ll handle. This is done before participants see the list.</p>

                    {/* Load Bar */}
                    <div className="card mb-xl" style={{ padding: 'var(--space-md)' }}>
                        <div className="flex justify-between items-center mb-sm">
                            <span className="font-semibold">Your Workload</span>
                            <span className={`badge badge-${ownerLoadStatus}`}>
                                {ownerLoad.toFixed(1)}% — {getLoadLabel(ownerLoadStatus)}
                            </span>
                        </div>
                        <div className="load-bar-track">
                            <div
                                className={`load-bar-fill ${ownerLoadStatus}`}
                                style={{ width: `${Math.min(ownerLoad, 100)}%` }}
                            />
                        </div>
                        <div className="load-bar-label">
                            <span className="text-xs text-muted">0%</span>
                            <span className="text-xs text-muted">Selected: {ownerSelectedIds.size} responsibilities</span>
                            <span className="text-xs text-muted">100%</span>
                        </div>
                    </div>

                    {/* Selection Grid */}
                    {Object.entries(
                        activeResps.reduce<Record<string, Responsibility[]>>((acc, r) => {
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
                                {resps.map(resp => (
                                    <div
                                        key={resp.id}
                                        className={`resp-card ${ownerSelectedIds.has(resp.id) ? 'selected' : ''}`}
                                        onClick={() => toggleOwnerSelection(resp.id)}
                                    >
                                        <div className="resp-card-header">
                                            <div className={`checkbox ${ownerSelectedIds.has(resp.id) ? 'checked' : ''}`} />
                                            <span className="resp-card-title">{resp.title}</span>
                                        </div>
                                        <p className="resp-card-description">{resp.description}</p>
                                        <div className="resp-card-meta">
                                            <span className="badge badge-blue">{(resp.weight * 100).toFixed(1)}%</span>
                                            <span className={`badge ${resp.criticality === 'Critical' ? 'badge-red' :
                                                resp.criticality === 'High' ? 'badge-orange' :
                                                    resp.criticality === 'Medium' ? 'badge-yellow' : 'badge-blue'
                                                }`}>
                                                {resp.criticality}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => setStep('weights')}>
                            ← Back to Weights
                        </button>
                        <button className="btn btn-primary" onClick={() => setStep('sharing')} disabled={ownerSelectedIds.size === 0}>
                            Next: Sharing Rules →
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: Sharing Rules */}
            {step === 'sharing' && (
                <div>
                    <h2 className="section-title">Sharing Rules</h2>
                    <p className="section-subtitle">Set whether each responsibility can be shared by multiple participants or is exclusive to one person.</p>

                    {/* Batch Actions */}
                    <div className="flex gap-sm mb-lg">
                        <button className="btn btn-secondary" onClick={() => handleSetAllSharing('open')}>
                            Set All Open
                        </button>
                        <button className="btn btn-secondary" onClick={() => handleSetAllSharing('closed')}>
                            Set All Closed
                        </button>
                    </div>

                    {/* Selection Guidance */}
                    <div className="card mb-xl">
                        <h3 className="card-title mb-md">📋 Participant Guidance</h3>
                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">Min Responsibilities</label>
                                <input type="number" className="form-input" value={guidanceMin}
                                    onChange={e => setGuidanceMin(parseInt(e.target.value) || 1)} min={1} max={20} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Max Responsibilities</label>
                                <input type="number" className="form-input" value={guidanceMax}
                                    onChange={e => setGuidanceMax(parseInt(e.target.value) || 5)} min={1} max={30} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Target Load Min %</label>
                                <input type="number" className="form-input" value={targetLoadMin}
                                    onChange={e => setTargetLoadMin(parseInt(e.target.value) || 10)} min={5} max={100} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Target Load Max %</label>
                                <input type="number" className="form-input" value={targetLoadMax}
                                    onChange={e => setTargetLoadMax(parseInt(e.target.value) || 40)} min={5} max={100} />
                            </div>
                        </div>
                    </div>

                    {/* Responsibilities */}
                    <div className="table-container mb-lg">
                        <table>
                            <thead>
                                <tr>
                                    <th>Responsibility</th>
                                    <th>Weight</th>
                                    <th>Your Selection</th>
                                    <th style={{ width: 120 }}>Sharing</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeResps.sort((a, b) => a.category.localeCompare(b.category)).map(resp => (
                                    <tr key={resp.id}>
                                        <td>
                                            <span className="font-semibold">{resp.title}</span>
                                            <br />
                                            <span className="text-xs text-muted">{resp.category}</span>
                                        </td>
                                        <td>{(resp.weight * 100).toFixed(1)}%</td>
                                        <td>
                                            {ownerSelectedIds.has(resp.id) ? (
                                                <span className="badge badge-green">✓ Selected</span>
                                            ) : (
                                                <span className="text-xs text-muted">—</span>
                                            )}
                                        </td>
                                        <td>
                                            <button
                                                className={`btn btn-sm ${resp.sharing_allowed === 'open' ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => handleSharingToggle(resp.id)}
                                            >
                                                {resp.sharing_allowed === 'open' ? '✓ Open' : '✕ Closed'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => setStep('selection')}>
                            ← Back to Selection
                        </button>
                        <button className="btn btn-primary btn-lg" onClick={handleProceedToAcquiring}>
                            🚀 Send to Participants →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
