import type { CareerEvidence, CareerEvidenceSet } from "../domain/evidence";
import type { CareerEvidenceRepository } from "./ports";

/**
 * Ensures a draft evidence set exists for conversation onboarding.
 * Creates a lightweight synthetic source document when the user never uploaded a CV.
 */
export async function ensureConversationDraft(input: {
  userId: string;
  evidence: CareerEvidence;
  createId: () => string;
  repository: CareerEvidenceRepository;
  extractionModel?: string;
}): Promise<CareerEvidenceSet> {
  const current = await input.repository.getCurrent(input.userId);
  if (current && current.status === "draft") {
    return input.repository.saveDraft({
      id: current.id,
      userId: input.userId,
      evidence: input.evidence,
    });
  }

  const documentId = input.createId();
  const evidenceSetId = input.createId();
  await input.repository.createDocument({
    id: documentId,
    userId: input.userId,
    storagePath: `${input.userId}/${documentId}/conversation.txt`,
    originalFilename: "conversation-onboarding.txt",
    mimeType: "text/plain",
    byteSize: 24,
    status: "processing",
    extractedText: null,
    errorMessage: null,
  });
  await input.repository.markDocumentProcessed({
    id: documentId,
    userId: input.userId,
    extractedText: "Built with Zeno conversational onboarding.",
  });

  return input.repository.createDraft({
    id: evidenceSetId,
    userId: input.userId,
    sourceDocumentId: documentId,
    evidence: input.evidence,
    extractionModel: input.extractionModel ?? "conversation",
  });
}
