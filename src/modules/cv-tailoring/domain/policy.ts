export const TAILORING_POLICY_VERSION = "cv-tailoring-v9";
export const TAILORING_PROMPT_VERSION = "cv-tailoring-prompt-v9";

export const MAX_TAILORING_CONTEXT_CHARS = 400;
export const MAX_FIT_ATTEMPTS = 2;
export const MAX_FRAGMENT_REPAIRS = 2;

/**
 * Soft planning guidance for content density (not hard enforcement).
 * Prefer more verified evidence per page over filler.
 */
export const ONE_PAGE_TARGET_WORDS = { min: 280, max: 380 } as const;
export const TWO_PAGE_TARGET_WORDS = { min: 600, max: 850 } as const;

/** One-page: exactly 2 projects when available; one short paragraph each. */
export const ONE_PAGE_PROJECT_TARGET = 2;
export const ONE_PAGE_PROJECT_MAX = 2;
export const ONE_PAGE_PARAGRAPHS_PER_PROJECT = 1;
export const ONE_PAGE_PROJECT_SOURCE_FACTS = 2;
export const ONE_PAGE_BULLETS_PER_EXPERIENCE = 2;
/** Soft guidance for prompts only — never slice prose to this length. */
export const ONE_PAGE_BULLET_MAX_CHARS = 200;
export const ONE_PAGE_SUMMARY_MAX_CHARS = 280;
export const ONE_PAGE_SKILL_MAX = 14;
export const ONE_PAGE_CERT_MAX = 2;
export const ONE_PAGE_PROJECT_PARAGRAPH_WORDS = { min: 35, max: 55 } as const;

/** Two-page: target 4 projects; allow a 5th when strong and non-repetitive. */
export const TWO_PAGE_PROJECT_TARGET = 4;
export const TWO_PAGE_PROJECT_MAX = 5;
export const TWO_PAGE_PARAGRAPHS_PER_PROJECT = 2;
export const TWO_PAGE_PROJECT_SOURCE_FACTS = 6;
export const TWO_PAGE_BULLETS_PER_EXPERIENCE = 4;
export const TWO_PAGE_BULLET_MAX_CHARS = 260;
export const TWO_PAGE_SUMMARY_MAX_CHARS = 560;
export const TWO_PAGE_SKILL_MAX = 26;
export const TWO_PAGE_CERT_MAX = 5;
export const TWO_PAGE_PROJECT_PARAGRAPH_WORDS = { min: 70, max: 130 } as const;

/** @deprecated Prefer paragraphsPerProject / projectSourceFacts. */
export const ONE_PAGE_BULLETS_PER_PROJECT = ONE_PAGE_PROJECT_SOURCE_FACTS;
/** @deprecated Prefer paragraphsPerProject / projectSourceFacts. */
export const TWO_PAGE_BULLETS_PER_PROJECT = TWO_PAGE_PROJECT_SOURCE_FACTS;

export const MIN_EVIDENCE_VOLUME_FOR_TWO_PAGE = 8;

/** Terms that must never appear in rendered CV text. */
export const FORBIDDEN_CV_PHRASES = [
  "worked on",
  "responsible for",
  "assisted with",
  "helped with",
  "participated in",
  "various tasks",
  "verified evidence",
  "verified experience",
  "verified project",
  "verified technical",
  "targeting roles that",
  "results-driven",
  "passionate",
  "highly motivated",
  "proven track record",
  "eager to learn",
  "team player",
  "delivery-focused environment",
  "gained hands-on experience",
  "worked on various tasks",
  "responsible for",
  "zeno",
] as const;
