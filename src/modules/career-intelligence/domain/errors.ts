export type CareerIntelligenceErrorCode =
  | "EVIDENCE_REQUIRED"
  | "PREFERENCES_REQUIRED"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_ANALYSABLE"
  | "ANALYSIS_REQUIRED"
  | "STALE_ANALYSIS"
  | "INVALID_AI_OUTPUT"
  | "AI_UNAVAILABLE"
  | "SEARCH_FAILED"
  | "PERSISTENCE_FAILED"
  | "NOT_FOUND"
  | "INVALID_INPUT";

export class CareerIntelligenceError extends Error {
  constructor(
    readonly code: CareerIntelligenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CareerIntelligenceError";
  }
}
