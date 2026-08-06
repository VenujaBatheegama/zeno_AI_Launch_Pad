import {
  reconcileUserEdits,
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
  const submitted = verifiedCareerEvidenceSchema.parse(command.evidence);

  return dependencies.repository.verify({
    id: command.id,
    userId: command.userId,
    evidence: reconcileUserEdits(current.evidence, submitted),
    verifiedAt: dependencies.now().toISOString(),
  });
}
