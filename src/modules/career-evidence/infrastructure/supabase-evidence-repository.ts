import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CareerEvidenceRepository,
  CvDocument,
} from "../application/ports";
import {
  careerEvidenceSchema,
  type CareerEvidence,
  type CareerEvidenceSet,
} from "../domain/evidence";
import { CareerEvidenceError } from "../domain/errors";

type EvidenceRow = {
  id: string;
  user_id: string;
  source_document_id: string;
  status: "draft" | "verified";
  evidence: unknown;
  extraction_model: string;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
};

export class SupabaseEvidenceRepository implements CareerEvidenceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createDocument(document: CvDocument): Promise<void> {
    const { error } = await this.client.from("cv_documents").insert({
      id: document.id,
      user_id: document.userId,
      storage_path: document.storagePath,
      original_filename: document.originalFilename,
      mime_type: document.mimeType,
      byte_size: document.byteSize,
      status: document.status,
      extracted_text: document.extractedText,
      error_message: document.errorMessage,
    });

    if (error) {
      throw persistenceError("The CV record could not be created.", error);
    }
  }

  async markDocumentProcessed(input: {
    id: string;
    userId: string;
    extractedText: string;
  }): Promise<void> {
    const { error } = await this.client
      .from("cv_documents")
      .update({
        status: "processed",
        extracted_text: input.extractedText,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", input.userId)
      .select("id")
      .single();

    if (error) {
      throw persistenceError("The extracted CV text could not be saved.", error);
    }
  }

  async markDocumentFailed(input: {
    id: string;
    userId: string;
    errorMessage: string;
  }): Promise<void> {
    const { error } = await this.client
      .from("cv_documents")
      .update({
        status: "failed",
        error_message: input.errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", input.userId);

    if (error) {
      throw persistenceError("The failed CV record could not be updated.", error);
    }
  }

  async createDraft(input: {
    id: string;
    userId: string;
    sourceDocumentId: string;
    evidence: CareerEvidence;
    extractionModel: string;
  }): Promise<CareerEvidenceSet> {
    const { data, error } = await this.client
      .from("career_evidence_sets")
      .insert({
        id: input.id,
        user_id: input.userId,
        source_document_id: input.sourceDocumentId,
        schema_version: input.evidence.schema_version,
        status: "draft",
        evidence: input.evidence,
        extraction_model: input.extractionModel,
      })
      .select()
      .single();

    if (error) {
      throw persistenceError("The evidence draft could not be saved.", error);
    }

    return mapEvidenceRow(data as EvidenceRow);
  }

  async saveDraft(input: {
    id: string;
    userId: string;
    evidence: CareerEvidence;
  }): Promise<CareerEvidenceSet> {
    const { data, error } = await this.client
      .from("career_evidence_sets")
      .update({
        evidence: input.evidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", input.userId)
      .eq("status", "draft")
      .select()
      .single();

    if (error) {
      throw unavailableDraftError(error);
    }

    return mapEvidenceRow(data as EvidenceRow);
  }

  async verify(input: {
    id: string;
    userId: string;
    evidence: CareerEvidence;
    verifiedAt: string;
  }): Promise<CareerEvidenceSet> {
    const { data, error } = await this.client
      .from("career_evidence_sets")
      .update({
        evidence: input.evidence,
        status: "verified",
        verified_at: input.verifiedAt,
        updated_at: input.verifiedAt,
      })
      .eq("id", input.id)
      .eq("user_id", input.userId)
      .eq("status", "draft")
      .select()
      .single();

    if (error) {
      throw unavailableDraftError(error);
    }

    return mapEvidenceRow(data as EvidenceRow);
  }

  async getById(
    id: string,
    userId: string,
  ): Promise<CareerEvidenceSet | null> {
    const { data, error } = await this.client
      .from("career_evidence_sets")
      .select()
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw persistenceError("Career evidence could not be loaded.", error);
    }

    return data ? mapEvidenceRow(data as EvidenceRow) : null;
  }

  async getCurrent(userId: string): Promise<CareerEvidenceSet | null> {
    const { data, error } = await this.client
      .from("career_evidence_sets")
      .select()
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw persistenceError("Career evidence could not be loaded.", error);
    }

    return data ? mapEvidenceRow(data as EvidenceRow) : null;
  }
}

function mapEvidenceRow(row: EvidenceRow): CareerEvidenceSet {
  return {
    id: row.id,
    userId: row.user_id,
    sourceDocumentId: row.source_document_id,
    status: row.status,
    evidence: careerEvidenceSchema.parse(row.evidence),
    extractionModel: row.extraction_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
  };
}

function persistenceError(message: string, cause: unknown) {
  return new CareerEvidenceError("PERSISTENCE_FAILED", message, { cause });
}

function unavailableDraftError(cause: unknown) {
  return new CareerEvidenceError(
    "INVALID_STATE",
    "This evidence draft no longer exists or has already been verified.",
    { cause },
  );
}
