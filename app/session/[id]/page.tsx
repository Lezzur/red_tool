'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSessionStore } from '@/lib/store';
import {
    getSession,
    getSessionParticipants,
    getSessionResponsibilities,
    getSessionSelections,
    getSessionAssignments,
    getSessionFactors,
    onSessionChange,
    onParticipantsChange,
    onResponsibilitiesChange,
    onSelectionsChange,
} from '@/lib/firestore';
import EditingMode from './EditingMode';
import ProcessingMode from './ProcessingMode';
import AcquiringMode from './AcquiringMode';
import EvaluatingMode from './EvaluatingMode';
import CompletedMode from './CompletedMode';

const MODE_LABELS: Record<string, string> = {
    setup: 'Setup',
    editing: 'Editing Mode',
    processing: 'Processing',
    acquiring: 'Acquiring Mode',
    evaluating: 'Evaluating Mode',
    completed: 'Completed',
};

const MODE_CLASSES: Record<string, string> = {
    editing: 'editing',
    processing: 'editing',
    acquiring: 'acquiring',
    evaluating: 'evaluating',
    completed: 'completed',
};

const STEPS = [
    { label: 'Editing', modes: ['editing'] },
    { label: 'Processing', modes: ['processing'] },
    { label: 'Acquiring', modes: ['acquiring'] },
    { label: 'Evaluating', modes: ['evaluating'] },
    { label: 'Completed', modes: ['completed'] },
];

export default function SessionPage() {
    const params = useParams();
    const sessionId = params.id as string;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const {
        session, setSession,
        participants, setParticipants,
        responsibilities, setResponsibilities,
        selections, setSelections,
        setAssignments,
        setFactors,
        currentParticipant, setCurrentParticipant,
    } = useSessionStore();

    const loadSessionData = useCallback(async () => {
        try {
            const sessionData = await getSession(sessionId);
            if (!sessionData) {
                setError('Session not found');
                setLoading(false);
                return;
            }
            setSession(sessionData);

            const [parts, resps, sels, assigns, facts] = await Promise.all([
                getSessionParticipants(sessionId),
                getSessionResponsibilities(sessionId),
                getSessionSelections(sessionId),
                getSessionAssignments(sessionId),
                getSessionFactors(sessionId),
            ]);

            setParticipants(parts);
            setResponsibilities(resps);
            setSelections(sels);
            setAssignments(assigns);
            setFactors(facts);

            // Check if current user is owner or participant
            const storedToken = localStorage.getItem(`owner_${sessionId}`);
            const storedParticipantId = localStorage.getItem(`participant_id_${sessionId}`);
            const owner = parts.find(p => p.is_owner && p.access_token === storedToken);
            if (owner) {
                setCurrentParticipant(owner);
            } else if (storedParticipantId) {
                const participant = parts.find(p => p.id === storedParticipantId && p.status !== 'removed');
                if (participant) {
                    setCurrentParticipant(participant);
                }
            }

            setLoading(false);
        } catch (err) {
            console.error(err);
            setError('Failed to load session');
            setLoading(false);
        }
    }, [sessionId, setSession, setParticipants, setResponsibilities, setSelections, setAssignments, setFactors, setCurrentParticipant]);

    useEffect(() => {
        loadSessionData();
    }, [loadSessionData]);

    // Real-time listeners
    useEffect(() => {
        if (!sessionId) return;

        const unsubs = [
            onSessionChange(sessionId, setSession),
            onParticipantsChange(sessionId, setParticipants),
            onResponsibilitiesChange(sessionId, setResponsibilities),
            onSelectionsChange(sessionId, setSelections),
        ];

        return () => unsubs.forEach(u => u());
    }, [sessionId, setSession, setParticipants, setResponsibilities, setSelections]);

    if (loading) {
        return (
            <div className="loading-overlay" style={{ minHeight: '100vh' }}>
                <div className="spinner spinner-lg" />
                <p>Loading session...</p>
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className="page-container" style={{ textAlign: 'center', paddingTop: 'var(--space-3xl)' }}>
                <div className="empty-state">
                    <div className="empty-state-icon">❌</div>
                    <h2 className="empty-state-title">{error || 'Session not found'}</h2>
                    <p className="empty-state-text">This session may have been deleted or the link is invalid.</p>
                    <a href="/" className="btn btn-primary" style={{ marginTop: 'var(--space-lg)' }}>← Back to Home</a>
                </div>
            </div>
        );
    }

    const isOwner = currentParticipant?.is_owner === true;
    const currentMode = session.mode;
    const modeClass = MODE_CLASSES[currentMode] || 'editing';

    const getCurrentStepIndex = () => {
        return STEPS.findIndex(s => s.modes.includes(currentMode));
    };

    const renderMode = () => {
        switch (currentMode) {
            case 'editing':
                return <EditingMode isOwner={isOwner} />;
            case 'processing':
                return <ProcessingMode isOwner={isOwner} />;
            case 'acquiring':
                return <AcquiringMode isOwner={isOwner} />;
            case 'evaluating':
                return <EvaluatingMode />;
            case 'completed':
                return <CompletedMode />;
            default:
                return <EditingMode isOwner={isOwner} />;
        }
    };

    return (
        <div className="page-container">
            {/* Header */}
            <div className="flex justify-between items-center mb-lg">
                <div>
                    <h1 className="page-title" style={{ fontSize: 'var(--font-2xl)' }}>{session.business_name}</h1>
                    <p className="text-sm text-secondary">
                        Session ID: {session.id} · {participants.filter(p => p.status !== 'removed').length} participants · {responsibilities.length} responsibilities
                    </p>
                </div>
                {isOwner && <span className="badge badge-purple">👑 Owner</span>}
            </div>

            {/* Mode Indicator */}
            <div className={`mode-indicator ${modeClass}`}>
                <div className="mode-dot" />
                <span className="mode-label">{MODE_LABELS[currentMode]}</span>
                {isOwner && (
                    <span className="text-xs text-secondary" style={{ marginLeft: 'auto' }}>
                        Owner View
                    </span>
                )}
            </div>

            {/* Progress Stepper */}
            <div className="stepper">
                {STEPS.map((step, i) => {
                    const currentIdx = getCurrentStepIndex();
                    const isActive = i === currentIdx;
                    const isComplete = i < currentIdx;
                    const stepClass = isActive ? 'active' : isComplete ? 'completed' : '';

                    return (
                        <div key={step.label} style={{ display: 'contents' }}>
                            <div className={`stepper-step ${stepClass}`}>
                                <div className="stepper-dot">
                                    {isComplete ? '✓' : i + 1}
                                </div>
                                <span className="stepper-label">{step.label}</span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`stepper-line ${isComplete ? 'completed' : ''}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Mode Content */}
            {renderMode()}
        </div>
    );
}
