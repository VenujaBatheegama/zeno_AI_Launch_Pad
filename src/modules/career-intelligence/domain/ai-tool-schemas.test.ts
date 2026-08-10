import { describe, expect, it } from "vitest";

import { normalizeExtractedJobAnalysis } from "./ai-tool-schemas";

describe("normalizeExtractedJobAnalysis", () => {
  it("coerces near-miss categories and bands instead of failing", () => {
    const normalized = normalizeExtractedJobAnalysis({
      opportunity_band: "Entry Career",
      opportunity_confidence: "HIGH",
      opportunity_reasons: ["Mentions junior scope"],
      requirements: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          statement: "Node.js",
          category: "tech",
          importance: "must",
          explicit: true,
          confidence: "medium",
          source_quote: "Experience with Node.js",
          quantitative_threshold: null,
        },
      ],
      warnings: [],
    });

    expect(normalized.opportunity_band).toBe("early_career");
    expect(normalized.opportunity_confidence).toBe("high");
    expect(normalized.requirements[0]?.category).toBe("technology");
    expect(normalized.requirements[0]?.importance).toBe("required");
  });

  it("falls back safely for unknown labels", () => {
    const normalized = normalizeExtractedJobAnalysis({
      opportunity_band: "wizard_level",
      opportunity_confidence: "HIGH",
      opportunity_reasons: ["Odd label"],
      requirements: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          statement: "Magic",
          category: "alchemy",
          importance: "maybe",
          explicit: true,
          confidence: "medium",
          source_quote: "Magic preferred",
          quantitative_threshold: null,
        },
      ],
      warnings: [],
    });

    expect(normalized.opportunity_band).toBe("unknown");
    expect(normalized.requirements[0]?.category).toBe("other");
    expect(normalized.requirements[0]?.importance).toBe("unclear");
  });
});
