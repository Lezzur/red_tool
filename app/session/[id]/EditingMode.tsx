'use client';

import { useState, useEffect } from 'react';
import { useSessionStore } from '@/lib/store';
import { Responsibility } from '@/lib/types';
import {
    addResponsibilities,
    updateSessionProfile,
    updateSessionMode,
    updateResponsibility,
    deleteResponsibility,
} from '@/lib/firestore';
import { nanoid } from 'nanoid';

interface EditingModeProps {
    isOwner: boolean;
}

export default function EditingMode({ isOwner }: EditingModeProps) {
    const { session, responsibilities, setResponsibilities, participants, currentParticipant } = useSessionStore();
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const [showNominate, setShowNominate] = useState(false);
    const [nomTitle, setNomTitle] = useState('');
    const [nomDescription, setNomDescription] = useState('');
    const [nomCategory, setNomCategory] = useState('Strategic & Leadership');
    const [genError, setGenError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [alertState, setAlertState] = useState<{ show: boolean, title: string, message: string, type: 'info' | 'error' | 'success' }>({ show: false, title: '', message: '', type: 'info' });

    useEffect(() => {
        if (session?.id) {
            const stored = localStorage.getItem(`cleaning_history_${session.id}`);
            if (stored) setHistory(JSON.parse(stored));
        }
    }, [session?.id]);

    useEffect(() => {
        if (session?.id && history.length > 0) {
            localStorage.setItem(`cleaning_history_${session.id}`, JSON.stringify(history));
        }
    }, [history, session?.id]);

    if (!session) return null;

    const categories = [...new Set(responsibilities.map(r => r.category))].sort();

    const groupedByCategory = responsibilities.reduce<Record<string, Responsibility[]>>((acc, r) => {
        if (r.status !== 'archived') {
            if (!acc[r.category]) acc[r.category] = [];
            acc[r.category].push(r);
        }
        return acc;
    }, {});

    const handleGenerate = async () => {
        setIsGenerating(true);
        setGenError('');
        try {
            const res = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ business_concept: session.business_concept }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'AI generation failed');
            }

            const data = await res.json();

            // Save business profile
            if (data.business_profile) {
                await updateSessionProfile(session.id, data.business_profile);
            }

            // Create responsibility objects
            const resps: Responsibility[] = (data.responsibilities || []).map((r: Partial<Responsibility>) => ({
                id: `resp_${nanoid(8)}`,
                session_id: session.id,
                category: r.category || 'Other',
                title: r.title || 'Untitled',
                description: r.description || '',
                weight: 0,
                criticality: r.criticality || 'Medium',
                typical_time_commitment: r.typical_time_commitment || '',
                stage_relevance: r.stage_relevance || [],
                sharing_allowed: null,
                nominated_by: ['ai'],
                status: 'active' as const,
                created_at: Date.now(),
            }));

            await addResponsibilities(resps);
            setResponsibilities([...responsibilities, ...resps]);
        } catch (err) {
            console.error(err);
            setGenError(err instanceof Error ? err.message : 'Generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAIClean = async () => {
        setIsCleaning(true);
        try {
            const res = await fetch('/api/ai/clean', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    responsibilities: responsibilities.filter(r => r.status === 'active'),
                    business_profile: session.business_profile,
                }),
            });

            if (!res.ok) throw new Error('Cleaning failed');

            const data = await res.json();
            const summary = `AI Cleaning complete:\n• Merged: ${data.summary?.merged || 0}\n• Removed: ${data.summary?.removed || 0}\n• Added: ${data.summary?.added || 0}\n• Clarified: ${data.summary?.clarified || 0}\n\nReview the updated list.`;
            setAlertState({ show: true, title: 'Optimization Complete', message: summary, type: 'success' });

            const newLog = {
                timestamp: Date.now(),
                summary: summary,
                actions: data.actions || []
            };
            setHistory(prev => [newLog, ...prev]);

            // Apply additions
            if (data.actions) {
                for (const action of data.actions) {
                    if (action.type === 'add' && action.suggested) {
                        const newResp: Responsibility = {
                            id: `resp_${nanoid(8)}`,
                            session_id: session.id,
                            category: action.suggested.category || 'Other',
                            title: action.suggested.title || 'Untitled',
                            description: action.suggested.description || '',
                            weight: 0,
                            criticality: (action.suggested.criticality as Responsibility['criticality']) || 'Medium',
                            typical_time_commitment: '',
                            stage_relevance: [],
                            sharing_allowed: null,
                            nominated_by: ['ai-clean'],
                            status: 'active',
                            created_at: Date.now(),
                        };
                        await addResponsibilities([newResp]);
                    }
                    if (action.type === 'clarify' && action.original_ids?.[0] && action.improved_description) {
                        await updateResponsibility(action.original_ids[0], {
                            description: action.improved_description,
                        });
                    }
                    if (action.type === 'remove' && action.original_ids) {
                        for (const id of action.original_ids) {
                            await updateResponsibility(id, { status: 'archived' });
                        }
                    }
                }
            }
        } catch (err) {
            console.error(err);
            setAlertState({ show: true, title: 'Error', message: 'AI Cleaning failed. You can still manually edit responsibilities.', type: 'error' });
        } finally {
            setIsCleaning(false);
        }
    };

    const handleNominate = async () => {
        if (!nomTitle.trim() || nomDescription.length < 50 || !session || !currentParticipant) return;
        setIsSubmitting(true);

        try {
            const resp: Responsibility = {
                id: `resp_${nanoid(8)}`,
                session_id: session.id,
                category: nomCategory,
                title: nomTitle.trim(),
                description: nomDescription.trim(),
                weight: 0,
                criticality: 'Medium',
                typical_time_commitment: '',
                stage_relevance: [],
                sharing_allowed: null,
                nominated_by: [currentParticipant.id],
                status: 'active',
                created_at: Date.now(),
            };

            await addResponsibilities([resp]);
            setResponsibilities([...responsibilities, resp]);
            setNomTitle('');
            setNomDescription('');
            setShowNominate(false);
        } catch (err) {
            console.error('Failed to nominate responsibility', err);
            setAlertState({ show: true, title: 'Error', message: 'Failed to submit nomination. Please try again.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        await deleteResponsibility(id);
        setResponsibilities(responsibilities.filter(r => r.id !== id));
    };

    const activeResps = responsibilities.filter(r => r.status !== 'archived');
    const activeParticipants = participants.filter(p => p.status === 'active');
    const canProceed = activeResps.length >= 15 &&
        activeResps.every(r => r.description.length >= 50) &&
        new Set(activeResps.map(r => r.title)).size === activeResps.length &&
        activeParticipants.length >= 2;

    const handleProceed = async () => {
        if (!canProceed) {
            let message = '';
            if (activeResps.length < 15) message += '\n• At least 15 responsibilities';
            if (!activeResps.every(r => r.description.length >= 50)) message += '\n• Each must have a description (50+ chars)';
            if (new Set(activeResps.map(r => r.title)).size !== activeResps.length) message += '\n• No duplicate titles';
            if (activeParticipants.length < 2) message += '\n• At least 2 active participants (including owner)';

            setAlertState({
                show: true,
                title: 'Requirements Not Met',
                message: message.trim(),
                type: 'error'
            });
            return;
        }
        await updateSessionMode(session.id, 'processing');
    };

    return (
        <div>
            {/* Business Profile */}
            {session.business_profile && (
                <div className="card mb-xl" style={{ padding: 'var(--space-md)' }}>
                    <h3 className="card-title mb-sm">📊 Business Profile</h3>
                    <div className="flex gap-md flex-wrap">
                        <span className="badge badge-blue">{session.business_profile.type}</span>
                        <span className="badge badge-purple">{session.business_profile.industry}</span>
                        <span className="badge badge-green">{session.business_profile.stage}</span>
                        <span className="badge badge-yellow">{session.business_profile.model}</span>
                    </div>
                </div>
            )}

            {/* Invite Team */}
            {isOwner && participants.some(p => !p.is_owner && p.status !== 'removed') && (
                <div className="card mb-xl" style={{ padding: 'var(--space-md)' }}>
                    <h3 className="card-title mb-sm">👥 Invite Team to Nominate</h3>
                    <p className="text-sm text-secondary mb-md">
                        Share these links with your co-founders so they can suggest responsibilities.
                    </p>
                    <div className="grid-2 gap-md">
                        {participants.filter(p => !p.is_owner && p.status !== 'removed').map((p, i) => (
                            <div key={p.id} className="flex justify-between items-center p-sm bg-glass rounded border border-default">
                                <div>
                                    <div className="font-semibold">{p.name || `Participant ${i + 1}`}</div>
                                    <div className="text-xs text-secondary capitalize">{p.status}</div>
                                </div>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => {
                                        const url = `${window.location.origin}/join/${p.access_token}`;
                                        navigator.clipboard.writeText(url);
                                        setAlertState({ show: true, title: 'Copied', message: 'Link copied to clipboard!', type: 'success' });
                                    }}
                                >
                                    🔗 Copy Link
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-value">{activeResps.length}</div>
                    <div className="stat-label">Responsibilities</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{categories.length}</div>
                    <div className="stat-label">Categories</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{participants.filter(p => p.status === 'active' || p.status === 'invited').length}</div>
                    <div className="stat-label">Participants</div>
                </div>
            </div>

            {genError && <div className="alert alert-error mb-lg">⚠️ {genError}</div>}

            {alertState.show && (
                <div className="modal-overlay" onClick={() => setAlertState({ ...alertState, show: false })}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{alertState.title}</h3>
                            <button className="modal-close" onClick={() => setAlertState({ ...alertState, show: false })}>✕</button>
                        </div>
                        <div className="modal-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                            {alertState.message}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={() => setAlertState({ ...alertState, show: false })}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {showHistory && (
                <div className="modal-overlay" onClick={() => setShowHistory(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">AI Optimization History</h3>
                            <button className="modal-close" onClick={() => setShowHistory(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {history.length === 0 ? (
                                <p className="text-muted text-center py-lg">No cleaning history recorded in this session yet.</p>
                            ) : (
                                <div className="flex flex-col gap-md">
                                    {history.map((log, i) => (
                                        <div key={i} className="p-md bg-glass border border-subtle rounded">
                                            <div className="flex justify-between mb-sm">
                                                <span className="font-semibold text-sm">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                <span className="badge badge-purple text-xs">AI Clean</span>
                                            </div>
                                            <p className="text-sm whitespace-pre-wrap text-secondary mb-md">{log.summary}</p>

                                            {/* Detailed Added */}
                                            {log.actions?.filter((a: any) => a.type === 'add').length > 0 && (
                                                <div className="mb-sm">
                                                    <div className="text-xs font-semibold text-load-green mb-xs">ADDED</div>
                                                    {log.actions.filter((a: any) => a.type === 'add').map((a: any, idx: number) => (
                                                        <div key={idx} className="text-xs text-muted pl-sm border-l border-load-green mb-1">
                                                            {a.suggested?.title || 'Unknown'} <span className="text-tertiary">({a.suggested?.category})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Detailed Removed */}
                                            {log.actions?.filter((a: any) => a.type === 'remove').length > 0 && (
                                                <div className="mb-sm">
                                                    <div className="text-xs font-semibold text-load-red mb-xs">REMOVED / MERGED</div>
                                                    {log.actions.filter((a: any) => a.type === 'remove').map((a: any, idx: number) => {
                                                        const removedTitle = responsibilities.find(r => r.id === a.original_ids?.[0])?.title || 'Unknown Responsibility';
                                                        return (
                                                            <div key={idx} className="text-xs text-muted pl-sm border-l border-load-red mb-1">
                                                                {removedTitle}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Detailed Clarified */}
                                            {log.actions?.filter((a: any) => a.type === 'clarify').length > 0 && (
                                                <div>
                                                    <div className="text-xs font-semibold text-mode-evaluating mb-xs">CLARIFIED</div>
                                                    {log.actions.filter((a: any) => a.type === 'clarify').map((a: any, idx: number) => {
                                                        const clarifiedTitle = responsibilities.find(r => r.id === a.original_ids?.[0])?.title || 'Unknown Responsibility';
                                                        return (
                                                            <div key={idx} className="text-xs text-muted pl-sm border-l border-mode-evaluating mb-1">
                                                                {clarifiedTitle}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Actions for All */}
            <div className="flex justify-between items-center mb-xl flex-wrap gap-md">
                <div className="flex gap-sm">
                    <button className="btn btn-secondary" onClick={() => setShowNominate(true)}>
                        ➕ Nominate Responsibility
                    </button>
                </div>

                {/* Owner Actions */}
                {isOwner && (
                    <div className="flex gap-sm flex-wrap">
                        {activeResps.length === 0 && (
                            <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={isGenerating}>
                                {isGenerating ? (
                                    <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Generating...</>
                                ) : '🤖 AI Generate Responsibilities'}
                            </button>
                        )}
                        {activeResps.length > 0 && (
                            <>
                                <button className="btn btn-secondary" onClick={() => setShowHistory(true)} title="View cleaning history">
                                    🕒 History
                                </button>
                                <button className="btn btn-secondary" onClick={handleAIClean} disabled={isCleaning}>
                                    {isCleaning ? (
                                        <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Cleaning...</>
                                    ) : '✨ AI Clean & Optimize'}
                                </button>
                                <button className="btn btn-primary" onClick={handleProceed} disabled={!canProceed}>
                                    ✅ Finalize List →
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {!canProceed && activeResps.length > 0 && isOwner && (
                <div className="alert alert-warning mb-lg">
                    ⚠️ Need 15+ responsibilities and 2+ active participants to proceed.
                </div>
            )}

            {/* Responsibility List */}
            {Object.entries(groupedByCategory).sort().map(([category, resps]) => (
                <div key={category} className="category-section">
                    <div className="category-header">
                        <h3 className="category-title">{category}</h3>
                        <span className="category-count">{resps.length}</span>
                    </div>
                    <div className="category-grid">
                        {resps.map(resp => (
                            <div key={resp.id} className="resp-card">
                                <div className="resp-card-header">
                                    <span className="resp-card-title">{resp.title}</span>
                                    {isOwner && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(resp.id)} title="Remove">
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <p className="resp-card-description">{resp.description}</p>
                                <div className="resp-card-meta">
                                    <span className={`badge ${resp.criticality === 'Critical' ? 'badge-red' :
                                        resp.criticality === 'High' ? 'badge-orange' :
                                            resp.criticality === 'Medium' ? 'badge-yellow' : 'badge-blue'
                                        }`}>
                                        {resp.criticality}
                                    </span>
                                    {resp.typical_time_commitment && (
                                        <span className="text-xs text-muted">⏱ {resp.typical_time_commitment}</span>
                                    )}
                                    <span className="text-xs text-muted">
                                        {resp.nominated_by.includes('ai') ? '🤖 AI' : '👤 Nominated'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Empty State */}
            {activeResps.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <h3 className="empty-state-title">No Responsibilities Yet</h3>
                    <p className="empty-state-text">Click &quot;AI Generate Responsibilities&quot; to create a comprehensive list based on your business concept.</p>
                </div>
            )}

            {/* Nomination Modal */}
            {showNominate && (
                <div className="modal-overlay" onClick={() => setShowNominate(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Nominate Responsibility</h3>
                            <button className="modal-close" onClick={() => setShowNominate(false)}>✕</button>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Category</label>
                            <select className="form-select" value={nomCategory} onChange={e => setNomCategory(e.target.value)}>
                                <option>Strategic & Leadership</option>
                                <option>Product & Technology</option>
                                <option>Sales & Business Development</option>
                                <option>Marketing & Brand</option>
                                <option>Operations & Finance</option>
                                <option>People & Culture</option>
                                <option>Customer Success & Support</option>
                                <option>Administrative</option>
                                <option>Other</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Title</label>
                            <input
                                className="form-input"
                                placeholder="e.g., Product Strategy & Roadmap"
                                value={nomTitle}
                                onChange={e => setNomTitle(e.target.value)}
                                maxLength={100}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Describe the scope of this responsibility in 2-4 sentences..."
                                value={nomDescription}
                                onChange={e => setNomDescription(e.target.value)}
                            />
                            <div className={`char-counter ${nomDescription.length < 50 ? 'error' : ''}`}>
                                {nomDescription.length}/50 min
                            </div>
                        </div>

                        <div className="modal-footer" style={{ flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <p className="text-xs text-muted" style={{ textAlign: 'center' }}>
                                Your nomination will be instantly added to the shared list for everyone to see.
                            </p>
                            <div className="flex justify-end gap-sm" style={{ width: '100%' }}>
                                <button className="btn btn-secondary" onClick={() => setShowNominate(false)}>Cancel</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleNominate}
                                    disabled={!nomTitle.trim() || nomDescription.length < 50}
                                >
                                    Submit Nomination
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
