import { describe, expect, it } from "vitest";

import { createTextPdf } from "../../../test/pdf-fixture";

import { PdfDocxTextExtractor } from "../infrastructure/pdf-docx-text-extractor";
import type { CareerEvidenceSet } from "../domain/evidence";
import { getCurrentEvidence } from "./get-current-evidence";
import { ingestCv } from "./ingest-cv";
import type {
  CareerEvidenceRepository,
  CvDocument,
} from "./ports";
import { saveDraft } from "./save-draft";
import { verifyEvidence } from "./verify-evidence";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("Slice 0", () => {
  it("extracts a real-format CV, preserves edits, verifies, and reloads it", async () => {
    const repository = new SliceRepository();
    const ids = [
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
    ];
    const bytes = createTextPdf(
      "Ada Lovelace - Mathematician - London - Analytical Engine",
    );

    const draft = await ingestCv(
      {
        userId: USER_ID,
        fileName: "ada-cv.pdf",
        mimeType: "application/pdf",
        bytes,
      },
      {
        repository,
        storage: { save: async () => undefined },
        textExtractor: new PdfDocxTextExtractor(),
        evidenceExtractor: {
          extract: async (text) => {
            expect(text).toContain("Analytical Engine");
            return {
              profile: {
                full_name: "Ada Lovelace",
                email: null,
                phone: null,
                location: "London",
                summary: null,
              },
              work_experience: [],
              education: [],
              skills: [
                {
                  name: "Analytical Engine",
                  source_quote: "Analytical Engine",
                },
              ],
              projects: [],
              certifications: [],
              achievements: [],
              references: [],
              warnings: [],
            };
          },
        },
        extractionModel: "test-model",
        createId: () => ids.shift()!,
      },
    );

    const edited = await saveDraft(
      {
        id: draft.id,
        userId: USER_ID,
        evidence: {
          ...draft.evidence,
          profile: { ...draft.evidence.profile, location: "Edinburgh" },
        },
      },
      repository,
    );
    const verified = await verifyEvidence(
      {
        id: edited.id,
        userId: USER_ID,
        evidence: edited.evidence,
        acknowledged: true,
      },
      {
        repository,
        now: () => new Date("2026-08-06T10:00:00.000Z"),
      },
    );
    const reloaded = await getCurrentEvidence(USER_ID, repository);

    expect(verified.status).toBe("verified");
    expect(reloaded?.evidence.profile.location).toBe("Edinburgh");
    expect(reloaded?.verifiedAt).toBe("2026-08-06T10:00:00.000Z");
  });
});

class SliceRepository implements CareerEvidenceRepository {
  private document: CvDocument | null = null;
  private current: CareerEvidenceSet | null = null;

  async createDocument(document: CvDocument) {
    this.document = document;
  }

  async markDocumentProcessed(input: {
    id: string;
    userId: string;
    extractedText: string;
  }) {
    this.document = {
      ...this.document!,
      status: "processed",
      extractedText: input.extractedText,
    };
  }

  async markDocumentFailed(input: {
    id: string;
    userId: string;
    errorMessage: string;
  }) {
    this.document = {
      ...this.document!,
      status: "failed",
      errorMessage: input.errorMessage,
    };
  }

  async createDraft(
    input: Parameters<CareerEvidenceRepository["createDraft"]>[0],
  ) {
    this.current = {
      id: input.id,
      userId: input.userId,
      sourceDocumentId: input.sourceDocumentId,
      status: "draft",
      evidence: input.evidence,
      extractionModel: input.extractionModel,
      createdAt: "2026-08-06T09:00:00.000Z",
      updatedAt: "2026-08-06T09:00:00.000Z",
      verifiedAt: null,
    };
    return this.current;
  }

  async saveDraft(input: Parameters<CareerEvidenceRepository["saveDraft"]>[0]) {
    this.current = { ...this.current!, evidence: input.evidence };
    return this.current;
  }

  async verify(input: Parameters<CareerEvidenceRepository["verify"]>[0]) {
    this.current = {
      ...this.current!,
      evidence: input.evidence,
      status: "verified",
      updatedAt: input.verifiedAt,
      verifiedAt: input.verifiedAt,
    };
    return this.current;
  }

  async getById(id: string, userId: string) {
    return this.current?.id === id && this.current.userId === userId
      ? this.current
      : null;
  }

  async getCurrent(userId: string) {
    return this.current?.userId === userId ? this.current : null;
  }

  async getDocumentExtractedText() {
    return null;
  }
}
