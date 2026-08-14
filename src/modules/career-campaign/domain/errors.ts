export type CareerCampaignErrorCode =
  | "EVIDENCE_REQUIRED"
  | "PREFERENCES_REQUIRED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "LIMIT_REACHED"
  | "RUN_IN_PROGRESS"
  | "PACKET_NOT_READY"
  | "AI_UNAVAILABLE"
  | "INVALID_AI_OUTPUT"
  | "PERSISTENCE_FAILED"
  | "UNAUTHORIZED";

export class CareerCampaignError extends Error {
  constructor(
    readonly code: CareerCampaignErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CareerCampaignError";
  }
}
