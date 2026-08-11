import { describe, expect, it } from "vitest";

import {
  combineFinalRankingScore,
  rankMatchesPersonalized,
} from "./ranking";

describe("final personalized match ranking", () => {
  it("reuses evidence-fit and keeps search relevance as a gate", () => {
    const ranked = rankMatchesPersonalized(
      [
        {
          listingId: "a",
          jobId: "ja",
          eligible: true,
          evidenceFitScore: 95,
          careerLevel: "aligned",
          confidence: "high",
          publishedAt: "2026-08-01T00:00:00.000Z",
          searchRelevance: 10,
          interestAlignment: 24,
        },
        {
          listingId: "b",
          jobId: "jb",
          eligible: true,
          evidenceFitScore: 70,
          careerLevel: "aligned",
          confidence: "high",
          publishedAt: "2026-08-01T00:00:00.000Z",
          searchRelevance: 90,
          interestAlignment: 12,
        },
      ],
      { hasExplicitInterests: true },
    );
    expect(ranked[0]?.listingId).toBe("b");
  });

  it("does not invent interest scores when interests are empty", () => {
    const combined = combineFinalRankingScore({
      searchRelevance: 90,
      interestAlignment: 0,
      evidenceFit: 80,
      hasExplicitInterests: false,
    });
    expect(combined.interestAlignment).toBe(0);
    expect(combined.finalScore).toBeGreaterThan(0);
  });
});
