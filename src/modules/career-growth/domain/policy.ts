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

/**
 * Market-stall: after this many days pending without enough data for a
 * market-refined assessment, fall back to a preliminary one using the actual
 * (partial) data rather than staying stuck.
 */
export const DEFAULT_PRELIMINARY_STALL_DAYS = 14;

/**
 * Label attached to the `marketEvidenceSummary` field when a preliminary
 * assessment is generated from partial market data due to a stall.
 * FU-5: Surface this label as a badge in growth-recommendation-workspace.
 */
export const PRELIMINARY_MARKET_LABEL = "preliminary — limited market data";

/**
 * Nudge policy for unconfirmed evidence handoffs.
 * After all milestones complete, Zeno sends a first nudge after this many days,
 * then repeats up to DEFAULT_NUDGE_MAX_REMINDERS times (each cycle = delay).
 */
export const DEFAULT_NUDGE_DELAY_DAYS = 7;
export const DEFAULT_NUDGE_MAX_REMINDERS = 3;

/**
 * Feedback signal weights for application outcomes.
 * Referenced by FU-1 (scoring integration). Defined here so the signal emitter
 * and the future scoring consumer share the same source of truth.
 */
export const APPLICATION_OUTCOME_SIGNAL_WEIGHTS: Record<string, number> = {
  offer: 1.0,
  rejected: -0.5,
  withdrawn: 0.0,
};



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
