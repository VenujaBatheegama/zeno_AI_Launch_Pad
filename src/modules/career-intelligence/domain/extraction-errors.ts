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
  const message = error instanceof Error ? error.message : String(error);
  if (/rate limit|TPD|\b429\b/i.test(message)) return "rate_limited";
  if (/timeout|ETIMEDOUT|AbortError/i.test(message)) return "provider_timeout";
  if (/401|403|auth|permission|api key/i.test(message)) {
    return "provider_auth_failed";
  }
  if (/does not support response format|json_schema|invalid request|4\d\d/i.test(
    message,
  )) {
    return "configuration_error";
  }
  if (/schema|ZodError|does not match/i.test(message)) {
    return "schema_validation_failed";
  }
  if (/structured|No object generated|Failed to parse|tool call/i.test(message)) {
    return "structured_output_failed";
  }
  return "analysis_failed";
}
