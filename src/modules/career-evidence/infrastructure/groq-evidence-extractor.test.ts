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
          "Rate limit reached for model `llama-3.3-70b-versatile` on tokens per day (TPD)",
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
      "llama-3.3-70b-versatile",
      ["openai/gpt-oss-20b"],
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
      ["llama-3.3-70b-versatile"],
    ).extract("Ada Lovelace");
    warn.mockRestore();

    expect(result).toEqual(extracted);
    expect(mocks.generateText).toHaveBeenCalledTimes(3);
  });

  it("rotates to another API key when the first key is rate-limited", async () => {
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
      ["key-one", "key-two"],
      "openai/gpt-oss-20b",
    ).extract("Ada Lovelace");
    warn.mockRestore();

    expect(result).toEqual(extracted);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });
});
