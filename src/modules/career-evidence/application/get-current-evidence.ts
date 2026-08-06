import type { CareerEvidenceSet } from "../domain/evidence";
import type { CareerEvidenceRepository } from "./ports";

export function getCurrentEvidence(
  userId: string,
  repository: CareerEvidenceRepository,
): Promise<CareerEvidenceSet | null> {
  return repository.getCurrent(userId);
}
