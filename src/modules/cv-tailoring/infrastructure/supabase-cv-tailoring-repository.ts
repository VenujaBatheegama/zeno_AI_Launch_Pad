import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CvTailoringRepository,
  CvTailoringVariant,
} from "../application/ports";
import type { ContentPlan } from "../domain/content-plan";
import { CvTailoringError } from "../domain/errors";
import type { EvidenceSnapshot } from "../domain/facts";
import type {
  CvMode,
  CvVariantStatus,
  KeywordAuditEntry,
} from "../domain/schemas";
import type { TailoredResume } from "../domain/tailored-resume";
import type { ValidationIssue } from "../domain/validation";

export class SupabaseCvTailoringRepository implements CvTailoringRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saveVariant(variant: CvTailoringVariant): Promise<CvTailoringVariant> {
    const { error } = await this.client.from("cv_tailoring_variants").upsert(
      {
        id: variant.id,
        user_id: variant.userId,
        listing_id: variant.listingId,
        job_id: variant.jobId,
        job_analysis_id: variant.jobAnalysisId,
        evidence_set_id: variant.evidenceSetId,
        mode: variant.mode,
        status: variant.status,
        recommended_mode: variant.recommendedMode,
        recommendation_reason: variant.recommendationReason,
        tailoring_context: variant.tailoringContext,
        idempotency_key: variant.idempotencyKey,
        evidence_fingerprint: variant.evidenceFingerprint,
        analysis_fingerprint: variant.analysisFingerprint,
        content_plan_fingerprint: variant.contentPlanFingerprint,
        policy_version: variant.policyVersion,
        prompt_version: variant.promptVersion,
        model_id: variant.modelId,
        input_tokens: variant.inputTokens,
        output_tokens: variant.outputTokens,
        repair_count: variant.repairCount,
        generation_duration_ms: variant.generationDurationMs,
        evidence_snapshot: variant.evidenceSnapshot,
        content_plan: variant.contentPlan,
        keyword_audit: variant.keywordAudit,
        tailored_content: variant.tailoredContent,
        validation_issues: variant.validationIssues,
        warnings: variant.warnings,
        artifact_storage_path: variant.artifactStoragePath,
        artifact_checksum: variant.artifactChecksum,
        artifact_page_count: variant.artifactPageCount,
        error_message: variant.errorMessage,
        created_at: variant.createdAt,
        updated_at: variant.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      throw new CvTailoringError(
        "PERSISTENCE_FAILED",
        "CV variant could not be saved.",
        { cause: error },
      );
    }
    const saved = await this.getVariant(variant.userId, variant.id);
    if (!saved) {
      throw new CvTailoringError(
        "PERSISTENCE_FAILED",
        "CV variant disappeared after save.",
      );
    }
    return saved;
  }

  async getVariant(
    userId: string,
    variantId: string,
  ): Promise<CvTailoringVariant | null> {
    const { data, error } = await this.client
      .from("cv_tailoring_variants")
      .select("*")
      .eq("user_id", userId)
      .eq("id", variantId)
      .maybeSingle();
    if (error) {
      throw new CvTailoringError(
        "PERSISTENCE_FAILED",
        "CV variant could not be loaded.",
        { cause: error },
      );
    }
    return data ? mapVariant(data) : null;
  }

  async getVariantByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<CvTailoringVariant | null> {
    const { data, error } = await this.client
      .from("cv_tailoring_variants")
      .select("*")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) {
      throw new CvTailoringError(
        "PERSISTENCE_FAILED",
        "CV variant could not be loaded.",
        { cause: error },
      );
    }
    return data ? mapVariant(data) : null;
  }

  async listVariantsForListing(
    userId: string,
    listingId: string,
  ): Promise<CvTailoringVariant[]> {
    const { data, error } = await this.client
      .from("cv_tailoring_variants")
      .select("*")
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .order("updated_at", { ascending: false });
    if (error) {
      throw new CvTailoringError(
        "PERSISTENCE_FAILED",
        "CV variants could not be listed.",
        { cause: error },
      );
    }
    return (data ?? []).map(mapVariant);
  }

  async listVariantsForUser(
    userId: string,
    options?: { statuses?: CvVariantStatus[]; limit?: number },
  ): Promise<CvTailoringVariant[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    let query = this.client
      .from("cv_tailoring_variants")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (options?.statuses && options.statuses.length > 0) {
      query = query.in("status", options.statuses);
    }
    const { data, error } = await query;
    if (error) {
      throw new CvTailoringError(
        "PERSISTENCE_FAILED",
        "CV variants could not be listed.",
        { cause: error },
      );
    }
    return (data ?? []).map(mapVariant);
  }
}

function mapVariant(row: Record<string, unknown>): CvTailoringVariant {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    listingId: row.listing_id as string,
    jobId: row.job_id as string,
    jobAnalysisId: row.job_analysis_id as string,
    evidenceSetId: row.evidence_set_id as string,
    mode: row.mode as CvMode,
    status: row.status as CvVariantStatus,
    recommendedMode: row.recommended_mode as CvMode,
    recommendationReason: row.recommendation_reason as string,
    tailoringContext: (row.tailoring_context as string | null) ?? null,
    idempotencyKey: row.idempotency_key as string,
    evidenceFingerprint: row.evidence_fingerprint as string,
    analysisFingerprint: row.analysis_fingerprint as string,
    contentPlanFingerprint: row.content_plan_fingerprint as string,
    policyVersion: row.policy_version as string,
    promptVersion: row.prompt_version as string,
    modelId: (row.model_id as string | null) ?? null,
    inputTokens: (row.input_tokens as number | null) ?? null,
    outputTokens: (row.output_tokens as number | null) ?? null,
    repairCount: row.repair_count as number,
    generationDurationMs: (row.generation_duration_ms as number | null) ?? null,
    evidenceSnapshot: row.evidence_snapshot as EvidenceSnapshot,
    contentPlan: row.content_plan as ContentPlan,
    keywordAudit: row.keyword_audit as KeywordAuditEntry[],
    tailoredContent: (row.tailored_content as TailoredResume | null) ?? null,
    assessment:
      ((row.content_plan as ContentPlan | null)?.assessment as
        | CvTailoringVariant["assessment"]
        | undefined) ?? null,
    validationIssues: (row.validation_issues as ValidationIssue[]) ?? [],
    warnings: (row.warnings as string[]) ?? [],
    artifactStoragePath: (row.artifact_storage_path as string | null) ?? null,
    artifactChecksum: (row.artifact_checksum as string | null) ?? null,
    artifactPageCount: (row.artifact_page_count as number | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
