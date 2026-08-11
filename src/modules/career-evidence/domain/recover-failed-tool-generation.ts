/**
 * Groq often returns nearly-complete tool arguments in `failed_generation`
 * when max completion tokens cut the JSON mid-string. Recover what we can.
 */

export function readFailedGeneration(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;

  const direct = asFailedGeneration(record.failed_generation ?? record.failedGeneration);
  if (direct) return direct;

  const data = record.data;
  if (data && typeof data === "object") {
    const nested = (data as { error?: { failed_generation?: unknown } }).error
      ?.failed_generation;
    const fromData = asFailedGeneration(nested);
    if (fromData) return fromData;
  }

  const body = record.responseBody;
  if (typeof body === "string" && body.length > 0) {
    try {
      const parsed = JSON.parse(body) as {
        error?: { failed_generation?: unknown };
      };
      const fromBody = asFailedGeneration(parsed.error?.failed_generation);
      if (fromBody) return fromBody;
    } catch {
      const match = body.match(/"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (match?.[1]) {
        try {
          return JSON.parse(`"${match[1]}"`) as string;
        } catch {
          return match[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
        }
      }
    }
  }

  const cause = record.cause;
  if (cause && cause !== error) return readFailedGeneration(cause);
  return null;
}

export function parseRecoveredToolArguments(
  failedGeneration: string,
): Record<string, unknown> | null {
  const trimmed = failedGeneration.trim();
  if (!trimmed) return null;

  const candidates = [trimmed, repairTruncatedJson(trimmed)].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

    const record = parsed as Record<string, unknown>;
    if (record.arguments && typeof record.arguments === "object") {
      return record.arguments as Record<string, unknown>;
    }
    if (record.profile || record.work_experience || record.education) {
      return record;
    }
  }

  // Arguments may be embedded without a full wrapper after truncation.
  const argsMatch = trimmed.match(/"arguments"\s*:\s*(\{[\s\S]*)$/);
  if (argsMatch?.[1]) {
    const repaired = repairTruncatedJson(argsMatch[1]);
    const parsed = repaired ? tryParseJson(repaired) : tryParseJson(argsMatch[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  return null;
}

/**
 * Drop trailing incomplete collection entries so Zod can accept a partial CV.
 */
export function salvageEvidencePayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  for (const key of [
    "work_experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "achievements",
    "references",
    "warnings",
  ] as const) {
    const value = next[key];
    if (!Array.isArray(value)) continue;
    next[key] = value.filter((item) => item && typeof item === "object");
  }
  if (!Array.isArray(next.warnings)) next.warnings = [];
  const warnings = next.warnings as unknown[];
  warnings.push(
    "Some CV sections may be incomplete because the model output was truncated; review the draft carefully.",
  );
  next.warnings = warnings.filter((item) => typeof item === "string");
  return next;
}

function asFailedGeneration(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Close open strings / brackets so truncated tool JSON can parse. */
export function repairTruncatedJson(input: string): string | null {
  let text = input.trim();
  if (!text) return null;

  // If we were cut mid-string, close the quote.
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
  }
  if (inString) {
    // Drop a trailing incomplete escape.
    if (text.endsWith("\\") && !text.endsWith("\\\\")) {
      text = text.slice(0, -1);
    }
    text += '"';
  }

  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") stack.push(char);
    if (char === "}" || char === "]") stack.pop();
  }

  // Remove a dangling comma before we close containers.
  text = text.replace(/,\s*$/u, "");

  while (stack.length > 0) {
    const open = stack.pop();
    text += open === "{" ? "}" : "]";
  }

  return tryParseJson(text) ? text : null;
}
