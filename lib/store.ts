import { create } from 'zustand';
import {
    Session,
    Responsibility,
    Participant,
    Selection,
    Assignment,
    AdditionalFactors,
    EquityCalculation,
    FactorWeightConfig,
    SessionMode,
} from './types';

interface SessionStore {
    // ─── Session State ──────────────────────────────
    session: Session | null;
    setSession: (session: Session | null) => void;
    updateMode: (mode: SessionMode) => void;

    // ─── Participants ───────────────────────────────
    participants: Participant[];
    setParticipants: (participants: Participant[]) => void;
    currentParticipant: Participant | null;
    setCurrentParticipant: (participant: Participant | null) => void;

    // ─── Responsibilities ───────────────────────────
    responsibilities: Responsibility[];
    setResponsibilities: (responsibilities: Responsibility[]) => void;
    lockedWeights: Set<string>;
    toggleWeightLock: (respId: string) => void;

    // ─── Selections ─────────────────────────────────
    selections: Selection[];
    setSelections: (selections: Selection[]) => void;

    // ─── Owner Selections (pre-acquiring) ────────────
    ownerSelectedIds: Set<string>;
    toggleOwnerSelection: (respId: string) => void;
    setOwnerSelectedIds: (ids: Set<string>) => void;

    // ─── Assignments (Evaluating mode) ──────────────
    assignments: Assignment[];
    setAssignments: (assignments: Assignment[]) => void;

    // ─── Additional Factors ─────────────────────────
    factors: AdditionalFactors[];
    setFactors: (factors: AdditionalFactors[]) => void;

    // ─── Factor Weight Config ───────────────────────
    factorWeights: FactorWeightConfig;
    setFactorWeights: (weights: FactorWeightConfig) => void;

    // ─── Calculations ──────────────────────────────
    calculations: EquityCalculation[];
    setCalculations: (calculations: EquityCalculation[]) => void;

    // ─── UI State ──────────────────────────────────
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    activeView: string;
    setActiveView: (view: string) => void;

    // ─── Reset ─────────────────────────────────────
    reset: () => void;
}

const initialState = {
    session: null,
    participants: [],
    currentParticipant: null,
    responsibilities: [],
    lockedWeights: new Set<string>(),
    selections: [],
    ownerSelectedIds: new Set<string>(),
    assignments: [],
    factors: [],
    factorWeights: {
        responsibility_weight: 0.6,
        experience_weight: 0.15,
        time_weight: 0.15,
        investment_weight: 0.1,
    },
    calculations: [],
    isLoading: false,
    activeView: 'overview',
};

export const useSessionStore = create<SessionStore>((set) => ({
    ...initialState,

    setSession: (session) => set({ session }),
    updateMode: (mode) =>
        set((state) => ({
            session: state.session ? { ...state.session, mode, updated_at: Date.now() } : null,
        })),

    setParticipants: (participants) => set({ participants }),
    setCurrentParticipant: (currentParticipant) => set({ currentParticipant }),

    setResponsibilities: (responsibilities) => set({ responsibilities }),
    toggleWeightLock: (respId) =>
        set((state) => {
            const newLocked = new Set(state.lockedWeights);
            if (newLocked.has(respId)) {
                newLocked.delete(respId);
            } else {
                newLocked.add(respId);
            }
            return { lockedWeights: newLocked };
        }),

    setSelections: (selections) => set({ selections }),

    toggleOwnerSelection: (respId) =>
        set((state) => {
            const newSelected = new Set(state.ownerSelectedIds);
            if (newSelected.has(respId)) {
                newSelected.delete(respId);
            } else {
                newSelected.add(respId);
            }
            return { ownerSelectedIds: newSelected };
        }),
    setOwnerSelectedIds: (ids) => set({ ownerSelectedIds: ids }),

    setAssignments: (assignments) => set({ assignments }),
    setFactors: (factors) => set({ factors }),
    setFactorWeights: (factorWeights) => set({ factorWeights }),
    setCalculations: (calculations) => set({ calculations }),

    setIsLoading: (isLoading) => set({ isLoading }),
    setActiveView: (activeView) => set({ activeView }),

    reset: () => set(initialState),
}));
