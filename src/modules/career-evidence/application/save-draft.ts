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
  if (!current) {
    throw new CareerEvidenceError(
      "INVALID_STATE",
      "This evidence set no longer exists.",
    );
  }
  if (current.status !== "draft" && current.status !== "verified") {
    throw new CareerEvidenceError(
      "INVALID_STATE",
      "This evidence set cannot be edited in its current state.",
    );
  }
  const submitted = careerEvidenceSchema.parse(command.evidence);

  // Editing a verified profile reopens it as a draft (cleared on save).
  return repository.saveDraft({
    id: command.id,
    userId: command.userId,
    evidence: reconcileUserEdits(current.evidence, submitted),
  });
}
