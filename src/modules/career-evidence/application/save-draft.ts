import {
  careerEvidenceSchema,
  reconcileUserEdits,
  type CareerEvidenceSet,
} from "../domain/evidence";
import { CareerEvidenceError } from "../domain/errors";
import type { CareerEvidenceRepository } from "./ports";

export type SaveDraftCommand = {
  id: string;
  userId: string;
  evidence: unknown;
};

export async function saveDraft(
  command: SaveDraftCommand,
  repository: CareerEvidenceRepository,
): Promise<CareerEvidenceSet> {
  const current = await repository.getById(command.id, command.userId);
  if (!current || current.status !== "draft") {
    throw new CareerEvidenceError(
      "INVALID_STATE",
      "This evidence draft no longer exists or has already been verified.",
    );
  }
  const submitted = careerEvidenceSchema.parse(command.evidence);

  return repository.saveDraft({
    id: command.id,
    userId: command.userId,
    evidence: reconcileUserEdits(current.evidence, submitted),
  });
}
