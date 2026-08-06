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
});
