import { db } from './firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    onSnapshot,
    writeBatch,
    Unsubscribe,
} from 'firebase/firestore';
import {
    Session,
    Responsibility,
    Participant,
    Selection,
    Assignment,
    AdditionalFactors,
    EquityCalculation,
    SessionMode,
    FactorWeightConfig,
    SelectionGuidance,
} from './types';
import { nanoid } from 'nanoid';

// ─── Collections ────────────────────────────────────────────────

const SESSIONS = 'sessions';
const RESPONSIBILITIES = 'responsibilities';
const PARTICIPANTS = 'participants';
const SELECTIONS = 'selections';
const ASSIGNMENTS = 'assignments';
const FACTORS = 'additional_factors';
const CALCULATIONS = 'equity_calculations';

// ─── Session Operations ─────────────────────────────────────────

export async function createSession(data: {
    business_name: string;
    business_concept: string;
    participant_count: number;
    session_type: Session['session_type'];
    owner_email?: string;
}): Promise<{ session: Session; owner: Participant }> {
    const sessionId = nanoid(12);
    const ownerId = nanoid(10);
    const ownerToken = nanoid(20);

    const session: Session = {
        id: sessionId,
        owner_id: ownerId,
        business_name: data.business_name,
        business_concept: data.business_concept,
        business_profile: null,
        mode: 'editing',
        session_type: data.session_type,
        is_locked: false,
        participant_count: data.participant_count,
        selection_guidance: {
            min_responsibilities: 3,
            max_responsibilities: 12,
            target_load_min: 20,
            target_load_max: 40,
        },
        factor_weights: {
            responsibility_weight: 0.6,
            experience_weight: 0.15,
            time_weight: 0.15,
            investment_weight: 0.1,
        },
        created_at: Date.now(),
        updated_at: Date.now(),
    };

    const owner: Participant = {
        id: ownerId,
        session_id: sessionId,
        name: 'Owner',
        email: data.owner_email,
        is_owner: true,
        access_token: ownerToken,
        status: 'active',
        round1_submitted: false,
        round1_finalized: false,
        created_at: Date.now(),
    };

    await setDoc(doc(db, SESSIONS, sessionId), session);
    await setDoc(doc(db, PARTICIPANTS, ownerId), owner);

    return { session, owner };
}

export async function getSession(sessionId: string): Promise<Session | null> {
    const snap = await getDoc(doc(db, SESSIONS, sessionId));
    return snap.exists() ? (snap.data() as Session) : null;
}

export async function updateSessionMode(sessionId: string, mode: SessionMode): Promise<void> {
    await updateDoc(doc(db, SESSIONS, sessionId), {
        mode,
        updated_at: Date.now(),
        ...(mode === 'completed' ? { completed_at: Date.now() } : {}),
    });
}

export async function updateSessionProfile(sessionId: string, profile: Session['business_profile']): Promise<void> {
    await updateDoc(doc(db, SESSIONS, sessionId), {
        business_profile: profile,
        updated_at: Date.now(),
    });
}

export async function updateSessionGuidance(sessionId: string, guidance: SelectionGuidance): Promise<void> {
    await updateDoc(doc(db, SESSIONS, sessionId), {
        selection_guidance: guidance,
        updated_at: Date.now(),
    });
}

export async function updateFactorWeights(sessionId: string, weights: FactorWeightConfig): Promise<void> {
    await updateDoc(doc(db, SESSIONS, sessionId), {
        factor_weights: weights,
        updated_at: Date.now(),
    });
}

// ─── Participant Operations ─────────────────────────────────────

export async function addParticipant(sessionId: string, name: string, email?: string): Promise<Participant> {
    const participantId = nanoid(10);
    const accessToken = nanoid(20);

    const participant: Participant = {
        id: participantId,
        session_id: sessionId,
        name,
        email,
        is_owner: false,
        access_token: accessToken,
        status: 'invited',
        round1_submitted: false,
        round1_finalized: false,
        created_at: Date.now(),
    };

    await setDoc(doc(db, PARTICIPANTS, participantId), participant);
    return participant;
}

export async function getSessionParticipants(sessionId: string): Promise<Participant[]> {
    const q = query(collection(db, PARTICIPANTS), where('session_id', '==', sessionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Participant);
}

export async function getParticipantByToken(token: string): Promise<Participant | null> {
    const q = query(collection(db, PARTICIPANTS), where('access_token', '==', token));
    const snap = await getDocs(q);
    return snap.docs.length > 0 ? (snap.docs[0].data() as Participant) : null;
}

export async function getParticipantByEmail(email: string): Promise<Participant[]> {
    const q = query(collection(db, PARTICIPANTS), where('email', '==', email));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Participant);
}

export async function updateParticipant(participantId: string, data: Partial<Participant>): Promise<void> {
    await updateDoc(doc(db, PARTICIPANTS, participantId), data);
}

export async function removeParticipant(participantId: string): Promise<void> {
    await updateDoc(doc(db, PARTICIPANTS, participantId), { status: 'removed' });
}

// ─── Responsibility Operations ──────────────────────────────────

