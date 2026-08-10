import { describe, expect, it } from "vitest";

import type { CareerEvidence, CareerEvidenceSet } from "../domain/evidence";
import { getCurrentEvidence } from "./get-current-evidence";
import type { CareerEvidenceRepository } from "./ports";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const DOC_ID = "00000000-0000-4000-8000-000000000002";
const SET_ID = "00000000-0000-4000-8000-000000000003";

const baseEvidence = {
  schema_version: 1 as const,
  profile: {
    full_name: "Candidate",
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
} satisfies CareerEvidence;

describe("getCurrentEvidence", () => {
  it("recovers and persists references into a draft from CV text", async () => {
    const set: CareerEvidenceSet = {
      id: SET_ID,
      userId: USER_ID,
      sourceDocumentId: DOC_ID,
      status: "draft",
      evidence: baseEvidence,
      extractionModel: "test",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      verifiedAt: null,
    };

    let saved: CareerEvidence | null = null;
    const repository: CareerEvidenceRepository = {
      createDocument: async () => undefined,
      markDocumentProcessed: async () => undefined,
      markDocumentFailed: async () => undefined,
      createDraft: async () => set,
      saveDraft: async (input) => {
        saved = input.evidence;
        return { ...set, evidence: input.evidence, updatedAt: "2026-08-09T01:00:00.000Z" };
      },
      verify: async () => set,
      getById: async () => set,
      getCurrent: async () => set,
      getDocumentExtractedText: async () =>
        [
          "REFERENCES",
          "Torin Wirasingha , Lecturer / Level Coordinator , IIT",
          "torin.w@iit.ac.lk ,+94 76 8209747",
          "CERTIFICATES",
        ].join("\n"),
    };

    const result = await getCurrentEvidence(USER_ID, repository);
    expect(result?.evidence.references).toHaveLength(1);
    expect(result?.evidence.references[0]?.name).toMatch(/Torin/i);
    expect(saved).not.toBeNull();
    expect(saved!.references).toHaveLength(1);
  });
});
