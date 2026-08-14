import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: mocks.generateText,
  };
});

import { GroqEvidenceExtractor } from "./groq-evidence-extractor";

const extracted = {
  profile: {
    full_name: "Ada Lovelace",
    email: null,
    phone: null,
    location: null,
    summary: null,
  },
  work_experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  achievements: [],
  references: [],
  warnings: [],
};

describe("Groq evidence extraction through the AI SDK", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
  });

  it("retries once when structured model output is malformed", async () => {
    mocks.generateText
      .mockResolvedValueOnce({ toolCalls: [] })
      .mockResolvedValueOnce({
        toolCalls: [
          {
            toolName: "recordCareerEvidence",
            input: extracted,
          },
        ],
      });

    const result = await new GroqEvidenceExtractor(
      "test-api-key",
      "test-model",
    ).extract("Ada Lovelace");

    expect(result).toEqual(extracted);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.generateText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        maxOutputTokens: 4096,
        toolChoice: {
          type: "tool",
          toolName: "recordCareerEvidence",
        },
      }),
    );
  });

  it("does not retry a provider/network failure", async () => {
    mocks.generateText.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(
      new GroqEvidenceExtractor("test-api-key", "test-model").extract(
        "Ada Lovelace",
      ),
    ).rejects.toMatchObject({ code: "AI_EXTRACTION_FAILED" });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("falls back to another model when the primary is rate-limited", async () => {
    mocks.generateText
      .mockRejectedValueOnce(
        new Error(
          "Rate limit reached for model `openai/gpt-oss-20b` on tokens per day (TPD)",
        ),
      )
      .mockResolvedValueOnce({
        toolCalls: [
          {
            toolName: "recordCareerEvidence",
            input: extracted,
          },
        ],
      });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await new GroqEvidenceExtractor(
      "test-api-key",
      "openai/gpt-oss-20b",
      ["openai/gpt-oss-120b"],
    ).extract("Ada Lovelace");
    warn.mockRestore();

    expect(result).toEqual(extracted);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it("falls back to another model after repeated tool-call failures", async () => {
    mocks.generateText
      .mockRejectedValueOnce(
        new Error("Tool choice is required, but model did not call a tool"),
      )
      .mockRejectedValueOnce(
        new Error("Tool choice is required, but model did not call a tool"),
      )
      .mockResolvedValueOnce({
        toolCalls: [
          {
            toolName: "recordCareerEvidence",
            input: extracted,
          },
        ],
      });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await new GroqEvidenceExtractor(
      "test-api-key",
      "openai/gpt-oss-20b",
      ["openai/gpt-oss-120b"],
    ).extract("Ada Lovelace");
    warn.mockRestore();

    expect(result).toEqual(extracted);
    expect(mocks.generateText).toHaveBeenCalledTimes(3);
  });

  it("recovers truncated tool output from failed_generation", async () => {
    const partial = {
      profile: {
        full_name: "Ada Lovelace",
        email: null,
        phone: null,
        location: null,
        summary: null,
      },
      work_experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      achievements: [],
      references: [],
      warnings: [],
    };
    mocks.generateText.mockRejectedValueOnce({
      message: "Failed to parse tool call arguments asJSON",
      responseBody: JSON.stringify({
        error: {
          code: "tool_use_failed",
          failed_generation: JSON.stringify({
            name: "recordCareerEvidence",
            arguments: partial,
          }),
        },
      }),
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await new GroqEvidenceExtractor(
      "test-api-key",
      "openai/gpt-oss-20b",
    ).extract("Ada Lovelace");
    warn.mockRestore();

    expect(result.profile.full_name).toBe("Ada Lovelace");
    expect(result.warnings.some((item) => /truncated/i.test(item))).toBe(true);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("does not rotate keys after a shared quota 429", async () => {
    mocks.generateText.mockRejectedValueOnce(
      new Error(
        "Rate limit reached for model `openai/gpt-oss-20b` on tokens per day (TPD)",
      ),
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      new GroqEvidenceExtractor(
        ["key-one", "key-two"],
        "openai/gpt-oss-20b",
      ).extract("Ada Lovelace"),
    ).rejects.toMatchObject({ code: "AI_EXTRACTION_FAILED" });
    warn.mockRestore();
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });
});
