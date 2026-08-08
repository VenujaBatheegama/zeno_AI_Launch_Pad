import {
  isJobTitleIncompatibleWithPreferences,
  titleMatchesExcludedKeyword,
} from "@/modules/job-discovery/domain/job";

import type { CareerLevelSuitability, ConfidenceLevel } from "./schemas";

const suitabilityRank: Record<CareerLevelSuitability, number> = {
  overridden_by_explicit_preference: 0,
  aligned: 1,
  reasonable_step: 2,
  stretch: 3,
  below_target: 4,
  substantially_underleveled: 5,
  substantially_overleveled: 6,
  unknown: 7,
};

const confidenceRank: Record<ConfidenceLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export type RankableMatch = {
  listingId: string;
  jobId: string;
  eligible: boolean;
  evidenceFitScore: number;
  careerLevel: CareerLevelSuitability;
  confidence: ConfidenceLevel;
  publishedAt: string | null;
};

export function rankMatches(matches: RankableMatch[]): RankableMatch[] {
  return [...matches].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    const suitability =
      suitabilityRank[a.careerLevel] - suitabilityRank[b.careerLevel];
    if (suitability !== 0) return suitability;
    if (b.evidenceFitScore !== a.evidenceFitScore) {
      return b.evidenceFitScore - a.evidenceFitScore;
    }
    const confidence = confidenceRank[a.confidence] - confidenceRank[b.confidence];
    if (confidence !== 0) return confidence;
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.jobId.localeCompare(b.jobId);
  });
}

export function evaluateHardConstraints(input: {
  excludedKeywords: string[];
  experienceLevels?: Array<"entry" | "mid" | "senior" | "lead" | "executive">;
  title: string;
  employmentType: string | null;
  preferredEmploymentTypes: string[];
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (
    isJobTitleIncompatibleWithPreferences(input.title, {
      excluded_keywords: input.excludedKeywords,
      experience_levels: input.experienceLevels ?? [],
    })
  ) {
    if (
      titleMatchesExcludedKeyword(input.title, input.excludedKeywords)
    ) {
      reasons.push("Title matches an excluded keyword.");
    } else {
      reasons.push(
        "Title seniority signals are above your preferred experience level.",
      );
    }
  }
  if (
    input.preferredEmploymentTypes.length > 0 &&
    input.employmentType &&
    !input.preferredEmploymentTypes.includes(input.employmentType)
  ) {
    reasons.push(
      `Employment type ${input.employmentType} is outside preferred employment types.`,
    );
  }
  return { eligible: reasons.length === 0, reasons };
}
