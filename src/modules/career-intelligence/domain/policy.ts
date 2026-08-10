export const CAREER_STAGE_POLICY_VERSION = "career-stage-v1";
export const SCORING_POLICY_VERSION = "scoring-v2";
/** Bumped for strict json_schema extraction + shared description-hash cache. */
export const EXTRACTION_POLICY_VERSION = "job-extraction-v2";
export const MATCHING_POLICY_VERSION = "matching-v3";

/** ESCO occupation resolver + title-selection policy versions (plan invalidation). */
export const ESCO_RESOLVER_VERSION = "esco-resolver-v1";
export const ESCO_SELECTION_POLICY_VERSION = "esco-selection-v1";

export const DEFAULT_SEARCH_QUERY_BUDGET = 2;
export const DEFAULT_ANALYSIS_BATCH_SIZE = 5;
/** Max ESCO alternative titles per explicit role (preferred is separate). */
export const DEFAULT_ESCO_MAX_ALTERNATIVE_TITLES = 2;

export const REQUIREMENT_WEIGHTS = {
  required: 3,
  preferred: 1,
  unclear: 2,
} as const;

export const MATCH_CREDITS = {
  matched: 1,
  partial: 0.5,
  /** Low-confidence partials (e.g. skill-list-only) cannot dominate fit. */
  partial_low_confidence: 0.25,
  gap: 0,
  unknown: 0,
  not_applicable: 0,
} as const;

/** Minority term coverage below this cannot satisfy a conjunctive stack requirement. */
export const MULTI_TERM_COVERAGE_THRESHOLD = 0.5;

/** Months of relevant internship experience that typically justify prioritizing early-career roles. */
export const INTERNSHIP_PROGRESSION_MONTHS = 6;

export function escoPolicyFingerprint(): string {
  return `esco:${ESCO_RESOLVER_VERSION}:${ESCO_SELECTION_POLICY_VERSION}`;
}
