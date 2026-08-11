import type { JobSearchCriteria, NormalizedExternalJob } from "./job";
import { analyseLocationPreferences } from "./location-match";
import {
  alignJobToProfile,
  type JobProfileAlignment,
  type MatchableProfileTerm,
} from "./profile-alignment";
import { PROFILE_ALIGNMENT_WEIGHTS } from "@/modules/career-intelligence/domain/policy";

export type RelevanceRankableJob = Pick<
  NormalizedExternalJob,
  | "title"
  | "location"
  | "city"
  | "region"
  | "country"
  | "description"
  | "published_at"
  | "employment_type"
  | "work_mode"
  | "experience_level"
  | "application_url"
>;

export type PersonalizedRankBreakdown = {
  searchRelevance: number;
  interestAlignment: number;
  verifiedAlignment: number;
  alignmentContribution: number;
  finalScore: number;
  reasons: string[];
  verifiedMatches: string[];
  preferredMatches: string[];
  excludedMatches: string[];
};

/**
 * Source-agnostic relevance for the hybrid pool.
 * Provider/publisher must never affect score.
 */
export function scoreJobRelevance(
  job: RelevanceRankableJob,
  criteria: Pick<
    JobSearchCriteria,
    | "role_titles"
    | "locations"
    | "work_modes"
    | "employment_types"
    | "experience_levels"
  >,
): number {
  let score = 0;
  score += titleRelevance(job.title, criteria.role_titles);
  score += locationRelevance(job, criteria.locations);
  score += workModeRelevance(job.work_mode, criteria.work_modes);
  score += employmentTypeRelevance(
    job.employment_type,
    criteria.employment_types,
  );
  score += experienceRelevance(job, criteria.experience_levels, criteria.role_titles);
  score += recencyBoost(job.published_at);
  if (job.description && job.description.trim().length >= 40) score += 8;
  if (job.application_url) score += 4;
  return score;
}

export function scoreJobWithProfileAlignment(
  job: RelevanceRankableJob,
  criteria: Pick<
    JobSearchCriteria,
    | "role_titles"
    | "locations"
    | "work_modes"
    | "employment_types"
    | "experience_levels"
  >,
  terms: MatchableProfileTerm[],
): PersonalizedRankBreakdown {
  const searchRelevance = scoreJobRelevance(job, criteria);
  const alignment = alignJobToProfile({
    title: job.title,
    description: job.description,
    terms,
  });
  return breakdownFromParts(searchRelevance, alignment);
}

function breakdownFromParts(
  searchRelevance: number,
  alignment: JobProfileAlignment,
): PersonalizedRankBreakdown {
  return {
    searchRelevance,
    interestAlignment: alignment.interestScore,
    verifiedAlignment:
      alignment.verifiedMatches.length * PROFILE_ALIGNMENT_WEIGHTS.verifiedMatch,
    alignmentContribution: alignment.alignmentScore,
    finalScore: searchRelevance + alignment.alignmentScore,
    reasons: alignment.reasons,
    verifiedMatches: alignment.verifiedMatches,
    preferredMatches: alignment.preferredMatches,
    excludedMatches: alignment.excludedMatches,
  };
}

/**
 * Metadata-only ranking (no profile terms). Kept for hybrid discover paths
 * that run before profile vocabulary is loaded.
 */
export function rankJobsByRelevance<T extends RelevanceRankableJob>(
  jobs: T[],
  criteria: Pick<
    JobSearchCriteria,
    | "role_titles"
    | "locations"
    | "work_modes"
    | "employment_types"
    | "experience_levels"
  >,
): T[] {
  return rankJobsPersonalized(jobs, criteria, []);
}

/**
 * Preliminary discovery ranking: search relevance dominates; profile alignment
 * is a capped add-on so unrelated occupations cannot win via skill overlap.
 */
