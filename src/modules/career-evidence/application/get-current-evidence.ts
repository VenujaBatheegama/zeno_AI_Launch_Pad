import { enrichEvidenceWithReferences } from "../domain/recover-references";
import type { CareerEvidenceSet } from "../domain/evidence";
import type { CareerEvidenceRepository } from "./ports";

/**
 * Load the user's current evidence set. If referees were missed at extraction
 * time, rehydrate them from stored CV text and persist into draft evidence so
 * the review UI shows them.
 */
export async function getCurrentEvidence(
  userId: string,
  repository: CareerEvidenceRepository,
): Promise<CareerEvidenceSet | null> {
  const current = await repository.getCurrent(userId);
  if (!current) return null;

  if ((current.evidence.references ?? []).length > 0) return current;

  const cvText = await repository.getDocumentExtractedText({
    documentId: current.sourceDocumentId,
    userId,
  });
  const enriched = enrichEvidenceWithReferences(current.evidence, cvText);
  if ((enriched.references ?? []).length === 0) return current;

  // Only auto-persist into drafts — verified evidence stays user-controlled.
  if (current.status !== "draft") {
    return { ...current, evidence: enriched };
  }

  return repository.saveDraft({
    id: current.id,
    userId,
    evidence: enriched,
  });
}
