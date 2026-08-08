import {
  MATCH_CREDITS,
  REQUIREMENT_WEIGHTS,
  SCORING_POLICY_VERSION,
} from "./policy";
import type {
  CareerLevelSuitability,
  ConfidenceLevel,
  DescriptionQuality,
  JobRequirement,
  MatchStatus,
  OpportunityBand,
  RequirementMatch,
  ScoreBreakdown,
} from "./schemas";
import type { CareerStageAssessment } from "./career-stage";

export function computeEvidenceFitScore(input: {
  requirements: JobRequirement[];
  matches: RequirementMatch[];
}): ScoreBreakdown {
  const matchById = new Map(
    input.matches.map((match) => [match.requirement_id, match]),
  );
  const contributions = [];
  let numerator = 0;
  let denominator = 0;
  let unknownCount = 0;
  let gapCount = 0;
  let matchedCount = 0;
  let partialCount = 0;

  for (const requirement of input.requirements) {
    const match = matchById.get(requirement.id);
    const status = match?.status ?? "unknown";
    if (status === "not_applicable") continue;

    const weight = REQUIREMENT_WEIGHTS[requirement.importance];
    const credit = creditForMatch(status, match?.confidence ?? "low");
    const contribution = weight * credit;
    numerator += contribution;
    denominator += weight;
    contributions.push({
      requirement_id: requirement.id,
      importance: requirement.importance,
      status,
      weight,
      credit,
      contribution,
    });

    if (status === "unknown") unknownCount += 1;
    if (status === "gap") gapCount += 1;
    if (status === "matched") matchedCount += 1;
    if (status === "partial") partialCount += 1;
  }

  const evidenceFitScore =
    denominator === 0 ? 0 : Math.round((100 * numerator) / denominator);

  return {
    policy_version: SCORING_POLICY_VERSION,
    weights: { ...REQUIREMENT_WEIGHTS },
    credits: {
      matched: MATCH_CREDITS.matched,
      partial: MATCH_CREDITS.partial,
      gap: MATCH_CREDITS.gap,
      unknown: MATCH_CREDITS.unknown,
    },
    contributions,
    numerator,
    denominator,
    evidence_fit_score: evidenceFitScore,
    unknown_count: unknownCount,
    gap_count: gapCount,
    matched_count: matchedCount,
    partial_count: partialCount,
  };
}

function creditForMatch(
  status: MatchStatus,
  confidence: ConfidenceLevel,
): number {
  if (status === "partial" && confidence === "low") {
    return MATCH_CREDITS.partial_low_confidence;
  }
  return MATCH_CREDITS[status];
}

export function classifyCareerLevelSuitability(input: {
  assessment: CareerStageAssessment;
  opportunityBand: OpportunityBand;
  preferencesForceAlignment?: boolean;
}): CareerLevelSuitability {
  if (input.preferencesForceAlignment) {
    return "overridden_by_explicit_preference";
  }
  if (
    input.opportunityBand === "unknown" ||
    input.assessment.inferredStage === "unknown"
  ) {
    return "unknown";
  }
  if (input.assessment.targetOpportunityBands.includes(input.opportunityBand)) {
    return "aligned";
  }
  if (input.assessment.stretchOpportunityBands.includes(input.opportunityBand)) {
    return "stretch";
  }
  if (input.assessment.unsuitableBands.includes(input.opportunityBand)) {
    return input.opportunityBand === "senior" ||
      input.opportunityBand === "lead_or_management"
      ? "substantially_overleveled"
      : "below_target";
  }
  return "reasonable_step";
}

export function computeAnalysisConfidence(input: {
  descriptionQuality: DescriptionQuality;
  score: ScoreBreakdown;
  requirementCount: number;
}): ConfidenceLevel {
  if (input.descriptionQuality === "unusable") return "low";
  if (input.requirementCount === 0) return "low";

  const unknownRatio =
    input.score.unknown_count / Math.max(input.requirementCount, 1);
  if (
    input.descriptionQuality === "complete_or_good" &&
    unknownRatio <= 0.2 &&
    input.score.denominator > 0
  ) {
    return "high";
  }
  if (input.descriptionQuality === "minimal" || unknownRatio > 0.45) {
    return "low";
  }
  return "medium";
}

export function assessDescriptionQuality(
  description: string | null,
): DescriptionQuality {
  const text = description?.trim() ?? "";
  if (text.length < 80) return "unusable";
  if (text.length < 250) return "minimal";
  if (text.length < 700) return "partial";
  return "complete_or_good";
}