export function rankJobsPersonalized<T extends RelevanceRankableJob>(
  jobs: T[],
  criteria: Pick<
    JobSearchCriteria,
    | "role_titles"
    | "locations"
    | "work_modes"
    | "employment_types"
    | "experience_levels"
  >,
  terms: MatchableProfileTerm[],
): T[] {
  return [...jobs]
    .map((job, index) => {
      const breakdown = scoreJobWithProfileAlignment(job, criteria, terms);
      return {
        job,
        index,
        score: breakdown.finalScore,
        searchRelevance: breakdown.searchRelevance,
        publishedMs: job.published_at
          ? Date.parse(job.published_at)
          : Number.NEGATIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      const aStrong = a.searchRelevance >= 40;
      const bStrong = b.searchRelevance >= 40;
      if (aStrong !== bStrong) return aStrong ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      if (b.searchRelevance !== a.searchRelevance) {
        return b.searchRelevance - a.searchRelevance;
      }
      if (b.publishedMs !== a.publishedMs) return b.publishedMs - a.publishedMs;
      return a.index - b.index;
    })
    .map((entry) => entry.job);
}

function titleRelevance(title: string, roleTitles: string[]): number {
  const haystack = normalize(title);
  if (!haystack || roleTitles.length === 0) return 0;

  let best = 0;
  for (const role of roleTitles) {
    const needle = normalize(role);
    if (!needle) continue;
    if (haystack === needle) {
      best = Math.max(best, 100);
      continue;
    }
    if (haystack.includes(needle)) {
      best = Math.max(best, 85);
      continue;
    }
    const roleTokens = meaningfulTokens(needle);
    if (roleTokens.length === 0) continue;
    const hits = roleTokens.filter((token) => haystack.includes(token)).length;
    const ratio = hits / roleTokens.length;
    if (ratio >= 1) best = Math.max(best, 70);
    else if (ratio >= 0.66) best = Math.max(best, 45);
    else if (ratio >= 0.5) best = Math.max(best, 25);
  }

  const wantsSenior = roleTitles.some((role) =>
    /\b(senior|lead|principal|staff)\b/iu.test(role),
  );
  const isSeniorTitle = /\b(senior|sr\.?|principal|staff|lead|director)\b/iu.test(
    title,
  );
  if (!wantsSenior && isSeniorTitle) best -= 15;

  return best;
}

function locationRelevance(
  job: RelevanceRankableJob,
  locations: string[],
): number {
  const analysis = analyseLocationPreferences(locations);
  if (analysis.placeNeedles.length === 0 && !analysis.allowRemote) return 0;

  const haystack = normalize(
    [job.location, job.city, job.region, job.country].filter(Boolean).join(" "),
  );
  if (!haystack) return analysis.allowRemote ? 5 : 0;

  let score = 0;
  if (analysis.placeNeedles.some((needle) => haystack.includes(needle))) {
    score += 30;
    if (/\bcolombo\b/u.test(haystack) && analysis.placeNeedles.includes("colombo")) {
      score += 8;
    }
  }
  if (
    analysis.allowRemote &&
    (job.work_mode === "remote" || /\bremote\b/u.test(haystack))
  ) {
    score += 10;
  }
  return score;
}

function workModeRelevance(
  workMode: RelevanceRankableJob["work_mode"],
  preferred: JobSearchCriteria["work_modes"],
): number {
  if (!workMode || preferred.length === 0) return 0;
  return preferred.includes(workMode) ? 12 : 0;
}

function employmentTypeRelevance(
  employmentType: RelevanceRankableJob["employment_type"],
  preferred: JobSearchCriteria["employment_types"],
): number {
  if (!employmentType || preferred.length === 0) return 0;
  return preferred.includes(employmentType) ? 10 : 0;
}

function experienceRelevance(
  job: RelevanceRankableJob,
  preferredLevels: JobSearchCriteria["experience_levels"],
  roleTitles: string[],
): number {
  if (job.experience_level && preferredLevels.includes(job.experience_level)) {
    return 10;
  }
  const title = job.title.toLocaleLowerCase();
  const wantsEntry = roleTitles.some((role) =>
    /\b(junior|associate|graduate|intern|entry)\b/iu.test(role),
  );
  if (
    wantsEntry &&
    /\b(junior|associate|graduate|intern|entry|trainee)\b/u.test(title)
  ) {
    return 12;
  }
  return 0;
}

function recencyBoost(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const publishedMs = Date.parse(publishedAt);
  if (Number.isNaN(publishedMs)) return 0;
  const ageDays = (Date.now() - publishedMs) / (1000 * 60 * 60 * 24);
  if (ageDays <= 3) return 20;
  if (ageDays <= 7) return 14;
  if (ageDays <= 14) return 8;
  if (ageDays <= 30) return 4;
  return 0;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ");
}

function meaningfulTokens(value: string): string[] {
  return value.split(" ").filter((token) => token.length > 2);
}
