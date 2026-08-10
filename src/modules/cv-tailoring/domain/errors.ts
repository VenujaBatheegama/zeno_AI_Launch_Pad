export type CvTailoringErrorCode =
  | "EVIDENCE_REQUIRED"
  | "ANALYSIS_REQUIRED"
  | "JOB_NOT_ANALYSABLE"
  | "JOB_NOT_FOUND"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_STATE"
  | "INVALID_AI_OUTPUT"
  | "AI_UNAVAILABLE"
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_CANDIDATE_DATA"
  | "RENDER_FAILED"
  | "PERSISTENCE_FAILED"
  | "STALE_INPUT"
  | "GENERATION_IN_PROGRESS";

export class CvTailoringError extends Error {
  readonly code: CvTailoringErrorCode;
  readonly cause?: unknown;

  constructor(
    code: CvTailoringErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "CvTailoringError";
    this.code = code;
    this.cause = options?.cause;
  }
}
