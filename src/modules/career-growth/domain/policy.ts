export const GROWTH_POLICY_VERSION = "growth-assessment-v1";

/** Minimum successfully analysed campaign jobs before market refinement. */
export const DEFAULT_MARKET_MIN_ANALYSED_JOBS = 5;

/** Ignore requirement frequency below this share when ranking market gaps. */
export const MARKET_MIN_FREQUENCY = 2;

export const WEEKLY_HOUR_OPTIONS = [2, 5, 8, 10] as const;
export type WeeklyHoursAvailable = (typeof WEEKLY_HOUR_OPTIONS)[number];

export const DEFAULT_WEEKLY_HOURS: WeeklyHoursAvailable = 5;

/** Slack hours before a user is treated as overcommitted. */
export const WORKLOAD_SLACK_HOURS = 1;

export const MAX_PENDING_RECOMMENDATIONS_PER_CAMPAIGN = 1;
export const MAX_CHAT_HISTORY = 12;
export const MAX_ASSESSMENT_ATTEMPTS = 5;
export const ASSESSMENT_LEASE_MS = 120_000;
export const MALFORMED_OUTPUT_RETRY_LIMIT = 1;

export const ASSESSMENT_DIMENSION_KEYS = [
  "role_alignment",
  "technical_relevance",
  "technical_depth",
  "project_complexity",
  "production_readiness",
  "testing_practices",
  "deployment_ops",
  "collaboration",
  "public_portfolio",
  "communication_docs",
  "professional_evidence",
  "stack_specific",
] as const;

export type AssessmentDimensionKey = (typeof ASSESSMENT_DIMENSION_KEYS)[number];

export const DIMENSION_LABELS: Record<AssessmentDimensionKey, string> = {
  role_alignment: "Role alignment",
  technical_relevance: "Technical relevance",
  technical_depth: "Technical depth",
  project_complexity: "Project complexity",
  production_readiness: "Production readiness",
  testing_practices: "Testing and engineering practices",
  deployment_ops: "Deployment and operations",
  collaboration: "Collaboration",
  public_portfolio: "Public portfolio quality",
  communication_docs: "Communication and documentation",
  professional_evidence: "Professional or real-user evidence",
  stack_specific: "Stack-specific evidence",
};

/** Missing/partial dimensions are considered in this order. */
export const GAP_PRIORITY: AssessmentDimensionKey[] = [
  "stack_specific",
  "production_readiness",
  "testing_practices",
  "deployment_ops",
  "project_complexity",
  "technical_depth",
  "professional_evidence",
  "public_portfolio",
  "communication_docs",
  "collaboration",
  "technical_relevance",
  "role_alignment",
];
