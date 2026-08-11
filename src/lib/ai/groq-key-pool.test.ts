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
});

describe("GroqKeyPool rate-limit rotation", () => {
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
    ).rejects.toThrow(/rate limit/i);
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
