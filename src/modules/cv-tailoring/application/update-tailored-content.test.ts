import { describe, expect, it } from "vitest";

import type { TailoredResume } from "../domain/tailored-resume";
import { updateTailoredCvContent } from "./update-tailored-content";
import type { CvTailoringVariant } from "./ports";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const USER = "00000000-0000-4000-8000-000000000001";
const VARIANT_ID = "00000000-0000-4000-8000-000000000010";

function sampleResume(overrides?: Partial<TailoredResume>): TailoredResume {
  return {
    targetTitle: "Software Engineer",
    contact: {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: null,
      location: null,
    },
    summary: {
      text: "Software engineer with verified internship experience building internal tools.",
      factIds: ["fact-1"],
      source: "ai_generated",
    },
    skills: [{ category: "Languages", items: ["TypeScript"] }],
    experience: [
      {
        id: "work-1",
        employer: "Acme",
        title: "Intern",
        startDate: "2025-01",
        endDate: null,
        isCurrent: true,
        bullets: [
          {
            text: "Built reporting features with Entity Framework and SQL Server.",
            factIds: ["work-1:bullet:0"],
            source: "ai_generated",
          },
        ],
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "Demo",
        technologies: ["React"],
        paragraphs: [
          {
            text: "Implemented a React dashboard with filtering controls and authenticated API access for operators.",
            factIds: ["proj-1:bullet:0"],
            source: "ai_generated",
          },
        ],
      },
    ],
    education: [],
    certifications: [],
    achievements: [],
    references: [],
    changeNotes: [],
    assessment: {
      factuallyValid: true,
      jobAlignment: "high",
      supportedKeywords: [],
      transferableKeywords: [],
      missingKeywords: [],
      generationStatus: "success",
    },
    ...overrides,
  };
}

function variant(status: CvTailoringVariant["status"]): CvTailoringVariant {
  return {
    id: VARIANT_ID,
    userId: USER,
    listingId: "00000000-0000-4000-8000-000000000020",
    jobId: "00000000-0000-4000-8000-000000000021",
    jobAnalysisId: "00000000-0000-4000-8000-000000000022",
    evidenceSetId: "00000000-0000-4000-8000-000000000023",
    mode: "one_page",
    status,
    recommendedMode: "one_page",
    recommendationReason: "test",
    tailoringContext: null,
    idempotencyKey: "key",
    evidenceFingerprint: "e",
    analysisFingerprint: "a",
    contentPlanFingerprint: "c",
    policyVersion: "cv-tailoring-v9",
    promptVersion: "cv-tailoring-prompt-v9",
    modelId: "deterministic",
    inputTokens: null,
    outputTokens: null,
    repairCount: 0,
    generationDurationMs: 1,
    evidenceSnapshot: { evidenceSetId: "x", items: [], facts: [] } as never,
    contentPlan: { targetTitle: "Software Engineer" } as never,
    keywordAudit: [],
    tailoredContent: sampleResume(),
    assessment: null,
    validationIssues: [],
    warnings: [],
    artifactStoragePath: status === "ready" ? "path/cv.pdf" : null,
    artifactChecksum: status === "ready" ? "abc" : null,
    artifactPageCount: status === "ready" ? 1 : null,
    errorMessage: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe("updateTailoredCvContent", () => {
  it("saves edits and marks a ready PDF stale without deleting the artifact", async () => {
    const existing = variant("ready");
    const savedBox: { current: CvTailoringVariant | null } = { current: null };
    const result = await updateTailoredCvContent(
      {
        userId: USER,
        variantId: VARIANT_ID,
        expectedUpdatedAt: existing.updatedAt,
        tailoredContent: sampleResume({
          summary: {
            text: "Edited summary for a software engineering internship application.",
            factIds: ["fact-1"],
            source: "ai_generated",
          },
        }),
      },
      {
        now: () => new Date("2026-08-11T12:05:00.000Z"),
        repository: {
          async getVariant() {
            return existing;
          },
          async saveVariant(next) {
            savedBox.current = next;
            return next;
          },
          async getVariantByIdempotencyKey() {
            return null;
          },
          async listVariantsForListing() {
            return [];
          },
          async listVariantsForUser() {
            return [];
          },
        },
      },
    );

    expect(result.status).toBe("ready_to_render");
    expect(result.artifactStoragePath).toBe("path/cv.pdf");
    expect(result.tailoredContent?.summary.source).toBe("user_edited");
    expect(result.warnings.some((item) => /regenerate the PDF/i.test(item))).toBe(
      true,
    );
    expect(savedBox.current?.status).toBe("ready_to_render");
  });

  it("rejects stale expectedUpdatedAt", async () => {
    await expect(
      updateTailoredCvContent(
        {
          userId: USER,
          variantId: VARIANT_ID,
          expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
          tailoredContent: sampleResume(),
        },
        {
          now: () => NOW,
          repository: {
            async getVariant() {
              return variant("ready_to_render");
            },
            async saveVariant(next) {
              return next;
            },
            async getVariantByIdempotencyKey() {
              return null;
            },
            async listVariantsForListing() {
              return [];
            },
            async listVariantsForUser() {
              return [];
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "STALE_INPUT" });
  });

  it("preserves fact IDs on unchanged fragments and marks only edited text", async () => {
    const existing = variant("ready_to_render");
    const result = await updateTailoredCvContent(
      {
        userId: USER,
        variantId: VARIANT_ID,
        expectedUpdatedAt: existing.updatedAt,
        tailoredContent: sampleResume({
          summary: {
            text: existing.tailoredContent!.summary.text,
            factIds: ["fact-1"],
            source: "ai_generated",
          },
          experience: [
            {
              ...existing.tailoredContent!.experience[0]!,
              bullets: [
                {
                  text: "Rewrote this bullet with internship reporting detail for the target role.",
                  factIds: ["work-1:bullet:0"],
                  source: "ai_generated",
                },
              ],
            },
          ],
        }),
      },
      {
        now: () => new Date("2026-08-11T12:05:00.000Z"),
        repository: {
          async getVariant() {
            return existing;
          },
          async saveVariant(next) {
            return next;
          },
          async getVariantByIdempotencyKey() {
            return null;
          },
          async listVariantsForListing() {
            return [];
          },
          async listVariantsForUser() {
            return [];
          },
        },
      },
    );

    expect(result.tailoredContent?.summary.source).toBe("ai_generated");
    expect(result.tailoredContent?.summary.factIds).toEqual(["fact-1"]);
    expect(result.tailoredContent?.experience[0]?.bullets[0]?.source).toBe(
      "user_edited",
    );
    expect(result.tailoredContent?.experience[0]?.bullets[0]?.factIds).toEqual([
      "work-1:bullet:0",
    ]);
  });
});
