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
    // Always write as draft — editing a verified set reopens it for review.
    const { data, error } = await this.client
      .from("career_evidence_sets")
      .update({
        evidence: input.evidence,
        status: "draft",
        verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", input.userId)
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

  async getDocumentExtractedText(input: {
    documentId: string;
    userId: string;
  }): Promise<string | null> {
    const { data, error } = await this.client
      .from("cv_documents")
      .select("extracted_text")
      .eq("id", input.documentId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (error) {
      throw persistenceError("CV source text could not be loaded.", error);
    }

    return (data?.extracted_text as string | null | undefined) ?? null;
  }
}

function sanitizeEvidence(raw: unknown): CareerEvidence {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const profileRaw =
    typeof obj.profile === "object" && obj.profile !== null
      ? (obj.profile as Record<string, unknown>)
      : {};

  const mapList = <T>(list: unknown, mapper: (item: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => (typeof item === "object" && item !== null ? mapper(item as Record<string, unknown>) : null))
      .filter((item): item is T => item !== null);
  };

  const sanitizeWork = (item: Record<string, unknown>) => ({
    id: String(item.id || crypto.randomUUID()),
    origin: (item.origin === "extracted" || item.origin === "user_edited" ? item.origin : "user_edited") as "extracted" | "user_edited",
    source_quote: item.source_quote ? String(item.source_quote) : null,
    employer: String(item.employer || item.company || ""),
    role: String(item.role || item.title || item.job_title || ""),
    location: item.location ? String(item.location) : null,
    start_date: item.start_date ? String(item.start_date).slice(0, 7) : null,
    end_date: item.end_date ? String(item.end_date).slice(0, 7) : null,
    is_current: Boolean(item.is_current),
    bullets: Array.isArray(item.bullets) ? item.bullets.map(String).filter(Boolean) : [],
  });

  const sanitizeEdu = (item: Record<string, unknown>) => ({
    id: String(item.id || crypto.randomUUID()),
    origin: (item.origin === "extracted" || item.origin === "user_edited" ? item.origin : "user_edited") as "extracted" | "user_edited",
    source_quote: item.source_quote ? String(item.source_quote) : null,
    institution: String(item.institution || item.school || ""),
    qualification: item.qualification ? String(item.qualification) : null,
    field_of_study: item.field_of_study ? String(item.field_of_study) : null,
    start_date: item.start_date ? String(item.start_date).slice(0, 7) : null,
    end_date: item.end_date ? String(item.end_date).slice(0, 7) : null,
    details: Array.isArray(item.details) ? item.details.map(String).filter(Boolean) : undefined,
  });

  const sanitizeSkill = (item: Record<string, unknown>) => ({
    id: String(item.id || crypto.randomUUID()),
    origin: (item.origin === "extracted" || item.origin === "user_edited" ? item.origin : "user_edited") as "extracted" | "user_edited",
    source_quote: item.source_quote ? String(item.source_quote) : null,
    name: String(item.name || item.skill || ""),
  });

  const sanitizeProject = (item: Record<string, unknown>) => ({
    id: String(item.id || crypto.randomUUID()),
    origin: (item.origin === "extracted" || item.origin === "user_edited" ? item.origin : "user_edited") as "extracted" | "user_edited",
    source_quote: item.source_quote ? String(item.source_quote) : null,
    name: String(item.name || item.title || "Project"),
    role: item.role ? String(item.role) : null,
    start_date: item.start_date ? String(item.start_date).slice(0, 7) : null,
    end_date: item.end_date ? String(item.end_date).slice(0, 7) : null,
    bullets: Array.isArray(item.bullets)
      ? item.bullets.map(String).filter(Boolean)
      : item.description
        ? [String(item.description)]
        : [],
    technologies: Array.isArray(item.technologies) ? item.technologies.map(String).filter(Boolean) : [],
  });

  const sanitizeCert = (item: Record<string, unknown>) => ({
    id: String(item.id || crypto.randomUUID()),
    origin: (item.origin === "extracted" || item.origin === "user_edited" ? item.origin : "user_edited") as "extracted" | "user_edited",
    source_quote: item.source_quote ? String(item.source_quote) : null,
    name: String(item.name || item.title || ""),
    issuer: item.issuer ? String(item.issuer) : null,
    issued_date: item.issued_date ? String(item.issued_date).slice(0, 7) : null,
  });

  const sanitizeAchieve = (item: Record<string, unknown>) => ({
    id: String(item.id || crypto.randomUUID()),
    origin: (item.origin === "extracted" || item.origin === "user_edited" ? item.origin : "user_edited") as "extracted" | "user_edited",
    source_quote: item.source_quote ? String(item.source_quote) : null,
    name: String(item.name || item.title || ""),
    result: item.result ? String(item.result) : null,
    issuer: item.issuer ? String(item.issuer) : null,
    date: item.date ? String(item.date).slice(0, 7) : null,
  });

  const sanitizeRef = (item: Record<string, unknown>) => ({
    id: String(item.id || crypto.randomUUID()),
    origin: (item.origin === "extracted" || item.origin === "user_edited" ? item.origin : "user_edited") as "extracted" | "user_edited",
    source_quote: item.source_quote ? String(item.source_quote) : null,
    name: String(item.name || ""),
    title: item.title ? String(item.title) : null,
    organization: item.organization ? String(item.organization) : null,
    email: item.email ? String(item.email) : null,
    phone: item.phone ? String(item.phone) : null,
  });

  return {
    schema_version: 1,
    profile: {
      full_name: profileRaw.full_name ? String(profileRaw.full_name) : null,
      email: profileRaw.email ? String(profileRaw.email) : null,
      phone: profileRaw.phone ? String(profileRaw.phone) : null,
      location: profileRaw.location ? String(profileRaw.location) : null,
      summary: profileRaw.summary ? String(profileRaw.summary) : null,
    },
    work_experience: mapList(obj.work_experience, sanitizeWork),
    education: mapList(obj.education, sanitizeEdu),
    skills: mapList(obj.skills, sanitizeSkill),
    projects: mapList(obj.projects, sanitizeProject),
    certifications: mapList(obj.certifications, sanitizeCert),
    achievements: mapList(obj.achievements, sanitizeAchieve),
    references: mapList(obj.references, sanitizeRef),
    warnings: Array.isArray(obj.warnings) ? obj.warnings.map(String).filter(Boolean) : [],
  };
}

function mapEvidenceRow(row: EvidenceRow): CareerEvidenceSet {
  const parsed = careerEvidenceSchema.safeParse(row.evidence);
  const evidence = parsed.success ? parsed.data : sanitizeEvidence(row.evidence);

  return {
    id: row.id,
    userId: row.user_id,
    sourceDocumentId: row.source_document_id,
    status: row.status,
    evidence,
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
