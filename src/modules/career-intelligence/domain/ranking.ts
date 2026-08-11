import {
  FINAL_RANK_WEIGHTS,
  PROFILE_ALIGNMENT_WEIGHTS,
} from "./policy";
import type { CareerLevelSuitability, ConfidenceLevel } from "./schemas";
import {
  isJobTitleIncompatibleWithPreferences,
  titleMatchesExcludedKeyword,
} from "@/modules/job-discovery/domain/job";

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

export type PersonalizedRankableMatch = RankableMatch & {
  searchRelevance: number;
  /** Interest-only (preferred/excluded); 0 when user has no explicit interests. */
  interestAlignment: number;
  rankingReasons?: string[];
};

export type FinalRankBreakdown = {
  searchRelevance: number;
  interestAlignment: number;
  evidenceFit: number;
  finalScore: number;
  reasons: string[];
};

/**
 * Normalize discovery search relevance (~0–200) onto a 0–100 scale.
 */
export function normalizeSearchRelevance(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw / 1.5)));
}

/**
 * Normalize interest alignment onto 0–100 using the positive preference weight scale.
 */
export function normalizeInterestAlignment(raw: number): number {
  if (raw === 0) return 0;
  const span = PROFILE_ALIGNMENT_WEIGHTS.positiveCap;
  const shifted = raw + Math.abs(PROFILE_ALIGNMENT_WEIGHTS.excludedMatch) * 2;
  return Math.max(0, Math.min(100, Math.round((shifted / (span + 40)) * 100)));
}

export function combineFinalRankingScore(input: {
  searchRelevance: number;
  interestAlignment: number;
  evidenceFit: number;
  hasExplicitInterests: boolean;
}): FinalRankBreakdown {
  const search = normalizeSearchRelevance(input.searchRelevance);
  const interest = input.hasExplicitInterests
    ? normalizeInterestAlignment(input.interestAlignment)
    : 0;
  const evidence = Math.max(0, Math.min(100, input.evidenceFit));

  const weights = input.hasExplicitInterests
    ? FINAL_RANK_WEIGHTS
    : {
        searchRelevance: FINAL_RANK_WEIGHTS.searchRelevance + FINAL_RANK_WEIGHTS.interestAlignment / 2,
        interestAlignment: 0,
        evidenceFit: FINAL_RANK_WEIGHTS.evidenceFit + FINAL_RANK_WEIGHTS.interestAlignment / 2,
      };

  const finalScore =
    weights.searchRelevance * search +
    weights.interestAlignment * interest +
    weights.evidenceFit * evidence;

  return {
    searchRelevance: search,
    interestAlignment: interest,
    evidenceFit: evidence,
    finalScore,
    reasons: [],
  };
}

/** Legacy eligibility-first sort used when personalized signals are unavailable. */
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

/**
 * Final post-analyse ordering: search relevance gates weak role matches,
 * then composite of normalized search + interest + evidence-fit (scoring-v2).
 */
export function rankMatchesPersonalized(
  matches: PersonalizedRankableMatch[],
  options?: { hasExplicitInterests?: boolean },
): PersonalizedRankableMatch[] {
  const hasExplicitInterests = options?.hasExplicitInterests ?? true;
  return [...matches]
    .map((match) => {
      const combined = combineFinalRankingScore({
        searchRelevance: match.searchRelevance,
        interestAlignment: match.interestAlignment,
        evidenceFit: match.evidenceFitScore,
        hasExplicitInterests,
      });
      return { match, combined };
    })
    .sort((a, b) => {
      if (a.match.eligible !== b.match.eligible) {
        return a.match.eligible ? -1 : 1;
      }
      const aStrong = a.match.searchRelevance >= 40;
      const bStrong = b.match.searchRelevance >= 40;
      if (aStrong !== bStrong) return aStrong ? -1 : 1;
      if (b.combined.finalScore !== a.combined.finalScore) {
        return b.combined.finalScore - a.combined.finalScore;
      }
      if (b.match.evidenceFitScore !== a.match.evidenceFitScore) {
        return b.match.evidenceFitScore - a.match.evidenceFitScore;
      }
      const aTime = a.match.publishedAt ? Date.parse(a.match.publishedAt) : 0;
      const bTime = b.match.publishedAt ? Date.parse(b.match.publishedAt) : 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.match.jobId.localeCompare(b.match.jobId);
    })
    .map((entry) => entry.match);
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
