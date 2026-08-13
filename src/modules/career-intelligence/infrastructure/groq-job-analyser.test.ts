import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: mocks.generateText,
  };
});

import { Output } from "ai";

import { GroqJobRequirementExtractor } from "./groq-job-analyser";

describe("GroqJobRequirementExtractor strict output", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
  });

  it("uses Output.object and never registers tools", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        opportunity_band: "early_career",
        opportunity_confidence: "high",
        opportunity_reasons: ["Junior scope"],
        requirements: [
          {
            statement: "Docker",
            category: "technology",
            importance: "required",
            explicit: true,
            confidence: "high",
            source_quote: "Docker experience",
            quantitative_threshold: null,
          },
        ],
        warnings: [],
      },
    });

    const extractor = new GroqJobRequirementExtractor(
      ["key-a"],
      "openai/gpt-oss-20b",
      ["openai/gpt-oss-120b"],
      { maxAttempts: 2 },
    );

    const result = await extractor.extract({
      title: "Software Engineer",
      description: "Docker experience required for early-career engineers.",
      requirementIds: ["00000000-0000-4000-8000-000000000001"],
    });

    expect(result.requirements[0]?.id).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const args = mocks.generateText.mock.calls[0]?.[0] as {
      tools?: unknown;
      output?: unknown;
      temperature?: number;
      maxRetries?: number;
      maxOutputTokens?: number;
    };
    expect(args.tools).toBeUndefined();
    expect(args.temperature).toBe(0);
    expect(args.maxRetries).toBe(0);
    expect(args.maxOutputTokens).toBe(2048);
    expect(args.output).toBeTruthy();
    expect(Output.object).toBeTypeOf("function");
  });

  it("opens cooldown after 429 so later jobs do not hit the same route", async () => {
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("Rate limit exceeded 429"), {
        headers: { "retry-after": "30" },
      }),
    );

    const extractor = new GroqJobRequirementExtractor(
      ["key-a", "key-b"],
      "openai/gpt-oss-20b",
      ["openai/gpt-oss-120b"],
      { maxAttempts: 2 },
    );

    await expect(
      extractor.extract({
        title: "Software Engineer",
        description: "TypeScript required for this role.",
        requirementIds: ["00000000-0000-4000-8000-000000000001"],
      }),
    ).rejects.toThrow(/rate-limited/i);

    // Second call should fail fast from extractor cooldown without another generateText.
    const callsAfterFirst = mocks.generateText.mock.calls.length;
    await expect(
      extractor.extract({
        title: "Software Engineer",
        description: "Another unique description about React.",
        requirementIds: ["00000000-0000-4000-8000-000000000002"],
      }),
    ).rejects.toThrow(/rate-limited/i);
    expect(mocks.generateText.mock.calls.length).toBe(callsAfterFirst);
  });

  it("repairs a schema failure once on the same model and does not fall back", async () => {
    mocks.generateText
      .mockRejectedValueOnce(
        new Error("Generated JSON does not match the expected schema"),
      )
      .mockResolvedValueOnce({
        output: {
          opportunity_band: "early_career",
          opportunity_confidence: "medium",
          opportunity_reasons: ["Repair ok"],
          requirements: [
            {
              statement: "TypeScript",
              category: "technology",
              importance: "required",
              explicit: true,
              confidence: "high",
              source_quote: "TypeScript",
              quantitative_threshold: null,
            },
          ],
          warnings: [],
        },
      });

    const extractor = new GroqJobRequirementExtractor(
      ["key-a"],
      "openai/gpt-oss-20b",
      ["openai/gpt-oss-120b"],
      { maxAttempts: 2 },
    );

    await extractor.extract({
      title: "Software Engineer",
      description: "TypeScript required.",
      requirementIds: ["00000000-0000-4000-8000-000000000001"],
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    const repairPrompt = String(
      (mocks.generateText.mock.calls[1]?.[0] as { prompt?: string }).prompt ?? "",
    );
    expect(repairPrompt).toMatch(/failed validation/i);
    expect(extractor.lastStats).toMatchObject({
      attempts: 2,
      usedFallback: false,
      model: "openai/gpt-oss-20b",
    });
  });

  it("marks malformed requirements as a schema failure after one repair", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        opportunity_band: "early_career",
        opportunity_confidence: "high",
        opportunity_reasons: [],
        requirements: "not-an-array",
        warnings: [],
      },
    });
    const extractor = new GroqJobRequirementExtractor(
      ["key-a"],
      "openai/gpt-oss-20b",
      ["openai/gpt-oss-120b"],
      { maxAttempts: 2 },
    );
    await expect(
      extractor.extract({
        title: "Software Engineer",
        description: "TypeScript required.",
        requirementIds: ["00000000-0000-4000-8000-000000000001"],
      }),
    ).rejects.toThrow(/invalid requirements payload|could not read requirements/i);
    expect(mocks.generateText.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("does not fall back to a larger model solely because quota is exhausted", async () => {
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("Rate limit exceeded 429 tokens per day (TPD)"), {
        headers: { "retry-after": "30" },
      }),
    );
    const extractor = new GroqJobRequirementExtractor(
      ["key-a", "key-b"],
      "openai/gpt-oss-20b",
      ["openai/gpt-oss-120b"],
      { maxAttempts: 2 },
    );
    await expect(
      extractor.extract({
        title: "Software Engineer",
        description: "TypeScript required for this role.",
        requirementIds: ["00000000-0000-4000-8000-000000000001"],
      }),
    ).rejects.toThrow(/rate-limited/i);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });
});
