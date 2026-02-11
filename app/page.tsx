'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSession, addParticipant } from '@/lib/firestore';

export default function HomePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [businessConcept, setBusinessConcept] = useState('');
  const [participantCount, setParticipantCount] = useState(1);
  const [participantNames, setParticipantNames] = useState<string[]>(['']);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleParticipantCountChange = (count: number) => {
    setParticipantCount(count);
    const currentNames = [...participantNames];
    if (count > currentNames.length) {
      while (currentNames.length < count) currentNames.push('');
    } else {
      currentNames.splice(count);
    }
    setParticipantNames(currentNames);
  };

  const updateParticipantName = (index: number, name: string) => {
    const updated = [...participantNames];
    updated[index] = name;
    setParticipantNames(updated);
  };

  const handleCreate = async () => {
    setError('');

    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }
    if (businessConcept.length < 100) {
      setError('Business concept must be at least 100 characters');
      return;
    }

    setIsCreating(true);

    try {
      // Timeout wrapper — abort after 15 seconds
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out. Please check your internet connection and try again.')), 15000)
      );

      const createPromise = (async () => {
        console.log('Creating session...');
        const { session, owner } = await createSession({
          business_name: businessName.trim(),
          business_concept: businessConcept.trim(),
          participant_count: participantCount,
          session_type: 'asynchronous',
        });
        console.log('Session created:', session.id);

        // Add participants
        console.log('Adding participants:', participantNames);
        for (const name of participantNames) {
          if (name.trim()) {
            await addParticipant(session.id, name.trim());
            console.log('Added participant:', name);
          }
        }

        // Store owner token locally
        localStorage.setItem(`owner_${session.id}`, owner.access_token);
        localStorage.setItem(`participant_id_${session.id}`, owner.id);

        console.log('Navigating to onboarding...');
        router.push(`/session/${session.id}/onboarding`);
      })();

      await Promise.race([createPromise, timeoutPromise]);
    } catch (err: any) {
      console.error('Create session error:', err);
      setError(err?.message || 'Failed to create session. Check your Firebase config and network connection.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: 'var(--space-3xl) 0 var(--space-2xl)' }}>
        <span style={{ fontSize: 56, display: 'block', marginBottom: 'var(--space-md)' }}>⚖️</span>
        <h1 className="page-title" style={{ fontSize: 'var(--font-4xl)' }}>EquiSplit</h1>
        <p className="page-subtitle" style={{ maxWidth: 500, margin: '0 auto' }}>
          AI-powered equity distribution for co-founders. Fair, transparent, and data-driven.
        </p>
      </div>

      {/* Create Session Form */}
      <div className="card" style={{ padding: 'var(--space-xl)' }}>
        <h2 className="section-title">Create New Session</h2>
        <p className="section-subtitle">Set up your equity distribution session. You&apos;ll be the owner with full control.</p>

        {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-lg)' }}>⚠️ {error}</div>}

        <div className="form-group">
          <label className="form-label">Business Name</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g., TechCo, MyStartup"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Business Concept</label>
          <textarea
            className="form-textarea"
            placeholder="Describe your business idea in detail. Include what you're building, who it's for, your business model, and current stage. The more detail you provide, the better the AI can generate relevant responsibilities..."
            value={businessConcept}
            onChange={e => setBusinessConcept(e.target.value)}
            style={{ minHeight: 160 }}
          />
          <div className={`char-counter ${businessConcept.length < 100 ? 'error' : ''}`}>
            {businessConcept.length}/100 min characters
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Number of Participants (excluding you)</label>
          <input
            className="form-input"
            type="number"
            min={1}
            max={50}
            value={participantCount}
            onChange={e => handleParticipantCountChange(Math.max(1, parseInt(e.target.value) || 0))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Participant Names</label>
          <div className="flex flex-col gap-sm">
            {participantNames.map((name, i) => (
              <input
                key={i}
                className="form-input"
                type="text"
                placeholder={`Participant ${i + 1} name`}
                value={name}
                onChange={e => updateParticipantName(i, e.target.value)}
              />
            ))}
          </div>
          <p className="form-hint">You can add or rename participants later.</p>
        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={handleCreate}
          disabled={isCreating || businessConcept.length < 100 || !businessName.trim()}
          style={{ width: '100%', marginTop: 'var(--space-md)' }}
        >
          {isCreating ? (
            <>
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              Creating Session...
            </>
          ) : (
            '🚀 Create Session & Start'
          )}
        </button>
      </div>

      {/* How It Works */}
      <div style={{ marginTop: 'var(--space-2xl)' }}>
        <h3 className="section-title" style={{ textAlign: 'center' }}>How It Works</h3>
        <div className="grid-3" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 'var(--space-sm)' }}>📝</div>
            <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>1. Editing</h4>
            <p className="text-sm text-secondary">AI generates responsibilities. Team nominates additions. Owner cleans and assigns weights.</p>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 'var(--space-sm)' }}>🎯</div>
            <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>2. Acquiring</h4>
            <p className="text-sm text-secondary">Participants independently select responsibilities. Blind selection ensures fairness.</p>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 'var(--space-sm)' }}>⚖️</div>
            <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>3. Evaluating</h4>
            <p className="text-sm text-secondary">Owner resolves conflicts, adds factors, and the AI calculates fair equity splits.</p>
          </div>
        </div>
      </div>

      <footer style={{ textAlign: 'center', padding: 'var(--space-2xl) 0', color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>
        EquiSplit v1.0 — This tool provides recommendations only, not legal advice.
      </footer>
    </div>
  );
}
