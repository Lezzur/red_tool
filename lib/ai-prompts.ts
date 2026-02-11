// AI prompt templates for Google Gemini integration

export const BUSINESS_ANALYSIS_PROMPT = `You are analyzing a business concept to help distribute equity fairly among co-founders.

Business Description:
"""
{BUSINESS_DESCRIPTION}
"""

Your task:
1. Identify the business profile:
   - Type (SaaS, E-commerce, Marketplace, Consulting, Agency, Hardware, etc.)
   - Industry (FinTech, HealthTech, EdTech, Consumer Goods, B2B Services, etc.)
   - Stage (Ideation, Pre-launch, MVP, Early-stage, Growth, Scaling)
   - Business Model (B2B, B2C, B2B2C, Subscription, Freemium, Marketplace, etc.)
   - Target Market (SMBs, Enterprise, Consumers, Vertical-specific)
   - Key Activities (Software development, Content creation, Manufacturing, etc.)

2. Generate 25-50 comprehensive, non-overlapping responsibilities across ALL relevant business functions. Each must include:
   - Category (from: Strategic & Leadership, Product & Technology, Sales & Business Development, Marketing & Brand, Operations & Finance, People & Culture, Customer Success & Support, Administrative)
   - Title (concise, max 100 chars)
   - Description (2-3 sentences explaining scope)
   - Typical time commitment (e.g. "20-30% FTE")
   - Criticality (Critical/High/Medium/Low)
   - Stage relevance (array of stages where this is most relevant)

Requirements:
- Be COMPREHENSIVE - cover strategy, product, sales, marketing, operations, finance, people, customer success
- NO OVERLAPS - each responsibility must be distinct
- Be SPECIFIC - clear what each role entails
- Be ACTIONABLE - can be assigned to real people
- Be STAGE-APPROPRIATE - relevant to the identified stage

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "business_profile": {
    "type": "...",
    "industry": "...",
    "stage": "...",
    "model": "...",
    "target_market": "...",
    "key_activities": ["..."]
  },
  "responsibilities": [
    {
      "category": "...",
      "title": "...",
      "description": "...",
      "typical_time_commitment": "...",
      "criticality": "Critical|High|Medium|Low",
      "stage_relevance": ["..."],
      "nominated_by": ["ai"]
    }
  ]
}`;

export const CLEANING_PROMPT = `You are cleaning a list of responsibilities for equity distribution.

Business Profile: {BUSINESS_PROFILE}

Current responsibility list:
{RESPONSIBILITIES}

Your task:
1. Detect duplicates and near-duplicates → suggest merges
2. Identify overlapping responsibilities (>60% similarity) → suggest merges or splits
3. Flag responsibilities irrelevant to this business type → suggest removal with reason
4. Suggest better category assignments if needed
5. Identify gaps → suggest missing critical responsibilities
6. Improve vague descriptions → rewrite

Return ONLY valid JSON (no markdown, no code fences):
{
  "actions": [
    {
      "type": "merge|remove|reorganize|add|clarify",
      "original_ids": ["resp_id1", "resp_id2"],
      "suggested": {
        "category": "...",
        "title": "...",
        "description": "..."
      },
      "reason": "...",
      "from_category": "...",
      "to_category": "...",
      "improved_description": "..."
    }
  ],
  "summary": {
    "merged": 0,
    "removed": 0,
    "reorganized": 0,
    "added": 0,
    "clarified": 0,
    "original_count": 0,
    "cleaned_count": 0
  }
}`;

export const WEIGHT_ASSIGNMENT_PROMPT = `Assign weights to these responsibilities for a {BUSINESS_TYPE} business at {STAGE} stage.

Responsibilities:
{RESPONSIBILITIES}

Weighting criteria:
1. Criticality to business success (40% of weight decision)
2. Time/effort required (30%)
3. Skill scarcity & difficulty (20%)
4. Stage relevance (10%)

Rules:
- All weights must sum to exactly 1.0 (representing 100%)
- No single weight > 0.15 (15%)
- Critical responsibilities: 0.08-0.15
- High priority: 0.05-0.10
- Medium priority: 0.03-0.07
- Standard: 0.01-0.05
- Minor: 0.001-0.02

Return ONLY valid JSON array (no markdown, no code fences):
[
  {
    "responsibility_id": "...",
    "suggested_weight": 0.XX,
    "reasoning": "..."
  }
]`;

export const CONFLICT_RESOLUTION_PROMPT = `Help resolve a responsibility conflict.

Responsibility: {RESPONSIBILITY_TITLE}
Description: {RESPONSIBILITY_DESCRIPTION}
Weight: {WEIGHT}%
Sharing status: Closed (only one person can have it)

Candidates who selected it:
{CANDIDATES}

Consider:
- Current workload balance of each candidate
- Synergy with their other selected responsibilities
- Experience relevance (if available)

Return ONLY valid JSON (no markdown, no code fences):
{
  "recommended": "participant_id",
  "reasoning": "detailed explanation",
  "confidence": 0.0-1.0
}`;

export const LOAD_FEEDBACK_PROMPT = `Provide feedback on a participant's selected workload.

Selected responsibilities:
{SELECTIONS}

Total weight: {TOTAL_WEIGHT}%

Generate a brief, supportive feedback message (2-3 sentences). Be constructive and honest.
If load is heavy, suggest specific types of responsibilities that could be reduced.

Return ONLY valid JSON (no markdown, no code fences):
{
  "status": "green|yellow|orange|red",
  "message": "...",
  "suggestions": ["..."]
}`;
