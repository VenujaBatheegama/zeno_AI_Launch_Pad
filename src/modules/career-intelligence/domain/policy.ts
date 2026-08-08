export const CAREER_STAGE_POLICY_VERSION = "career-stage-v1";
export const SCORING_POLICY_VERSION = "scoring-v2";
export const EXTRACTION_POLICY_VERSION = "job-extraction-v1";
export const MATCHING_POLICY_VERSION = "matching-v3";
export const CAPABILITY_EXTRACTION_POLICY_VERSION = "capability-extraction-v1";
export const CAPABILITY_AGGREGATION_POLICY_VERSION = "capability-aggregation-v1";
export const PERSONALIZATION_POLICY_VERSION = "personalization-v1";

export const DEFAULT_SEARCH_QUERY_BUDGET = 2;
export const DEFAULT_ANALYSIS_BATCH_SIZE = 5;

/** Deterministic aggregation influence weights (must sum to 1). */
export const CAPABILITY_AGGREGATION_WEIGHTS = {
  depth: 0.35,
  context: 0.25,
  recency: 0.15,
  repetition: 0.15,
  ownership: 0.1,
} as const;

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

export const ROLE_FAMILY_CATALOG = {
  software_engineering: {
    label: "Software Engineering",
    keywords: [
      "software engineer",
      "software developer",
      "software engineering",
      "full stack",
      "backend",
      "frontend",
    ],
    titles_by_band: {
      internship_ready: [
        "Software Engineering Intern",
        "Software Developer Intern",
        "Trainee Software Engineer",
      ],
      experienced_intern_or_graduate_ready: [
        "Associate Software Engineer",
        "Junior Software Engineer",
        "Graduate Software Engineer",
        "Software Engineer I",
        "Software Developer",
      ],
      early_career: [
        "Software Engineer",
        "Associate Software Engineer",
        "Junior Software Engineer",
        "Software Developer",
        "Full Stack Developer",
      ],
      established_individual_contributor: [
        "Software Engineer",
        "Full Stack Engineer",
        "Backend Engineer",
        "Frontend Engineer",
      ],
      senior: ["Senior Software Engineer", "Staff Software Engineer"],
      lead_or_management: [
        "Engineering Lead",
        "Tech Lead",
        "Software Engineering Manager",
      ],
    },
  },
  devops_platform: {
    label: "DevOps / Platform",
    keywords: [
      "devops",
      "sre",
      "site reliability",
      "platform engineer",
      "cloud engineer",
      "infrastructure",
    ],
    titles_by_band: {
      internship_ready: [
        "DevOps Intern",
        "Cloud Engineering Intern",
        "SRE Intern",
      ],
      experienced_intern_or_graduate_ready: [
        "Associate DevOps Engineer",
        "Junior DevOps Engineer",
        "Graduate Cloud Engineer",
        "Junior Platform Engineer",
      ],
      early_career: [
        "DevOps Engineer",
        "Cloud Engineer",
        "Platform Engineer",
        "Junior Site Reliability Engineer",
      ],
      established_individual_contributor: [
        "DevOps Engineer",
        "Cloud Engineer",
        "Platform Engineer",
        "Site Reliability Engineer",
        "Infrastructure Engineer",
      ],
      senior: ["Senior DevOps Engineer", "Senior Site Reliability Engineer"],
      lead_or_management: ["Platform Lead", "DevOps Lead"],
    },
  },
} as const;

export type RoleFamilyKey = keyof typeof ROLE_FAMILY_CATALOG;
