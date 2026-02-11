import {
    AdditionalFactors,
    Assignment,
    EquityCalculation,
    FactorWeightConfig,
    Participant,
    Responsibility,
    LoadStatus,
} from './types';

// ─── Startup Experience Points ───────────────────────────────────

function getStartupPoints(exp: AdditionalFactors['startup_experience']): number {
    switch (exp) {
        case 'none': return 0;
        case '1': return 5;
        case '2-3': return 8;
        case '4+': return 10;
    }
}

// ─── Domain Expertise Points ─────────────────────────────────────

function getDomainPoints(level: AdditionalFactors['domain_expertise']): number {
    switch (level) {
        case 'beginner': return 0;
        case 'intermediate': return 5;
        case 'advanced': return 8;
        case 'expert': return 10;
    }
}

// ─── Leadership Points ──────────────────────────────────────────

function getLeadershipPoints(level: AdditionalFactors['leadership_level']): number {
    switch (level) {
        case 'none': return 0;
        case 'team_lead': return 3;
        case 'manager': return 5;
        case 'director': return 8;
        case 'c_level': return 10;
    }
}

// ─── Experience Multiplier ──────────────────────────────────────

export function calculateExperienceMultiplier(factors: AdditionalFactors): number {
    const descriptionRating = factors.experience_description_rating; // 0-10
    const startupPts = getStartupPoints(factors.startup_experience);
    const domainPts = getDomainPoints(factors.domain_expertise);
    const leadershipPts = getLeadershipPoints(factors.leadership_level);

    const maxScore = 10; // max possible for each component
    const score =
        (descriptionRating * 0.4 +
            startupPts * 0.3 +
            domainPts * 0.2 +
            leadershipPts * 0.1) / maxScore;

    // Range: 0.8 to 1.2
    return 0.8 + score * 0.4;
}

// ─── Time Multiplier ────────────────────────────────────────────

export function calculateTimeMultiplier(factors: AdditionalFactors): number {
    const rangeMidpoint = (factors.time_commitment_hours_min + factors.time_commitment_hours_max) / 2;
    // Standard FTE is ~40 hours/week. Normalize to that.
    const timeScore = Math.min(rangeMidpoint / 40, 2.0); // Cap at 2x multiplier (80 hours)

    // Convert duration to years for scoring
    const durationInYears = factors.duration_commitment_unit === 'months'
        ? factors.duration_commitment_value / 12
        : factors.duration_commitment_value;

    const durationFactor = (() => {
        if (durationInYears < 0.5) return 0.5; // < 6 months
        if (durationInYears < 1.0) return 0.7; // 6 months - 1 year
        if (durationInYears < 2.0) return 0.9; // 1-2 years
        return 1.0; // 2+ years
    })();

    // Range: ~0.35 to ~1.35
    // Weight time 60%, duration 40%
    return timeScore * 0.6 + durationFactor * 0.4;
}

// ─── Investment Multiplier ──────────────────────────────────────

function toUSD(amount: number, currency: 'PHP' | 'USD'): number {
    return currency === 'PHP' ? amount / 56 : amount;
}

export function calculateInvestmentMultiplier(
    factors: AdditionalFactors,
    allFactors: AdditionalFactors[]
): number {
    const totalInvestmentUSD = allFactors.reduce(
        (sum, f) => sum + toUSD(f.cash_investment, f.currency) + toUSD(f.resources_contributed, f.currency),
        0
    );

    if (totalInvestmentUSD === 0) return 1.0;

    const personalInvestmentUSD = toUSD(factors.cash_investment, factors.currency) + toUSD(factors.resources_contributed, factors.currency);
    const investmentScore = personalInvestmentUSD / totalInvestmentUSD;

    // Range: 0.7 to 1.3
    // Base 0.7 + share of total * 0.6
    return 0.7 + investmentScore * 0.6;
}

// ─── Base Equity Calculation ────────────────────────────────────

