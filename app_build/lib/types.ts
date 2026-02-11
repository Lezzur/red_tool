// ─── Core Data Types ─────────────────────────────────────────────

export type SessionMode = 'setup' | 'editing' | 'processing' | 'acquiring' | 'evaluating' | 'completed';
export type SessionType = 'synchronous' | 'asynchronous' | 'hybrid';
export type Criticality = 'Critical' | 'High' | 'Medium' | 'Low';
export type SharingStatus = 'open' | 'closed';
export type ParticipantStatus = 'invited' | 'active' | 'completed' | 'removed';
export type SelectionStatus = 'draft' | 'pending' | 'confirmed' | 'rejected';
export type ResponsibilityStatus = 'pending' | 'active' | 'archived';

// ─── Business Profile ────────────────────────────────────────────

export interface BusinessProfile {
  type: string;
  industry: string;
  stage: string;
  model: string;
  target_market?: string;
  key_activities?: string[];
}

// ─── Session ─────────────────────────────────────────────────────

export interface Session {
  id: string;
  owner_id: string;
  business_name: string;
  business_concept: string;
  business_profile: BusinessProfile | null;
  mode: SessionMode;
  session_type: SessionType;
  is_locked: boolean;
  participant_count: number;
  selection_guidance: SelectionGuidance;
  factor_weights: FactorWeightConfig;
  created_at: number;
  updated_at: number;
  completed_at?: number;
}

export interface SelectionGuidance {
  min_responsibilities: number;
  max_responsibilities: number;
  target_load_min: number;
  target_load_max: number;
}

// ─── Responsibility ──────────────────────────────────────────────

export interface Responsibility {
  id: string;
  session_id: string;
  category: string;
  title: string;
  description: string;
  weight: number; // 0.0-1.0 (percentage as decimal)
  criticality: Criticality;
  typical_time_commitment?: string;
  stage_relevance?: string[];
  sharing_allowed: SharingStatus | null; // null until set by owner
  nominated_by: string[]; // participant_ids or 'ai'
  status: ResponsibilityStatus;
  created_at: number;
}

// ─── Participant ─────────────────────────────────────────────────

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  role?: string;
  email?: string;
  access_token: string;
  is_owner: boolean;
  status: ParticipantStatus;
  round1_submitted: boolean;
  round1_finalized: boolean;
  created_at: number;
}

// ─── Selection ───────────────────────────────────────────────────

export interface Selection {
  id: string;
  session_id: string;
  participant_id: string;
  responsibility_id: string;
  round: 1 | 2;
  selected_at: number;
  status: SelectionStatus;
}

// ─── Assignment (Final) ──────────────────────────────────────────

export interface Assignment {
  id: string;
  session_id: string;
  responsibility_id: string;
  participant_id: string;
  is_shared: boolean;
  assigned_by: string;
  assigned_at: number;
}

// ─── Additional Factors ──────────────────────────────────────────

export type StartupExperience = 'none' | '1' | '2-3' | '4+';
export type DomainExpertise = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type LeadershipLevel = 'none' | 'team_lead' | 'manager' | 'director' | 'c_level';
export type DurationUnit = 'months' | 'years';

export interface AdditionalFactors {
  id: string;
  session_id: string;
  participant_id: string;

  // Experience
  experience_description: string;
  experience_description_rating: number; // 0-10
  startup_experience: StartupExperience;
  domain_expertise: DomainExpertise;
  leadership_level: LeadershipLevel;

  // Time
  time_commitment_hours_min: number;
  time_commitment_hours_max: number;
  duration_commitment_value: number;
  duration_commitment_unit: DurationUnit;

  // Investment
  currency: 'PHP' | 'USD';
  cash_investment: number;
  resources_contributed: number;


  updated_at: number;
  updated_by: string;
}

// ─── Equity Calculation ──────────────────────────────────────────

export interface EquityCalculation {
  id: string;
  session_id: string;
  participant_id: string;
  participant_name: string;

  // Base calculation
  base_weight: number;
  base_equity: number;

  // Multipliers
  experience_multiplier: number;
  time_multiplier: number;
  investment_multiplier: number;
  combined_multiplier: number;

  // Final
  adjusted_equity: number;
  final_equity: number;

  // Responsibilities
  exclusive_responsibilities: string[];
  shared_responsibilities: Array<{ id: string; shared_with: string[] }>;

  calculated_at: number;
}

// ─── Factor Weight Config ────────────────────────────────────────

export interface FactorWeightConfig {
  responsibility_weight: number; // 0.4-0.8
  experience_weight: number;     // 0-0.3
  time_weight: number;           // 0-0.3
  investment_weight: number;     // 0-0.3
}

// ─── AI Response Types ───────────────────────────────────────────

export interface AIAnalysisResponse {
  business_profile: BusinessProfile;
  responsibilities: Omit<Responsibility, 'id' | 'session_id' | 'weight' | 'sharing_allowed' | 'status' | 'created_at'>[];
}

export interface AICleaningAction {
  type: 'merge' | 'remove' | 'reorganize' | 'add' | 'clarify';
  original_ids?: string[];
  suggested?: Partial<Responsibility>;
  reason: string;
  from_category?: string;
  to_category?: string;
  improved_description?: string;
}

export interface AICleaningResponse {
  actions: AICleaningAction[];
  summary: {
    merged: number;
    removed: number;
    reorganized: number;
    added: number;
    clarified: number;
    original_count: number;
    cleaned_count: number;
  };
}

export interface AIWeightAssignment {
  responsibility_id: string;
  suggested_weight: number;
  reasoning: string;
}

export interface AIConflictSuggestion {
  recommended: string; // participant_id
  reasoning: string;
  confidence: number;
}

export interface AILoadFeedback {
  status: 'green' | 'yellow' | 'orange' | 'red';
  message: string;
  suggestions: string[];
}

// ─── UI State Types ──────────────────────────────────────────────

export type LoadStatus = 'green' | 'yellow' | 'orange' | 'red';

export interface ConflictItem {
  responsibility: Responsibility;
  selected_by: string[]; // participant ids
  ai_suggestion?: AIConflictSuggestion;
}

export interface GapItem {
  responsibility: Responsibility;
  criticality_level: 'critical' | 'high' | 'medium';
}
