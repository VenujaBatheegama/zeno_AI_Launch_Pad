import { createGroq } from "@ai-sdk/groq";

/**
 * Temporary multi-key rotation for free-tier Groq quotas during MVP testing.
 * Keys marked rate-limited are skipped until their cooldown expires.
 */
export class GroqKeyPool {
  private readonly keys: string[];
  private readonly exhaustedUntil = new Map<string, number>();
  private preferredIndex = 0;
  /** Shared org/project cooldown — quota is not multiplied by extra keys. */
  private sharedCooldownUntil = 0;
  lastRateLimitMeta: GroqRateLimitMeta | null = null;

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
       * When true, try the next key after a 429. Default is false: quota is
       * treated as shared across keys, so a 429 establishes a pool cooldown.
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
    const rotateOnRateLimit = options?.rotateOnRateLimit === true;
    const rotateOnToolFailure = options?.rotateOnToolFailure !== false;
    if (this.sharedCooldownUntil > Date.now()) {
      throw new GroqCapacityUnavailableError(
        `Groq is in a shared cooldown until ${new Date(this.sharedCooldownUntil).toISOString()}.`,
        this.lastRateLimitMeta,
      );
    }
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
      let keyAttempts = 0;
      while (keyAttempts < 2) {
        keyAttempts += 1;
        try {
          const result = await fn(apiKey);
          this.preferredIndex = this.keys.indexOf(apiKey);
          return result;
        } catch (error) {
          lastError = error;
          if (isGroqRateLimited(error)) {
            const retryMs = parseRetryMs(error);
            const meta = readRateLimitMeta(error, {
              retryMs,
              keyFingerprint: maskKey(apiKey),
            });
            this.lastRateLimitMeta = meta;
            const shortTpm =
              isGroqTokensPerMinuteLimit(error) && retryMs <= 15_000;

            // Short TPM: wait and retry THIS key once. Do not rotate —
            // extra keys from the same org share the bucket.
            if (shortTpm && keyAttempts < 2) {
              console.warn(
                JSON.stringify({
                  scope: "groq",
                  event: "tpm_wait_same_key",
                  ...meta,
                }),
              );
              await sleep(retryMs + 150);
              continue;
            }

            const until = Date.now() + retryMs;
            this.exhaustedUntil.set(apiKey, until);
            this.sharedCooldownUntil = Math.max(this.sharedCooldownUntil, until);
            console.warn(
              JSON.stringify({
                scope: "groq",
                event: "shared_cooldown_established",
                ...meta,
                until: new Date(until).toISOString(),
                rotate: rotateOnRateLimit,
              }),
            );
            if (!rotateOnRateLimit) {
              throw new GroqCapacityUnavailableError(
                "Groq shared quota is exhausted for this window.",
                meta,
                { cause: error },
              );
            }
            break;
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
            break;
          }
          throw error;
        }
      }
    }

    if (lastError instanceof GroqKeysExhaustedError) throw lastError;
    if (lastError instanceof GroqCapacityUnavailableError) throw lastError;
    if (this.sharedCooldownUntil > Date.now()) {
      throw new GroqCapacityUnavailableError(
        "Groq shared quota is exhausted for this window.",
        this.lastRateLimitMeta,
        { cause: lastError },
      );
    }
    throw new GroqKeysExhaustedError(
      "All configured Groq API keys failed for this request.",
      { cause: lastError },
    );
  }

  isSharedCooldownActive(now = Date.now()): boolean {
    return this.sharedCooldownUntil > now;
  }

  sharedCooldownUntilMs(): number {
    return this.sharedCooldownUntil;
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

export type GroqRateLimitMeta = {
  httpStatus: number | null;
  retryAfterMs: number | null;
  requestLimitRemaining: string | null;
  requestLimitReset: string | null;
  tokenLimitRemaining: string | null;
  tokenLimitReset: string | null;
  keyFingerprint: string | null;
};

export class GroqCapacityUnavailableError extends Error {
  constructor(
    message: string,
    readonly meta: GroqRateLimitMeta | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GroqCapacityUnavailableError";
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
  // Groq TPM messages often say "847.5ms" — must not fall through to a long default.
  const millisecondsOnly = message.match(/try again in ([\d.]+)\s*ms\b/i);
  if (millisecondsOnly) {
    return Math.min(Math.max(Math.ceil(Number(millisecondsOnly[1])), 100), 60_000);
  }
  const secondsOnly = message.match(/try again in ([\d.]+)\s*s\b/i);
  if (secondsOnly) {
    return Math.min(Number(secondsOnly[1]) * 1000, 45 * 60 * 1000);
  }

  // Unknown wait: keep TPM brief; only daily quota gets a long cool-down.
  if (/tokens per minute|\bTPM\b/i.test(message)) {
    return 2_000;
  }
  if (/tokens per day|\bTPD\b|daily token/i.test(message)) {
    return 45 * 60 * 1000;
  }
  return 60_000;
}

/** True when the error is a short tokens-per-minute throttle (not daily quota). */
export function isGroqTokensPerMinuteLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tokens per minute|\bTPM\b/i.test(message) || /try again in [\d.]+\s*ms\b/i.test(message);
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

function readRateLimitMeta(
  error: unknown,
  extra: { retryMs: number; keyFingerprint: string },
): GroqRateLimitMeta {
  const record =
    error && typeof error === "object"
      ? (error as {
          statusCode?: number;
          status?: number;
          headers?: Headers | Record<string, string>;
          responseHeaders?: Headers | Record<string, string>;
        })
      : {};
  const headers = record.headers ?? record.responseHeaders;
  return {
    httpStatus: record.statusCode ?? record.status ?? 429,
    retryAfterMs: extra.retryMs,
    requestLimitRemaining:
      readHeader(headers, "x-ratelimit-remaining-requests") ?? null,
    requestLimitReset: readHeader(headers, "x-ratelimit-reset-requests") ?? null,
    tokenLimitRemaining:
      readHeader(headers, "x-ratelimit-remaining-tokens") ?? null,
    tokenLimitReset: readHeader(headers, "x-ratelimit-reset-tokens") ?? null,
    keyFingerprint: extra.keyFingerprint,
  };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
