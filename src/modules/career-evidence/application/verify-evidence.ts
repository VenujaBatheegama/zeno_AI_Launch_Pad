import { ZodError } from "zod";

import {
  careerEvidenceSchema,
  reconcileUserEdits,
  type CareerEvidence,
  type CareerEvidenceSet,
  verifiedCareerEvidenceSchema,
} from "../domain/evidence";
import { CareerEvidenceError } from "../domain/errors";
import type { CareerEvidenceRepository, Clock } from "./ports";

export type VerifyEvidenceCommand = {
  id: string;
  userId: string;
  evidence: unknown;
  acknowledged: boolean;
};

export async function verifyEvidence(
  command: VerifyEvidenceCommand,
  dependencies: { repository: CareerEvidenceRepository; now: Clock },
): Promise<CareerEvidenceSet> {
  if (!command.acknowledged) {
    throw new CareerEvidenceError(
      "INVALID_STATE",
      "Confirm that you reviewed the evidence before verifying it.",
    );
  }

  const current = await dependencies.repository.getById(
    command.id,
    command.userId,
  );
  if (!current || current.status !== "draft") {
    throw new CareerEvidenceError(
      "INVALID_STATE",
      "This evidence draft no longer exists or has already been verified.",
    );
  }

  let submitted: CareerEvidence;
  try {
    submitted = verifiedCareerEvidenceSchema.parse(
      normalizeEvidenceForVerification(command.evidence),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues
        .slice(0, 3)
        .map((issue) => issue.message)
        .join(" ");
      throw new CareerEvidenceError(
        "INVALID_STATE",
        detail ||
          "Some profile fields still need completing before verification.",
        { cause: error },
      );
    }
    throw error;
  }

  return dependencies.repository.verify({
    id: command.id,
    userId: command.userId,
    evidence: reconcileUserEdits(current.evidence, submitted),
    verifiedAt: dependencies.now().toISOString(),
  });
}

/** Fill blanks that block verification but are common in real CVs, and drop completely empty draft placeholders. */
function normalizeEvidenceForVerification(evidence: unknown): unknown {
  const parsed = careerEvidenceSchema.parse(evidence);
  return {
    ...parsed,
    work_experience: parsed.work_experience.filter(
      (item) => item.role?.trim() || item.employer?.trim(),
    ),
    projects: parsed.projects.filter(
      (item) => item.name?.trim() || item.role?.trim() || item.bullets.length > 0,
    ),
    skills: parsed.skills.filter((item) => item.name?.trim()),
    certifications: parsed.certifications.filter((item) => item.name?.trim()),
    references: parsed.references.filter((item) => item.name?.trim()),
    education: parsed.education
      .filter((item) => item.institution?.trim() || item.qualification?.trim())
      .map((item) => ({
        ...item,
        institution:
          item.institution.trim() ||
          (item.qualification?.trim() ? "Not specified" : item.institution),
      })),
  };
}
