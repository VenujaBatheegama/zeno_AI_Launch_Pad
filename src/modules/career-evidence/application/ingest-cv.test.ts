import { describe, expect, it, vi } from "vitest";

import type { CareerEvidenceSet } from "../domain/evidence";
import { CareerEvidenceError } from "../domain/errors";
import { ingestCv } from "./ingest-cv";
import type {
  CareerEvidenceRepository,
  CvDocument,
} from "./ports";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000002";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000003";
const ITEM_ID = "00000000-0000-4000-8000-000000000004";

describe("ingest CV", () => {
  it("turns a valid CV into an unverified draft through injected interfaces", async () => {
    const repository = new InMemoryRepository();
    const save = vi.fn().mockResolvedValue(undefined);
    const ids = [DOCUMENT_ID, EVIDENCE_ID, ITEM_ID];

    const result = await ingestCv(
      {
        userId: USER_ID,
        fileName: "cv.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
      },
      {
        repository,
        storage: { save },
        textExtractor: {
          extract: vi
            .fn()
            .mockResolvedValue("Ada Lovelace\nProgrammed the Analytical Engine"),
        },
        evidenceExtractor: {
          extract: vi.fn().mockResolvedValue({
            profile: {
              full_name: "Ada Lovelace",
              email: null,
              phone: null,
              location: null,
              summary: null,
            },
            work_experience: [],
            education: [],
            skills: [
              {
                  name: "Analytical Engine",
                source_quote: "Programmed the Analytical Engine",
              },
            ],
            projects: [],
            certifications: [],
            achievements: [],
            references: [],
            warnings: [],
          }),
        },
        extractionModel: "test-model",
        createId: () => ids.shift()!,
      },
    );

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `${USER_ID}/${DOCUMENT_ID}/original.pdf`,
      }),
    );
    expect(repository.document?.status).toBe("processed");
    expect(result.status).toBe("draft");
    expect(result.evidence.skills[0]).toMatchObject({
      id: ITEM_ID,
      origin: "extracted",
    });
  });

  it("does not borrow a date from another education entry", async () => {
    const repository = new InMemoryRepository();
    const ids = [DOCUMENT_ID, EVIDENCE_ID, ITEM_ID];
    const degreeText =
      "BSc (Hons) Computer Science, Informatics Institute of Technology, Jan 2024 – present";

    const result = await ingestCv(
      {
        userId: USER_ID,
        fileName: "cv.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
      },
      {
        repository,
        storage: { save: vi.fn() },
        textExtractor: {
          extract: vi
            .fn()
            .mockResolvedValue(`${degreeText}\nGCE A/L, Jun 2020 – Jan 2023`),
        },
        evidenceExtractor: {
          extract: vi.fn().mockResolvedValue({
            profile: {
              full_name: null,
              email: null,
              phone: null,
              location: null,
              summary: null,
            },
            work_experience: [],
            education: [
              {
                institution: "Informatics Institute of Technology",
                qualification: "BSc (Hons) Computer Science",
                field_of_study: "Computer Science",
                start_date: "2020-06",
                end_date: null,
                source_quote: degreeText,
              },
            ],
            skills: [],
            projects: [],
            certifications: [],
            achievements: [],
            references: [],
            warnings: [],
          }),
        },
        extractionModel: "test-model",
        createId: () => ids.shift()!,
      },
    );

    expect(result.evidence.education[0].start_date).toBeNull();
    expect(result.evidence.warnings).toContainEqual(
      expect.stringContaining(
        "left start date blank because “2020-06” does not appear in this entry's supporting CV text",
      ),
    );
  });

  it("rejects a mismatched file before creating persistent state", async () => {
    const repository = new InMemoryRepository();

    await expect(
      ingestCv(
        {
          userId: USER_ID,
          fileName: "cv.pdf",
          mimeType: "application/pdf",
          bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        },
        {
          repository,
          storage: { save: vi.fn() },
          textExtractor: { extract: vi.fn() },
          evidenceExtractor: { extract: vi.fn() },
          extractionModel: "test-model",
          createId: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_FILE" });

    expect(repository.document).toBeNull();
  });

  it("records a recoverable failure when no usable text is extracted", async () => {
    const repository = new InMemoryRepository();
    const ids = [DOCUMENT_ID, EVIDENCE_ID];

    await expect(
      ingestCv(
        {
          userId: USER_ID,
          fileName: "cv.pdf",
          mimeType: "application/pdf",
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        },
        {
          repository,
          storage: { save: vi.fn() },
          textExtractor: { extract: vi.fn().mockResolvedValue("   ") },
          evidenceExtractor: { extract: vi.fn() },
          extractionModel: "test-model",
          createId: () => ids.shift()!,
        },
      ),
    ).rejects.toBeInstanceOf(CareerEvidenceError);

    expect(repository.document).toMatchObject({
      status: "failed",
      errorMessage: "No usable text was found. Upload a text-based PDF or DOCX.",
    });
  });

  it("omits model evidence whose source quote is absent from the CV", async () => {
    const repository = new InMemoryRepository();
    const ids = [DOCUMENT_ID, EVIDENCE_ID];

    const result = await ingestCv(
      {
        userId: USER_ID,
        fileName: "cv.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
      },
      {
        repository,
        storage: { save: vi.fn() },
        textExtractor: {
          extract: vi.fn().mockResolvedValue("Ada Lovelace\nMathematician"),
        },
        evidenceExtractor: {
          extract: vi.fn().mockResolvedValue({
            profile: {
              full_name: "Ada Lovelace",
              email: null,
              phone: null,
              location: null,
              summary: null,
            },
            work_experience: [],
            education: [],
            skills: [
              {
                name: "Kubernetes",
                source_quote: "Expert Kubernetes administrator",
              },
            ],
            projects: [],
            certifications: [],
            achievements: [],
            references: [],
            warnings: [],
          }),
        },
        extractionModel: "test-model",
        createId: () => ids.shift()!,
      },
    );

    expect(result.status).toBe("draft");
    expect(result.evidence.skills).toEqual([]);
    expect(result.evidence.warnings).toEqual(
      expect.arrayContaining([
      expect.stringContaining(
          "omitted the entry because none of its fields could be matched",
      ),
      ]),
    );
  });
});

class InMemoryRepository implements CareerEvidenceRepository {
  document: CvDocument | null = null;
  evidence: CareerEvidenceSet | null = null;

  async createDocument(document: CvDocument) {
    this.document = document;
  }

  async markDocumentProcessed(input: {
    id: string;
    userId: string;
    extractedText: string;
  }) {
    if (this.document) {
      this.document = {
        ...this.document,
        status: "processed",
        extractedText: input.extractedText,
      };
    }
  }

  async markDocumentFailed(input: {
    id: string;
    userId: string;
    errorMessage: string;
  }) {
    if (this.document) {
      this.document = {
        ...this.document,
        status: "failed",
        errorMessage: input.errorMessage,
      };
    }
  }

  async createDraft(
    input: Parameters<CareerEvidenceRepository["createDraft"]>[0],
  ) {
    this.evidence = {
      id: input.id,
      userId: input.userId,
      sourceDocumentId: input.sourceDocumentId,
      status: "draft",
      evidence: input.evidence,
      extractionModel: input.extractionModel,
      createdAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
      verifiedAt: null,
    };
    return this.evidence;
  }

  async saveDraft(): Promise<CareerEvidenceSet> {
    throw new Error("Not needed in this test.");
  }

  async verify(): Promise<CareerEvidenceSet> {
    throw new Error("Not needed in this test.");
  }

  async getById() {
    return this.evidence;
  }

  async getCurrent() {
    return this.evidence;
  }

  async getDocumentExtractedText() {
    return this.document?.extractedText ?? null;
  }
}