export async function addResponsibilities(responsibilities: Responsibility[]): Promise<void> {
    const batch = writeBatch(db);
    for (const resp of responsibilities) {
        batch.set(doc(db, RESPONSIBILITIES, resp.id), resp);
    }
    await batch.commit();
}

export async function getSessionResponsibilities(sessionId: string): Promise<Responsibility[]> {
    const q = query(collection(db, RESPONSIBILITIES), where('session_id', '==', sessionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Responsibility);
}

export async function updateResponsibility(respId: string, data: Partial<Responsibility>): Promise<void> {
    await updateDoc(doc(db, RESPONSIBILITIES, respId), data);
}

export async function updateResponsibilitiesBatch(updates: Array<{ id: string; data: Partial<Responsibility> }>): Promise<void> {
    const batch = writeBatch(db);
    for (const { id, data } of updates) {
        batch.update(doc(db, RESPONSIBILITIES, id), data);
    }
    await batch.commit();
}

export async function deleteResponsibility(respId: string): Promise<void> {
    await deleteDoc(doc(db, RESPONSIBILITIES, respId));
}

// ─── Selection Operations ───────────────────────────────────────

export async function saveSelections(
    participantId: string,
    sessionId: string,
    responsibilityIds: string[],
    status: Selection['status'] = 'pending'
): Promise<void> {
    // Delete existing selections for this participant
    const existing = query(collection(db, SELECTIONS), where('participant_id', '==', participantId));
    const snap = await getDocs(existing);
    const batch = writeBatch(db);

    for (const d of snap.docs) {
        batch.delete(d.ref);
    }

    // Add new selections
    for (const respId of responsibilityIds) {
        const selectionId = nanoid(12);
        const selection: Selection = {
            id: selectionId,
            session_id: sessionId,
            participant_id: participantId,
            responsibility_id: respId,
            round: 1,
            selected_at: Date.now(),
            status: status,
        };
        batch.set(doc(db, SELECTIONS, selectionId), selection);
    }

    await batch.commit();
}

export async function getSessionSelections(sessionId: string): Promise<Selection[]> {
    const q = query(collection(db, SELECTIONS), where('session_id', '==', sessionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Selection);
}

export async function getParticipantSelections(participantId: string): Promise<Selection[]> {
    const q = query(collection(db, SELECTIONS), where('participant_id', '==', participantId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Selection);
}

// ─── Assignment Operations ──────────────────────────────────────

export async function saveAssignments(assignments: Assignment[]): Promise<void> {
    const batch = writeBatch(db);
    for (const assignment of assignments) {
        batch.set(doc(db, ASSIGNMENTS, assignment.id), assignment);
    }
    await batch.commit();
}

export async function getSessionAssignments(sessionId: string): Promise<Assignment[]> {
    const q = query(collection(db, ASSIGNMENTS), where('session_id', '==', sessionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Assignment);
}

export async function clearSessionAssignments(sessionId: string): Promise<void> {
    const q = query(collection(db, ASSIGNMENTS), where('session_id', '==', sessionId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    for (const d of snap.docs) {
        batch.delete(d.ref);
    }
    await batch.commit();
}

// ─── Additional Factors ──────────────────────────────────────────

export async function saveAdditionalFactors(factors: AdditionalFactors): Promise<void> {
    await setDoc(doc(db, FACTORS, factors.id), factors);
}

export async function getSessionFactors(sessionId: string): Promise<AdditionalFactors[]> {
    const q = query(collection(db, FACTORS), where('session_id', '==', sessionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as AdditionalFactors);
}

// ─── Equity Calculations ─────────────────────────────────────────

export async function saveCalculations(calculations: EquityCalculation[]): Promise<void> {
    const batch = writeBatch(db);
    for (const calc of calculations) {
        batch.set(doc(db, CALCULATIONS, calc.id), calc);
    }
    await batch.commit();
}

export async function getSessionCalculations(sessionId: string): Promise<EquityCalculation[]> {
    const q = query(collection(db, CALCULATIONS), where('session_id', '==', sessionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as EquityCalculation);
}

// ─── Additional Factors (Update) ────────────────────────────────

export async function updateAdditionalFactors(factorsId: string, data: Partial<AdditionalFactors>): Promise<void> {
    await updateDoc(doc(db, FACTORS, factorsId), data);
}

// ─── Real-Time Listeners ─────────────────────────────────────────

export function onSessionChange(sessionId: string, callback: (session: Session) => void): Unsubscribe {
    return onSnapshot(doc(db, SESSIONS, sessionId), (snap) => {
        if (snap.exists()) callback(snap.data() as Session);
    });
}

export function onSelectionsChange(sessionId: string, callback: (selections: Selection[]) => void): Unsubscribe {
    const q = query(collection(db, SELECTIONS), where('session_id', '==', sessionId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => d.data() as Selection));
    });
}

export function onParticipantsChange(sessionId: string, callback: (participants: Participant[]) => void): Unsubscribe {
    const q = query(collection(db, PARTICIPANTS), where('session_id', '==', sessionId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => d.data() as Participant));
    });
}

export function onResponsibilitiesChange(sessionId: string, callback: (responsibilities: Responsibility[]) => void): Unsubscribe {
    const q = query(collection(db, RESPONSIBILITIES), where('session_id', '==', sessionId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => d.data() as Responsibility));
    });
}
