export type JobDiscoveryErrorCode =
  | "INVALID_PREFERENCES"
  | "SEARCH_NOT_CONFIGURED"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_RATE_LIMITED"
  | "SOURCE_FORBIDDEN"
  | "SOURCE_UNAUTHORIZED"
  | "PERSISTENCE_FAILED"
  | "NOT_FOUND";

export class JobDiscoveryError extends Error {
  constructor(
    readonly code: JobDiscoveryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "JobDiscoveryError";
  }
}