export function calculateBaseEquity(
    participantId: string,
    assignments: Assignment[],
    responsibilities: Responsibility[]
): number {
    const participantAssignments = assignments.filter(a => a.participant_id === participantId);

    let baseWeight = 0;
    for (const assignment of participantAssignments) {
        const resp = responsibilities.find(r => r.id === assignment.responsibility_id);
        if (!resp) continue;

        // Count how many people share this responsibility
        const sharedCount = assignments.filter(
            a => a.responsibility_id === assignment.responsibility_id
        ).length;

        baseWeight += resp.weight / sharedCount;
    }

    return baseWeight;
}

// ─── Full Equity Calculation ────────────────────────────────────

export function calculateEquityDistribution(
    participants: Participant[],
    assignments: Assignment[],
    responsibilities: Responsibility[],
    allFactors: AdditionalFactors[],
    factorWeights: FactorWeightConfig
): EquityCalculation[] {
    const results: EquityCalculation[] = [];

    // Step 1: Calculate base equity for each participant
    const baseEquities: { participantId: string; baseWeight: number }[] = [];
    let totalBaseWeight = 0;

    for (const participant of participants) {
        const baseWeight = calculateBaseEquity(participant.id, assignments, responsibilities);
        baseEquities.push({ participantId: participant.id, baseWeight });
        totalBaseWeight += baseWeight;
    }

    // Step 2: Calculate multipliers and adjusted equity
    let totalAdjusted = 0;
    const intermediates: Array<{
        participantId: string;
        participantName: string;
        baseEquity: number;
        baseWeight: number;
        experienceMultiplier: number;
        timeMultiplier: number;
        investmentMultiplier: number;
        combinedMultiplier: number;
        adjustedEquity: number;
        exclusiveResps: string[];
        sharedResps: Array<{ id: string; shared_with: string[] }>;
    }> = [];

    for (const { participantId, baseWeight } of baseEquities) {
        const participant = participants.find(p => p.id === participantId)!;
        const factors = allFactors.find(f => f.participant_id === participantId);

        const baseEquity = totalBaseWeight > 0 ? (baseWeight / totalBaseWeight) * 100 : 0;

        let experienceMultiplier = 1.0;
        let timeMultiplier = 1.0;
        let investmentMultiplier = 1.0;

        if (factors) {
            experienceMultiplier = calculateExperienceMultiplier(factors);
            timeMultiplier = calculateTimeMultiplier(factors);
            investmentMultiplier = calculateInvestmentMultiplier(factors, allFactors);
        }

        const combinedMultiplier =
            1.0 * factorWeights.responsibility_weight +
            experienceMultiplier * factorWeights.experience_weight +
            timeMultiplier * factorWeights.time_weight +
            investmentMultiplier * factorWeights.investment_weight;

        const adjustedEquity = baseEquity * combinedMultiplier;
        totalAdjusted += adjustedEquity;

        // Gather responsibility assignments
        const participantAssignments = assignments.filter(a => a.participant_id === participantId);
        const exclusiveResps: string[] = [];
        const sharedResps: Array<{ id: string; shared_with: string[] }> = [];

        for (const assignment of participantAssignments) {
            const othersWithSame = assignments.filter(
                a => a.responsibility_id === assignment.responsibility_id && a.participant_id !== participantId
            );

            if (othersWithSame.length === 0) {
                exclusiveResps.push(assignment.responsibility_id);
            } else {
                sharedResps.push({
                    id: assignment.responsibility_id,
                    shared_with: othersWithSame.map(a => a.participant_id),
                });
            }
        }

        intermediates.push({
            participantId,
            participantName: participant.name,
            baseEquity,
            baseWeight,
            experienceMultiplier,
            timeMultiplier,
            investmentMultiplier,
            combinedMultiplier,
            adjustedEquity,
            exclusiveResps,
            sharedResps,
        });
    }

    // Step 3: Normalize to 100%
    for (const item of intermediates) {
        const finalEquity = totalAdjusted > 0 ? (item.adjustedEquity / totalAdjusted) * 100 : 0;

        results.push({
            id: `calc_${item.participantId}`,
            session_id: participants[0]?.session_id || '',
            participant_id: item.participantId,
            participant_name: item.participantName,
            base_weight: item.baseWeight,
            base_equity: item.baseEquity,
            experience_multiplier: item.experienceMultiplier,
            time_multiplier: item.timeMultiplier,
            investment_multiplier: item.investmentMultiplier,
            combined_multiplier: item.combinedMultiplier,
            adjusted_equity: item.adjustedEquity,
            final_equity: finalEquity,
            exclusive_responsibilities: item.exclusiveResps,
            shared_responsibilities: item.sharedResps,
            calculated_at: Date.now(),
        });
    }

    return results;
}

