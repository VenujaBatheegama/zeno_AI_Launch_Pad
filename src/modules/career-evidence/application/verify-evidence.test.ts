import { describe, expect, it, vi } from "vitest";

import type { CareerEvidence } from "../domain/evidence";
import { verifyEvidence } from "./verify-evidence";

const evidence: CareerEvidence = {
  schema_version: 1,
  profile: {
    full_name: "Ada Lovelace",
    email: null,
    phone: null,
    location: "London",
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

describe("verify career evidence", () => {
  it("requires explicit user acknowledgement", async () => {
    const verify = vi.fn();

    await expect(
      verifyEvidence(
        {
          id: "00000000-0000-4000-8000-000000000002",
          userId: "00000000-0000-4000-8000-000000000001",
          evidence,
          acknowledged: false,
        },
        {
          repository: { verify } as never,
          now: () => new Date("2026-08-06T10:00:00.000Z"),
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    expect(verify).not.toHaveBeenCalled();
  });

  it("validates and persists the final edited payload in the verify transition", async () => {
    const verify = vi.fn().mockImplementation(async (input) => ({
      id: input.id,
      userId: input.userId,
      sourceDocumentId: "00000000-0000-4000-8000-000000000003",
      status: "verified",
      evidence: input.evidence,
      extractionModel: "test-model",
      createdAt: "2026-08-06T09:00:00.000Z",
      updatedAt: input.verifiedAt,
      verifiedAt: input.verifiedAt,
    }));

    const result = await verifyEvidence(
      {
        id: "00000000-0000-4000-8000-000000000002",
        userId: "00000000-0000-4000-8000-000000000001",
        evidence: {
          ...evidence,
          profile: { ...evidence.profile, location: "Edinburgh" },
        },
        acknowledged: true,
      },
      {
        repository: {
          verify,
          getById: vi.fn().mockResolvedValue({
            id: "00000000-0000-4000-8000-000000000002",
            userId: "00000000-0000-4000-8000-000000000001",
            sourceDocumentId: "00000000-0000-4000-8000-000000000003",
            status: "draft",
            evidence,
            extractionModel: "test-model",
            createdAt: "2026-08-06T09:00:00.000Z",
            updatedAt: "2026-08-06T09:00:00.000Z",
            verifiedAt: null,
          }),
        } as never,
        now: () => new Date("2026-08-06T10:00:00.000Z"),
      },
    );

    expect(result.status).toBe("verified");
    expect(result.evidence.profile.location).toBe("Edinburgh");
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        verifiedAt: "2026-08-06T10:00:00.000Z",
      }),
    );
  });
});
