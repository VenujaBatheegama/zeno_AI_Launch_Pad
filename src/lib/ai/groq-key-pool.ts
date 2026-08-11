import { createGroq } from "@ai-sdk/groq";

/**
 * Temporary multi-key rotation for free-tier Groq quotas during MVP testing.
 * Keys marked rate-limited are skipped until their cooldown expires.
 */
export class GroqKeyPool {
  private readonly keys: string[];
  private readonly exhaustedUntil = new Map<string, number>();
  private preferredIndex = 0;

  constructor(keys: string[]) {
    this.keys = dedupe(keys);
    if (this.keys.length === 0) {
      throw new Error("At least one Groq API key is required.");
    }
  }

  get size(): number {
    return this.keys.length;
  }

  /** Stable fingerprint so callers can rebuild when env keys change. */
  get fingerprint(): string {
    return this.keys.join("|");
  }

  async withKey<T>(
    fn: (apiKey: string) => Promise<T>,
    options?: {
      /**
       * When true (default), try the next key after a 429.
       * When false, cool down the hit key and rethrow immediately so callers
       * can pause the whole route (shared org quotas often share TPD).
       */
      rotateOnRateLimit?: boolean;
      /**
       * When true (default), try the next key after tool/JSON structured-output
       * flakiness. Set false for json_schema extraction: those failures are
       * usually model/token-budget issues, and rotating free-tier keys that
       * share an org only burns TPM without helping.
       */
      rotateOnToolFailure?: boolean;
    },
  ): Promise<T> {
    const rotateOnRateLimit = options?.rotateOnRateLimit !== false;
    const rotateOnToolFailure = options?.rotateOnToolFailure !== false;
    const candidates = this.orderedAvailableKeys();
    if (candidates.length === 0) {
      const retryAt = Math.min(...this.exhaustedUntil.values());
      const waitMinutes = Math.max(
        1,
        Math.ceil((retryAt - Date.now()) / 60_000),
      );
      throw new GroqKeysExhaustedError(
        `All configured Groq API keys are temporarily unavailable. Try again in about ${waitMinutes} minute(s).`,
      );
    }

    let lastError: unknown;
    for (const apiKey of candidates) {
      try {
        const result = await fn(apiKey);
        this.preferredIndex = this.keys.indexOf(apiKey);
        return result;
      } catch (error) {
        lastError = error;
        if (isGroqRateLimited(error)) {
          const until = Date.now() + parseRetryMs(error);
          this.exhaustedUntil.set(apiKey, until);
          console.warn(
            `[groq] key ${maskKey(apiKey)} rate-limited until ${new Date(until).toISOString()}; ${
              rotateOnRateLimit
                ? "trying next key if available."
                : "not rotating keys (shared-quota safe)."
            }`,
          );
          if (!rotateOnRateLimit) throw error;
          continue;
        }
        // Tool-call flakiness is often model/key specific — try the next key
        // without cooling the current one down for the full TPD window.
        if (isGroqToolFailure(error)) {
          console.warn(
            `[groq] key ${maskKey(apiKey)} tool-call/JSON failure; ${
              rotateOnToolFailure
                ? "trying next key if available."
                : "not rotating keys (model/fallback handles retry)."
            }`,
          );
          if (!rotateOnToolFailure) throw error;
          continue;
        }
        throw error;
      }
    }

    if (lastError instanceof GroqKeysExhaustedError) throw lastError;
    throw new GroqKeysExhaustedError(
      "All configured Groq API keys failed for this request.",
      { cause: lastError },
    );
  }

  createModel(apiKey: string, modelId: string) {
    return createGroq({ apiKey })(modelId);
  }

  private orderedAvailableKeys(): string[] {
    const now = Date.now();
    for (const [key, until] of this.exhaustedUntil) {
      if (until <= now) this.exhaustedUntil.delete(key);
    }

    const available = this.keys.filter((key) => !this.exhaustedUntil.has(key));
    if (available.length <= 1) return available;

    const preferred = this.keys[this.preferredIndex];
    if (preferred && available.includes(preferred)) {
      return [preferred, ...available.filter((key) => key !== preferred)];
    }
    return available;
  }
}

export class GroqKeysExhaustedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GroqKeysExhaustedError";
  }
}

export function isGroqRateLimited(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /rate limit/i.test(message) ||
    /tokens per day/i.test(message) ||
    /tokens per minute/i.test(message) ||
    /Request too large/i.test(message) ||
    /\bTPD\b/.test(message) ||
    /\bTPM\b/.test(message) ||
    /\b429\b/.test(message)
  );
}

export function isGroqToolFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const body =
    error && typeof error === "object" && "responseBody" in error
      ? String((error as { responseBody?: unknown }).responseBody ?? "")
      : "";
  const combined = `${message}\n${body}`;
  return (
    /Tool choice is required/i.test(combined) ||
    /Failed to call a function/i.test(combined) ||
    /tool_use_failed/i.test(combined) ||
    /tool call validation failed/i.test(combined) ||
    /Failed to validate JSON/i.test(combined) ||
    // Groq sometimes omits the space: "asJSON"
    /Failed to parse tool call arguments as\s*JSON/i.test(combined) ||
    /Invalid JSON/i.test(combined) ||
    /Unexpected token/i.test(combined)
  );
}

export function parseRetryMs(error: unknown): number {
  if (error && typeof error === "object") {
    const record = error as {
      headers?: Headers | Record<string, string>;
      responseHeaders?: Headers | Record<string, string>;
      statusCode?: number;
      data?: { error?: { message?: string } };
    };
    const headerValue = readHeader(record.headers, "retry-after")
      ?? readHeader(record.responseHeaders, "retry-after");
    if (headerValue) {
      const asSeconds = Number(headerValue);
      if (Number.isFinite(asSeconds) && asSeconds >= 0) {
        return Math.min(asSeconds * 1000, 45 * 60 * 1000);
      }
      const asDate = Date.parse(headerValue);
      if (Number.isFinite(asDate)) {
        return Math.min(Math.max(0, asDate - Date.now()), 45 * 60 * 1000);
      }
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const minutesSeconds = message.match(/try again in (\d+)m([\d.]+)s/i);
  if (minutesSeconds) {
    return (Number(minutesSeconds[1]) * 60 + Number(minutesSeconds[2])) * 1000;
  }
  const secondsOnly = message.match(/try again in ([\d.]+)s/i);
  if (secondsOnly) {
    return Number(secondsOnly[1]) * 1000;
  }
  return 45 * 60 * 1000;
}

function readHeader(
  headers: Headers | Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function maskKey(apiKey: string): string {
  if (apiKey.length <= 10) return "***";
  return `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`;
}

function dedupe(keys: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
