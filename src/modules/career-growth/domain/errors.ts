export type CareerGrowthErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "AI_UNAVAILABLE"
  | "INVALID_AI_OUTPUT"
  | "PERSISTENCE_FAILED"
  | "CAPACITY_UNAVAILABLE";

export class CareerGrowthError extends Error {
  constructor(
    readonly code: CareerGrowthErrorCode,
    message: string,
    options?: ErrorOptions & { retryAfter?: string | null },
  ) {
    super(message, options);
    this.name = "CareerGrowthError";
    this.retryAfter = options?.retryAfter ?? null;
  }

  readonly retryAfter: string | null;
}
