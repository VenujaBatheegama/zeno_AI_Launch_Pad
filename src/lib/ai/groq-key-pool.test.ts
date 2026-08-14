import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GroqKeyPool, parseRetryMs } from "./groq-key-pool";

describe("parseRetryMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("respects Retry-After seconds without sleeping", () => {
    const ms = parseRetryMs({
      message: "Rate limit exceeded",
      headers: { "retry-after": "12" },
    });
    expect(ms).toBe(12_000);
  });

  it("parses Groq try-again message", () => {
    expect(
      parseRetryMs(new Error("Please try again in 1m30.5s")),
    ).toBe((60 + 30.5) * 1000);
  });

  it("parses millisecond TPM waits instead of defaulting to 45 minutes", () => {
    expect(
      parseRetryMs(
        new Error(
          "Rate limit reached for model `openai/gpt-oss-20b` on tokens per minute (TPM): Limit 8000. Please try again in 847.5ms.",
        ),
      ),
    ).toBe(848);
  });

  it("uses a short default for TPM without an explicit wait", () => {
    expect(
      parseRetryMs(new Error("Rate limit reached on tokens per minute (TPM)")),
    ).toBe(2_000);
  });
});

describe("GroqKeyPool rate-limit rotation", () => {
  it("does not cycle keys after a shared quota 429", async () => {
    const pool = new GroqKeyPool(["key-a", "key-b"]);
    const seen: string[] = [];
    await expect(
      pool.withKey(async (apiKey) => {
        seen.push(apiKey);
        throw Object.assign(
          new Error("Rate limit exceeded (429) tokens per day (TPD)"),
          { headers: { "retry-after": "120" } },
        );
      }),
    ).rejects.toMatchObject({ name: "GroqCapacityUnavailableError" });
    expect(seen).toEqual(["key-a"]);
    expect(pool.isSharedCooldownActive()).toBe(true);
  });

  it("waits and retries the same key once on short TPM before rotating", async () => {
    vi.useFakeTimers();
    const pool = new GroqKeyPool(["key-a", "key-b"]);
    const seen: string[] = [];
    let aFails = 1;
    const pending = pool.withKey(async (apiKey) => {
      seen.push(apiKey);
      if (apiKey === "key-a" && aFails > 0) {
        aFails -= 1;
        throw new Error(
          "Rate limit reached on tokens per minute (TPM). Please try again in 500ms.",
        );
      }
      return "ok";
    });
    await vi.advanceTimersByTimeAsync(700);
    await expect(pending).resolves.toBe("ok");
    expect(seen).toEqual(["key-a", "key-a"]);
    vi.useRealTimers();
  });

  it("does not rotate keys when rotateOnRateLimit is false", async () => {
    const pool = new GroqKeyPool(["key-a", "key-b"]);
    const seen: string[] = [];
    await expect(
      pool.withKey(
        async (apiKey) => {
          seen.push(apiKey);
          throw Object.assign(new Error("Rate limit exceeded (429)"), {
            headers: { "retry-after": "5" },
          });
        },
        { rotateOnRateLimit: false },
      ),
    ).rejects.toThrow(/exhausted|rate limit/i);
    expect(seen).toEqual(["key-a"]);
  });

  it("does not rotate keys when rotateOnToolFailure is false", async () => {
    const pool = new GroqKeyPool(["key-a", "key-b"]);
    const seen: string[] = [];
    await expect(
      pool.withKey(
        async (apiKey) => {
          seen.push(apiKey);
          throw new Error(
            "Failed to validate JSON. Please adjust your prompt.",
          );
        },
        { rotateOnToolFailure: false },
      ),
    ).rejects.toThrow(/Failed to validate JSON/i);
    expect(seen).toEqual(["key-a"]);
  });
});