// ─── Load Assessment ─────────────────────────────────────────────

export function getLoadStatus(totalWeightPercent: number): LoadStatus {
    if (totalWeightPercent <= 40) return 'green';
    if (totalWeightPercent <= 65) return 'yellow';
    if (totalWeightPercent <= 85) return 'orange';
    return 'red';
}

export function getLoadLabel(status: LoadStatus): string {
    switch (status) {
        case 'green': return 'Ideal Load';
        case 'yellow': return 'Heavy Load';
        case 'orange': return 'Very Heavy';
        case 'red': return 'Unsustainable';
    }
}

export function getLoadMessage(status: LoadStatus): string {
    switch (status) {
        case 'green':
            return 'Your selection looks balanced for a co-founder role. You can proceed or adjust if needed.';
        case 'yellow':
            return 'Your workload is on the heavier side. Consider if you can realistically handle these responsibilities or if some could be shared or delegated.';
        case 'orange':
            return 'This is a very heavy workload. Review your selections carefully — you may be taking on too much to execute effectively.';
        case 'red':
            return 'This workload is likely unsustainable. Strongly consider reducing your responsibilities to ensure quality execution.';
    }
}

// ─── Weight Rebalancing ──────────────────────────────────────────

export function rebalanceWeights(
    responsibilities: Responsibility[],
    changedId: string,
    newWeight: number,
    lockedIds: Set<string>
): Responsibility[] {
    const result = [...responsibilities];
    const changed = result.find(r => r.id === changedId);
    if (!changed) return result;

    const oldWeight = changed.weight;
    const delta = newWeight - oldWeight;
    changed.weight = newWeight;

    // Get unlocked responsibilities (excluding the changed one)
    const unlocked = result.filter(r => r.id !== changedId && !lockedIds.has(r.id));
    const totalUnlocked = unlocked.reduce((sum, r) => sum + r.weight, 0);

    if (totalUnlocked === 0 || unlocked.length === 0) return result;

    // Redistribute delta proportionally among unlocked
    for (const resp of unlocked) {
        const proportion = resp.weight / totalUnlocked;
        resp.weight = Math.max(0.001, resp.weight - delta * proportion);
    }

    // Normalize to ensure sum = 1.0
    const lockedTotal = result
        .filter(r => lockedIds.has(r.id) || r.id === changedId)
        .reduce((sum, r) => sum + r.weight, 0);
    const remainingBudget = 1.0 - lockedTotal;
    const currentUnlocked = unlocked.reduce((sum, r) => sum + r.weight, 0);

    if (currentUnlocked > 0) {
        for (const resp of unlocked) {
            resp.weight = (resp.weight / currentUnlocked) * remainingBudget;
        }
    }

    return result;
}

// ─── Participant Load Calculation ───────────────────────────────

export function calculateParticipantLoad(
    participantId: string,
    selectedResponsibilityIds: string[],
    responsibilities: Responsibility[],
    allSelections?: Map<string, string[]> // Map of responsibilityId -> participantIds who selected it
): number {
    let totalWeight = 0;

    for (const respId of selectedResponsibilityIds) {
        const resp = responsibilities.find(r => r.id === respId);
        if (!resp) continue;

        if (allSelections) {
            const sharedWith = allSelections.get(respId) || [participantId];
            totalWeight += (resp.weight * 100) / sharedWith.length;
        } else {
            totalWeight += resp.weight * 100;
        }
    }

    return totalWeight;
}
