import { ZodError } from "zod";

export const EXTRACTION_FAILURE_CATEGORIES = [
  "insufficient_description",
  "rate_limited",
  "provider_timeout",
  "structured_output_failed",
  "schema_validation_failed",
  "provider_auth_failed",
  "configuration_error",
  "analysis_failed",
] as const;

export type ExtractionFailureCategory =
  (typeof EXTRACTION_FAILURE_CATEGORIES)[number];

export const EXTRACTION_USER_MESSAGES: Record<
  ExtractionFailureCategory,
  string
> = {
  insufficient_description:
    "This listing has too little description to analyse.",
  rate_limited: "Job analysis is briefly rate-limited. Try again shortly.",
  provider_timeout: "Job analysis timed out. Try again.",
  structured_output_failed:
    "Zeno could not read requirements from this listing.",
  schema_validation_failed:
    "Zeno received an invalid requirements payload for this listing.",
  provider_auth_failed:
    "Job analysis is misconfigured. Check Groq API credentials.",
  configuration_error:
    "Job analysis is misconfigured. Check model/structured-output settings.",
  analysis_failed: "Analysis failed for this listing.",
};

export function classifyExtractionError(
  error: unknown,
): ExtractionFailureCategory {
  if (error instanceof ZodError) return "schema_validation_failed";
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "GroqCapacityUnavailableError"
  ) {
    return "rate_limited";
  }
  const message = error instanceof Error ? error.message : String(error);
  const body =
    error && typeof error === "object" && "responseBody" in error
      ? String((error as { responseBody?: unknown }).responseBody ?? "")
      : "";
  const combined = `${message}\n${body}`;
  if (
    /rate limit|TPD|\bTPM\b|\b429\b|Request too large|tokens per minute/i.test(
      combined,
    )
  ) {
    return "rate_limited";
  }
  if (/timeout|ETIMEDOUT|AbortError/i.test(combined)) return "provider_timeout";
  if (/401|403|auth|permission|api key/i.test(combined)) {
    return "provider_auth_failed";
  }
  if (
    /json_validate_failed|Failed to (validate|generate) JSON|max completion tokens|failed_generation/i.test(
      combined,
    )
  ) {
    return "structured_output_failed";
  }
  if (/does not support response format|json_schema|invalid_api_key/i.test(combined)) {
    return "configuration_error";
  }
  if (/schema|ZodError|does not match/i.test(combined)) {
    return "schema_validation_failed";
  }
  if (/structured|No object generated|Failed to parse|tool call/i.test(combined)) {
    return "structured_output_failed";
  }
  return "analysis_failed";
}
