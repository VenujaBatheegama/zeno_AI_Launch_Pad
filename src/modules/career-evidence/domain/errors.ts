export type CareerEvidenceErrorCode =
  | "INVALID_FILE"
  | "TEXT_EXTRACTION_FAILED"
  | "AI_EXTRACTION_FAILED"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "PERSISTENCE_FAILED";

export class CareerEvidenceError extends Error {
  constructor(
    public readonly code: CareerEvidenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CareerEvidenceError";
  }
}
