'use client';

import { useState, useMemo } from 'react';
import { useSessionStore } from '@/lib/store';
import {
    AdditionalFactors,
    Assignment,
    ConflictItem,
    GapItem,
    Responsibility,
} from '@/lib/types';
import {
    saveAssignments,
    clearSessionAssignments,
    saveAdditionalFactors,
    saveCalculations,
    updateFactorWeights,
    updateSessionMode,
} from '@/lib/firestore';
import { calculateEquityDistribution } from '@/lib/calculations';
import { nanoid } from 'nanoid';

type EvalStep = 'conflicts' | 'gaps' | 'factors' | 'calculate';

export default function EvaluatingMode() {
    const {
        session, responsibilities, participants, selections,
        assignments, setAssignments,
        factors, setFactors,
        factorWeights, setFactorWeights,
        calculations, setCalculations,
    } = useSessionStore();

    const [step, setStep] = useState<EvalStep>('conflicts');
    const [conflictResolutions, setConflictResolutions] = useState<Record<string, string>>({});
    const [gapAssignments, setGapAssignments] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);

    if (!session) return null;

    const activeResps = responsibilities.filter(r => r.status !== 'archived');
    const activeParticipants = participants.filter(p => p.status !== 'removed');

    // Build selection map
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

    // Find conflicts (closed responsibilities selected by multiple people)
    const conflicts: ConflictItem[] = useMemo(() =>
        activeResps
            .filter(r => {
                const selectedBy = selectionsByResp.get(r.id) || [];
                return r.sharing_allowed === 'closed' && selectedBy.length > 1;
            })
            .map(r => ({
                responsibility: r,
                selected_by: selectionsByResp.get(r.id) || [],
            }))
        , [activeResps, selectionsByResp]);

    // Find gaps (responsibilities selected by nobody)
    const gaps: GapItem[] = useMemo(() =>
        activeResps
            .filter(r => !selectionsByResp.has(r.id) || (selectionsByResp.get(r.id)?.length ?? 0) === 0)
            .map(r => ({
                responsibility: r,
                criticality_level: r.criticality === 'Critical' ? 'critical' :
                    r.criticality === 'High' ? 'high' : 'medium',
            }))
        , [activeResps, selectionsByResp]);

    const getParticipantName = (id: string) => {
        return participants.find(p => p.id === id)?.name || 'Unknown';
    };

    // Generate assignments from selections + resolutions
    const generateAssignments = (): Assignment[] => {
        const assigns: Assignment[] = [];

        for (const resp of activeResps) {
            const selectedBy = selectionsByResp.get(resp.id) || [];

            if (resp.sharing_allowed === 'closed' && selectedBy.length > 1) {
                // Conflict — use resolution
                const winner = conflictResolutions[resp.id];
                if (winner) {
                    assigns.push({
                        id: `assign_${nanoid(8)}`,
                        session_id: session.id,
                        responsibility_id: resp.id,
                        participant_id: winner,
                        is_shared: false,
                        assigned_by: 'owner',
                        assigned_at: Date.now(),
                    });
                }
            } else if (selectedBy.length > 0) {
                // Normal assignment
                for (const pid of selectedBy) {
                    assigns.push({
                        id: `assign_${nanoid(8)}`,
                        session_id: session.id,
                        responsibility_id: resp.id,
                        participant_id: pid,
                        is_shared: selectedBy.length > 1,
                        assigned_by: 'selection',
                        assigned_at: Date.now(),
                    });
                }
            } else {
                // Gap — use gap assignment
                const assigned = gapAssignments[resp.id];
                if (assigned) {
                    assigns.push({
                        id: `assign_${nanoid(8)}`,
                        session_id: session.id,
                        responsibility_id: resp.id,
                        participant_id: assigned,
                        is_shared: false,
                        assigned_by: 'owner-gap',
                        assigned_at: Date.now(),
                    });
                }
            }
        }

        return assigns;
    };

    const handleSaveAssignments = async () => {
        const assigns = generateAssignments();
        await clearSessionAssignments(session.id);
        await saveAssignments(assigns);
        setAssignments(assigns);
    };

    // Default factors
    const getDefaultFactors = (participantId: string): AdditionalFactors => ({
        id: `factor_${participantId}`,
        session_id: session.id,
        participant_id: participantId,
        experience_description: '',
        experience_description_rating: 5,
        startup_experience: 'none',
        domain_expertise: 'intermediate',
        leadership_level: 'none',
        time_commitment_hours_min: 10,
        time_commitment_hours_max: 40,
        duration_commitment_value: 1,
        duration_commitment_unit: 'years',
        currency: 'USD',
        cash_investment: 0,
        resources_contributed: 0,
        updated_at: Date.now(),
        updated_by: 'owner',
    });

    const getFactorsForParticipant = (pid: string): AdditionalFactors => {
        return factors.find(f => f.participant_id === pid) || getDefaultFactors(pid);
    };

    const updateFactorField = (pid: string, field: keyof AdditionalFactors, value: unknown) => {
        const existing = getFactorsForParticipant(pid);
        const updated = { ...existing, [field]: value, updated_at: Date.now() };
        setFactors(factors.some(f => f.participant_id === pid)
            ? factors.map(f => f.participant_id === pid ? updated : f)
            : [...factors, updated]
        );
    };

    const handleSaveFactors = async () => {
        setIsSaving(true);
        for (const p of activeParticipants) {
            const f = getFactorsForParticipant(p.id);
            await saveAdditionalFactors(f);
        }
        setIsSaving(false);
    };

    const handleCalculate = async () => {
        setIsSaving(true);
        try {
            // Ensure assignments are saved
            await handleSaveAssignments();
            await handleSaveFactors();

            // Save factor weights
            await updateFactorWeights(session.id, factorWeights);

            // Run calculation
            const currentAssignments = generateAssignments();
            const allFactors = activeParticipants.map(p => getFactorsForParticipant(p.id));

            const results = calculateEquityDistribution(
                activeParticipants,
                currentAssignments,
                activeResps,
                allFactors,
                factorWeights
            );

            await saveCalculations(results);
            setCalculations(results);
            await updateSessionMode(session.id, 'completed');
        } catch (err) {
            console.error(err);
            alert('Calculation failed. Check your assignments and factors.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            {/* Step Tabs */}
            <div className="tabs">
                <button className={`tab ${step === 'conflicts' ? 'active' : ''}`} onClick={() => setStep('conflicts')}>
                    1. Conflicts ({conflicts.length})
                </button>
                <button className={`tab ${step === 'gaps' ? 'active' : ''}`} onClick={() => setStep('gaps')}>
                    2. Gaps ({gaps.length})
                </button>
                <button className={`tab ${step === 'factors' ? 'active' : ''}`} onClick={() => setStep('factors')}>
                    3. Additional Factors
                </button>
                <button className={`tab ${step === 'calculate' ? 'active' : ''}`} onClick={() => setStep('calculate')}>
                    4. Calculate
                </button>
            </div>

            {/* STEP 1: Conflicts */}
            {step === 'conflicts' && (
                <div>
                    <h2 className="section-title">Resolve Conflicts</h2>
                    <p className="section-subtitle">These closed responsibilities were selected by multiple people. Choose one winner for each.</p>

                    {conflicts.length === 0 ? (
                        <div className="alert alert-success">✅ No conflicts! All closed responsibilities have a single selector.</div>
                    ) : (
                        conflicts.map(conflict => (
                            <div key={conflict.responsibility.id} className="card mb-md">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-semibold">{conflict.responsibility.title}</h4>
                                        <p className="text-sm text-secondary">{conflict.responsibility.description}</p>
                                        <span className="badge badge-blue mt-md">{(conflict.responsibility.weight * 100).toFixed(1)}%</span>
                                    </div>
                                </div>

                                <div className="mt-md">
                                    <label className="form-label">Assign to:</label>
                                    <div className="flex gap-sm flex-wrap mt-md">
                                        {conflict.selected_by.map(pid => (
                                            <button
                                                key={pid}
                                                className={`btn ${conflictResolutions[conflict.responsibility.id] === pid ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => setConflictResolutions({ ...conflictResolutions, [conflict.responsibility.id]: pid })}
                                            >
                                                {getParticipantName(pid)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => updateSessionMode(session.id, 'acquiring')}>
                            ← Back to Acquiring
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep('gaps')}
                            disabled={conflicts.some(c => !conflictResolutions[c.responsibility.id])}
                        >
                            Next: Gaps →
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: Gaps */}
            {step === 'gaps' && (
                <div>
                    <h2 className="section-title">Manage Gaps</h2>
                    <p className="section-subtitle">These responsibilities weren&apos;t selected by anyone. Assign them or leave unassigned.</p>

                    {gaps.length === 0 ? (
                        <div className="alert alert-success">✅ All responsibilities have been selected.</div>
                    ) : (
                        gaps.map(gap => (
                            <div key={gap.responsibility.id} className="card mb-md">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-semibold">{gap.responsibility.title}</h4>
                                        <p className="text-sm text-secondary">{gap.responsibility.description}</p>
                                        <div className="flex gap-sm mt-md">
                                            <span className="badge badge-blue">{(gap.responsibility.weight * 100).toFixed(1)}%</span>
                                            <span className={`badge ${gap.criticality_level === 'critical' ? 'badge-red' :
                                                gap.criticality_level === 'high' ? 'badge-orange' : 'badge-yellow'
                                                }`}>
                                                {gap.responsibility.criticality}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-md">
                                    <label className="form-label">Assign to:</label>
                                    <select
                                        className="form-select"
                                        value={gapAssignments[gap.responsibility.id] || ''}
                                        onChange={e => setGapAssignments({ ...gapAssignments, [gap.responsibility.id]: e.target.value })}
                                    >
                                        <option value="">Leave unassigned</option>
                                        {activeParticipants.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ))
                    )}

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => setStep('conflicts')}>← Conflicts</button>
                        <button className="btn btn-primary" onClick={() => { handleSaveAssignments(); setStep('factors'); }}>
                            Next: Additional Factors →
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: Additional Factors */}
            {step === 'factors' && (
                <div>
                    <h2 className="section-title">Additional Factors</h2>
                    <p className="section-subtitle">Rate each participant&apos;s experience, time commitment, and investment to adjust equity beyond responsibilities.</p>

                    {/* Factor Weight Sliders */}
                    <div className="card mb-xl">
                        <h3 className="card-title mb-md">⚖️ Factor Weights</h3>
                        <p className="text-sm text-secondary mb-md">Adjust how much each factor influences the final equity calculation.</p>

                        {[
                            { key: 'responsibility_weight' as const, label: 'Responsibilities', min: 0.4, max: 0.8 },
                            { key: 'experience_weight' as const, label: 'Experience', min: 0, max: 0.3 },
                            { key: 'time_weight' as const, label: 'Time Commitment', min: 0, max: 0.3 },
                            { key: 'investment_weight' as const, label: 'Investment', min: 0, max: 0.3 },
                        ].map(({ key, label, min, max }) => (
                            <div key={key} className="mb-md">
                                <label className="form-label">{label}</label>
                                <div className="slider-container">
                                    <input
                                        type="range"
                                        className="slider"
                                        min={min * 100}
                                        max={max * 100}
                                        value={factorWeights[key] * 100}
                                        onChange={e => setFactorWeights({ ...factorWeights, [key]: parseFloat(e.target.value) / 100 })}
                                    />
                                    <span className="slider-value">{(factorWeights[key] * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        ))}

                        <div className={`alert ${Math.abs(
                            factorWeights.responsibility_weight + factorWeights.experience_weight +
                            factorWeights.time_weight + factorWeights.investment_weight - 1
                        ) < 0.01 ? 'alert-success' : 'alert-warning'} mt-md`}>
                            Total: {((factorWeights.responsibility_weight + factorWeights.experience_weight +
                                factorWeights.time_weight + factorWeights.investment_weight) * 100).toFixed(0)}%
                            {Math.abs(factorWeights.responsibility_weight + factorWeights.experience_weight +
                                factorWeights.time_weight + factorWeights.investment_weight - 1) < 0.01
                                ? ' ✓' : ' — should total 100%'}
                        </div>
                    </div>

                    {/* Per-participant factors */}
                    {activeParticipants.map(p => {
                        const f = getFactorsForParticipant(p.id);
                        return (
                            <div key={p.id} className="card mb-lg">
                                <h3 className="card-title mb-md">
                                    {p.is_owner ? '👑' : '👤'} {p.name}
                                </h3>

                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Experience Description Rating (0-10)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={f.experience_description_rating}
                                            onChange={e => updateFactorField(p.id, 'experience_description_rating', Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                                            min={0} max={10}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Startup Experience</label>
                                        <select className="form-select" value={f.startup_experience}
                                            onChange={e => updateFactorField(p.id, 'startup_experience', e.target.value)}>
                                            <option value="none">None</option>
                                            <option value="1">1 startup</option>
                                            <option value="2-3">2-3 startups</option>
                                            <option value="4+">4+ startups</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Domain Expertise</label>
                                        <select className="form-select" value={f.domain_expertise}
                                            onChange={e => updateFactorField(p.id, 'domain_expertise', e.target.value)}>
                                            <option value="beginner">Beginner</option>
                                            <option value="intermediate">Intermediate</option>
                                            <option value="advanced">Advanced</option>
                                            <option value="expert">Expert</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Leadership Level</label>
                                        <select className="form-select" value={f.leadership_level}
                                            onChange={e => updateFactorField(p.id, 'leadership_level', e.target.value)}>
                                            <option value="none">None</option>
                                            <option value="team_lead">Team Lead</option>
                                            <option value="manager">Manager</option>
                                            <option value="director">Director</option>
                                            <option value="c_level">C-Level</option>
                                        </select>
                                    </div>

                                    {/* Updated Time Duration Inputs */}
                                    <div className="form-group">
                                        <label className="form-label">Weekly Hours (Min)</label>
                                        <input type="number" className="form-input" value={f.time_commitment_hours_min === 0 ? '' : f.time_commitment_hours_min}
                                            onChange={e => updateFactorField(p.id, 'time_commitment_hours_min', e.target.value === '' ? 0 : parseInt(e.target.value))}
                                            min={0} max={168} />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Weekly Hours (Max)</label>
                                        <input type="number" className="form-input" value={f.time_commitment_hours_max === 0 ? '' : f.time_commitment_hours_max}
                                            onChange={e => updateFactorField(p.id, 'time_commitment_hours_max', e.target.value === '' ? 0 : parseInt(e.target.value))}
                                            min={0} max={168} />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Duration Value</label>
                                        <input type="number" className="form-input" value={f.duration_commitment_value}
                                            onChange={e => updateFactorField(p.id, 'duration_commitment_value', Math.max(1, parseInt(e.target.value) || 1))}
                                            min={1} />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Duration Unit</label>
                                        <select className="form-select" value={f.duration_commitment_unit}
                                            onChange={e => updateFactorField(p.id, 'duration_commitment_unit', e.target.value)}>
                                            <option value="months">Months</option>
                                            <option value="years">Years</option>
                                        </select>
                                    </div>

                                    {/* Updated Investment Inputs */}
                                    <div className="form-group">
                                        <label className="form-label">Currency</label>
                                        <select className="form-select" value={f.currency}
                                            onChange={e => updateFactorField(p.id, 'currency', e.target.value)}>
                                            <option value="PHP">PHP (₱)</option>
                                            <option value="USD">USD ($)</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Cash Investment ({f.currency === 'PHP' ? '₱' : '$'})</label>
                                        <input type="number" className="form-input" value={f.cash_investment === 0 ? '' : f.cash_investment}
                                            onChange={e => updateFactorField(p.id, 'cash_investment', e.target.value === '' ? 0 : parseInt(e.target.value))}
                                            min={0} />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Resources ({f.currency === 'PHP' ? '₱' : '$'})</label>
                                        <input type="number" className="form-input" value={f.resources_contributed === 0 ? '' : f.resources_contributed}
                                            onChange={e => updateFactorField(p.id, 'resources_contributed', e.target.value === '' ? 0 : parseInt(e.target.value))}
                                            min={0} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => setStep('gaps')}>← Gaps</button>
                        <button className="btn btn-primary" onClick={() => { handleSaveFactors(); setStep('calculate'); }}>
                            {isSaving ? 'Saving...' : 'Next: Calculate →'}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4: Calculate */}
            {step === 'calculate' && (
                <div>
                    <h2 className="section-title">Calculate Equity Distribution</h2>
                    <p className="section-subtitle">Review your configuration and compute the final equity split.</p>

                    {/* Summary */}
                    <div className="stat-grid">
                        <div className="stat-card">
                            <div className="stat-value">{activeParticipants.length}</div>
                            <div className="stat-label">Participants</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{activeResps.length}</div>
                            <div className="stat-label">Responsibilities</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{conflicts.length}</div>
                            <div className="stat-label">Conflicts Resolved</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {(factorWeights.responsibility_weight * 100).toFixed(0)}/
                                {(factorWeights.experience_weight * 100).toFixed(0)}/
                                {(factorWeights.time_weight * 100).toFixed(0)}/
                                {(factorWeights.investment_weight * 100).toFixed(0)}
                            </div>
                            <div className="stat-label">R/E/T/I Weights</div>
                        </div>
                    </div>

                    {/* Preview of assignments */}
                    {assignments.length > 0 && (
                        <div className="card mb-xl">
                            <h3 className="card-title mb-md">📋 Assignment Preview</h3>
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Responsibility</th>
                                            <th>Assigned To</th>
                                            <th>Shared</th>
                                            <th>Weight</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assignments.map(a => {
                                            const resp = activeResps.find(r => r.id === a.responsibility_id);
                                            return (
                                                <tr key={a.id}>
                                                    <td className="font-semibold">{resp?.title || 'Unknown'}</td>
                                                    <td>{getParticipantName(a.participant_id)}</td>
                                                    <td>{a.is_shared ? '✓ Shared' : '—'}</td>
                                                    <td>{resp ? (resp.weight * 100).toFixed(1) + '%' : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between">
                        <button className="btn btn-secondary" onClick={() => setStep('factors')}>← Factors</button>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={handleCalculate}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Calculating...</>
                            ) : '🧮 Calculate & Complete'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
