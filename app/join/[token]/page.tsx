'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getParticipantByToken, updateParticipant, saveAdditionalFactors } from '@/lib/firestore';
import { Participant, AdditionalFactors, StartupExperience, DomainExpertise, LeadershipLevel, DurationUnit } from '@/lib/types';
import { nanoid } from 'nanoid';

type OnboardingStep = 'loading' | 'info' | 'experience' | 'commitment' | 'investment' | 'ready';

export default function JoinPage() {
    const params = useParams();
    const router = useRouter();
    const token = params.token as string;
    const [step, setStep] = useState<OnboardingStep>('loading');
    const [error, setError] = useState('');
    const [participant, setParticipant] = useState<Participant | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Step 1: Info
    const [name, setName] = useState('');

    // Step 2: Experience
    const [experienceDescription, setExperienceDescription] = useState('');
    const [startupExperience, setStartupExperience] = useState<StartupExperience>('none');
    const [domainExpertise, setDomainExpertise] = useState<DomainExpertise>('beginner');
    const [leadershipLevel, setLeadershipLevel] = useState<LeadershipLevel>('none');

    // Step 3: Commitment
    const [timeMin, setTimeMin] = useState(10);
    const [timeMax, setTimeMax] = useState(40);
    const [durationValue, setDurationValue] = useState(1);
    const [durationUnit, setDurationUnit] = useState<DurationUnit>('years');

    // Step 4: Investment
    const [currency, setCurrency] = useState<'PHP' | 'USD'>('PHP');
    const [cashInvestment, setCashInvestment] = useState(0);
    const [resourcesContributed, setResourcesContributed] = useState(0);

    useEffect(() => {
        async function lookupToken() {
            try {
                const p = await getParticipantByToken(token);
                if (!p) {
                    setError('Invalid or expired link.');
                    return;
                }
                setParticipant(p);
                setName(p.name || '');

                // Activate participant
                if (p.status === 'invited') {
                    await updateParticipant(p.id, { status: 'active' });
                }

                // Store for session
                localStorage.setItem(`participant_id_${p.session_id}`, p.id);

                setStep('info');
            } catch (err) {
                console.error(err);
                setError('Failed to validate link.');
            }
        }
        lookupToken();
    }, [token]);

    const handleSubmit = async () => {
        if (!participant) return;
        setIsSaving(true);

        try {
            // Update participant name
            await updateParticipant(participant.id, { name: name.trim() });

            // Save additional factors
            const factors: AdditionalFactors = {
                id: nanoid(12),
                session_id: participant.session_id,
                participant_id: participant.id,
                experience_description: experienceDescription.trim(),
                experience_description_rating: 0, // Owner will rate this later
                startup_experience: startupExperience,
                domain_expertise: domainExpertise,
                leadership_level: leadershipLevel,
                time_commitment_hours_min: timeMin,
                time_commitment_hours_max: timeMax,
                duration_commitment_value: durationValue,
                duration_commitment_unit: durationUnit,
                currency: currency,
                cash_investment: cashInvestment,
                resources_contributed: resourcesContributed,
                updated_at: Date.now(),
                updated_by: participant.id,
            };

            await saveAdditionalFactors(factors);

            router.push(`/session/${participant.session_id}`);
        } catch (err) {
            console.error(err);
            setError('Failed to save your details. Please try again.');
            setIsSaving(false);
        }
    };

    // ─── Loading ───────────────────────────────────────────
    if (step === 'loading') {
        return (
            <div className="loading-overlay" style={{ minHeight: '100vh' }}>
                <div className="spinner spinner-lg" />
                <p>Validating your link...</p>
            </div>
        );
    }

    // ─── Error ─────────────────────────────────────────────
    if (error) {
        return (
            <div className="page-container" style={{ textAlign: 'center', paddingTop: 'var(--space-3xl)' }}>
                <div className="empty-state">
                    <div className="empty-state-icon">🔗</div>
                    <h2 className="empty-state-title">{error}</h2>
                    <p className="empty-state-text">Contact the session owner for a valid invitation link.</p>
                    <a href="/" className="btn btn-primary" style={{ marginTop: 'var(--space-lg)' }}>← Back to Home</a>
                </div>
            </div>
        );
    }

    const STEPS: { key: OnboardingStep; label: string; number: number }[] = [
        { key: 'info', label: 'Your Info', number: 1 },
        { key: 'experience', label: 'Experience', number: 2 },
        { key: 'commitment', label: 'Commitment', number: 3 },
        { key: 'investment', label: 'Investment', number: 4 },
    ];

    const currentStepIdx = STEPS.findIndex(s => s.key === step);

    return (
        <div className="page-container" style={{ maxWidth: 640 }}>
            {/* Header */}
            <div style={{ textAlign: 'center', padding: 'var(--space-2xl) 0 var(--space-lg)' }}>
                <span style={{ fontSize: 48, display: 'block', marginBottom: 'var(--space-sm)' }}>⚖️</span>
                <h1 className="page-title" style={{ fontSize: 'var(--font-2xl)' }}>Welcome to EquiSplit</h1>
                <p className="page-subtitle">Tell us about yourself before joining the session.</p>
            </div>

            {/* Progress Steps */}
            <div className="stepper" style={{ marginBottom: 'var(--space-xl)' }}>
                {STEPS.map((s, i) => {
                    const isActive = i === currentStepIdx;
                    const isComplete = i < currentStepIdx;
                    const stepClass = isActive ? 'active' : isComplete ? 'completed' : '';
                    return (
                        <div key={s.key} style={{ display: 'contents' }}>
                            <div className={`stepper-step ${stepClass}`}>
                                <div className="stepper-dot">{isComplete ? '✓' : s.number}</div>
                                <span className="stepper-label">{s.label}</span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`stepper-line ${isComplete ? 'completed' : ''}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ─── Step 1: Info ───────────────────────────────── */}
            {step === 'info' && (
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    <h2 className="section-title">Your Info</h2>
                    <p className="section-subtitle">Confirm or update your display name for this session.</p>

                    <div className="form-group">
                        <label className="form-label">Your Name</label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder="Enter your name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={50}
                        />
                    </div>

                    <div className="flex justify-end mt-lg">
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep('experience')}
                            disabled={!name.trim()}
                        >
                            Next: Experience →
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Step 2: Experience ─────────────────────────── */}
            {step === 'experience' && (
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    <h2 className="section-title">Your Experience</h2>
                    <p className="section-subtitle">Tell us about your relevant skills and background.</p>

                    <div className="form-group">
                        <label className="form-label">Experience Description</label>
                        <textarea
                            className="form-textarea"
                            placeholder="Describe your relevant experience, skills, and industry knowledge. E.g., '10 years in B2B SaaS sales, led teams of 5-15 reps, closed $50M+ in revenue...'"
                            value={experienceDescription}
                            onChange={e => setExperienceDescription(e.target.value)}
                            style={{ minHeight: 120 }}
                        />
                        <div className={`char-counter ${experienceDescription.length < 100 ? 'error' : ''}`}>
                            {experienceDescription.length}/100 min characters
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Previous Startup Experience</label>
                        <p className="form-hint">Venture-backed or team-based startups with co-founders (not solo ventures or freelancing).</p>
                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                            {([['none', 'None'], ['1', '1 Startup'], ['2-3', '2-3 Startups'], ['4+', '4+ Startups']] as [StartupExperience, string][]).map(([val, label]) => (
                                <button
                                    key={val}
                                    className={`btn ${startupExperience === val ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setStartupExperience(val)}
                                    type="button"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Domain Expertise</label>
                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                            {([['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['expert', 'Expert']] as [DomainExpertise, string][]).map(([val, label]) => (
                                <button
                                    key={val}
                                    className={`btn ${domainExpertise === val ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setDomainExpertise(val)}
                                    type="button"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Leadership Experience</label>
                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                            {([['none', 'None'], ['team_lead', 'Team Lead'], ['manager', 'Manager'], ['director', 'Director'], ['c_level', 'C-Level']] as [LeadershipLevel, string][]).map(([val, label]) => (
                                <button
                                    key={val}
                                    className={`btn ${leadershipLevel === val ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setLeadershipLevel(val)}
                                    type="button"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => setStep('info')}>
                            ← Back
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep('commitment')}
                            disabled={experienceDescription.length < 100}
                        >
                            Next: Commitment →
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Step 3: Commitment ─────────────────────────── */}
            {step === 'commitment' && (
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    <h2 className="section-title">Your Commitment</h2>
                    <p className="section-subtitle">How much time can you dedicate to this venture?</p>

                    <div className="form-group">
                        <label className="form-label">Weekly Time Commitment (Hours/Week)</label>
                        <p className="form-hint">Estimate your minimum and maximum weekly hours.</p>
                        <div className="grid-2" style={{ gap: 'var(--space-md)' }}>
                            <div>
                                <label className="form-label text-xs">Minimum Hours</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    min={0} max={168}
                                    value={timeMin === 0 ? '' : timeMin}
                                    onChange={e => {
                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                        setTimeMin(val);
                                        if (val > timeMax) setTimeMax(val);
                                    }}
                                />
                            </div>
                            <div>
                                <label className="form-label text-xs">Maximum Hours</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    min={0} max={168}
                                    value={timeMax === 0 ? '' : timeMax}
                                    onChange={e => {
                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                        setTimeMax(val);
                                        if (val < timeMin) setTimeMin(val);
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Duration Commitment</label>
                        <p className="form-hint">How long are you committing to stick with this venture?</p>
                        <div className="flex gap-md">
                            <input
                                className="form-input"
                                type="number"
                                min={1}
                                value={durationValue === 0 ? '' : durationValue}
                                onChange={e => setDurationValue(e.target.value === '' ? 0 : Math.max(1, parseInt(e.target.value)))}
                                style={{ width: 100 }}
                            />
                            <div className="flex gap-sm">
                                <button
                                    className={`btn ${durationUnit === 'months' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setDurationUnit('months')}
                                >
                                    Months
                                </button>
                                <button
                                    className={`btn ${durationUnit === 'years' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setDurationUnit('years')}
                                >
                                    Years
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => setStep('experience')}>
                            ← Back
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep('investment')}>
                            Next: Investment →
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Step 4: Investment ─────────────────────────── */}
            {step === 'investment' && (
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    <h2 className="section-title">Financial Investment</h2>
                    <p className="section-subtitle">Any cash or resources you&apos;re contributing. Enter 0 if none.</p>

                    <div className="form-group">
                        <label className="form-label">Currency</label>
                        <div className="flex gap-sm">
                            <button
                                className={`btn ${currency === 'PHP' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setCurrency('PHP')}
                            >
                                PHP (₱)
                            </button>
                            <button
                                className={`btn ${currency === 'USD' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setCurrency('USD')}
                            >
                                USD ($)
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Cash Investment ({currency})</label>
                        <input
                            className="form-input"
                            type="number"
                            min={0}
                            value={cashInvestment === 0 ? '' : cashInvestment}
                            onChange={e => setCashInvestment(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value)))}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Equipment / Resources Contributed ({currency})</label>
                        <p className="form-hint">Tangible assets: computers, software licenses, office equipment, etc.</p>
                        <input
                            className="form-input"
                            type="number"
                            min={0}
                            value={resourcesContributed === 0 ? '' : resourcesContributed}
                            onChange={e => setResourcesContributed(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value)))}
                        />
                    </div>

                    <div className="card" style={{ padding: 'var(--space-md)', background: 'var(--bg-glass)', marginTop: 'var(--space-md)' }}>
                        <div className="flex justify-between items-center">
                            <span className="font-semibold">Total Investment</span>
                            <span className="font-semibold">{currency === 'PHP' ? '₱' : '$'}{(cashInvestment + resourcesContributed).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex justify-between mt-lg">
                        <button className="btn btn-secondary" onClick={() => setStep('commitment')}>
                            ← Back
                        </button>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={handleSubmit}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving...</>
                            ) : (
                                '🚀 Enter Session'
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
