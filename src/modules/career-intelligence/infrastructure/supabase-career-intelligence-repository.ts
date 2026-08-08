import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CareerIntelligenceRepository,
  JobAnalysis,
  JobMatchAnalysis,
  JobSearchPlan,
  PersistedCandidateCapabilityProfile,
  PersistedCareerStageAssessment,
  PlannedJobQuery,
} from "../application/ports";
import type { CareerStageAssessment } from "../domain/career-stage";
import { capabilitySignalSchema } from "../domain/capability-schemas";
import { CareerIntelligenceError } from "../domain/errors";
import {
  jobRequirementSchema,
  requirementMatchSchema,
  scoreBreakdownSchema,
  type OpportunityBand,
  type RequirementMatch,
} from "../domain/schemas";

export class SupabaseCareerIntelligenceRepository
  implements CareerIntelligenceRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async saveCareerStageAssessment(input: {
    id: string;
    userId: string;
    evidenceSetId: string;
    assessment: CareerStageAssessment;
    createdAt: string;
  }): Promise<PersistedCareerStageAssessment> {
    const { data, error } = await this.client
      .from("career_stage_assessments")
      .insert({
        id: input.id,
        user_id: input.userId,
        evidence_set_id: input.evidenceSetId,
        evidence_fingerprint: input.assessment.evidenceFingerprint,
        preferences_fingerprint: input.assessment.preferencesFingerprint,
        inferred_stage: input.assessment.inferredStage,
        confidence: input.assessment.confidence,
        experience_summary: input.assessment.experienceSummary,
        target_opportunity_bands: input.assessment.targetOpportunityBands,
        stretch_opportunity_bands: input.assessment.stretchOpportunityBands,
        unsuitable_bands: input.assessment.unsuitableBands,
        reasons: input.assessment.reasons,
        preference_overrides: input.assessment.preferenceOverrides,
        evidence_ids: input.assessment.evidenceIds,
        policy_version: input.assessment.policyVersion,
        assessed_at: input.assessment.assessedAt,
        created_at: input.createdAt,
        updated_at: input.createdAt,
      })
      .select()
      .single();
    if (error) throw persistence("Career-stage assessment could not be saved.", error);
    return mapAssessment(data);
  }

  async getLatestCareerStageAssessment(
    userId: string,
  ): Promise<PersistedCareerStageAssessment | null> {
    const { data, error } = await this.client
      .from("career_stage_assessments")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw persistence("Career-stage assessment could not be loaded.", error);
    return data ? mapAssessment(data) : null;
  }

  async getCareerStageAssessmentById(
    id: string,
    userId: string,
  ): Promise<PersistedCareerStageAssessment | null> {
    const { data, error } = await this.client
      .from("career_stage_assessments")
      .select()
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw persistence("Career-stage assessment could not be loaded.", error);
    return data ? mapAssessment(data) : null;
  }

  async saveSearchPlan(input: {
    plan: Omit<JobSearchPlan, "queries">;
    queries: Array<
      Omit<PlannedJobQuery, "searchPlanId" | "createdAt"> & {
        createdAt?: string;
      }
    >;
  }): Promise<JobSearchPlan> {
    const { error: planError } = await this.client.from("job_search_plans").insert({
      id: input.plan.id,
      user_id: input.plan.userId,
      career_stage_assessment_id: input.plan.careerStageAssessmentId,
      preferences_fingerprint: input.plan.preferencesFingerprint,
      evidence_fingerprint: input.plan.evidenceFingerprint,
      query_budget: input.plan.queryBudget,
      status: input.plan.status,
      reasons: input.plan.reasons,
      created_at: input.plan.createdAt,
      updated_at: input.plan.updatedAt,
    });
    if (planError) throw persistence("Search plan could not be saved.", planError);

    const { error: queryError } = await this.client.from("planned_job_queries").insert(
      input.queries.map((query) => ({
        id: query.id,
        search_plan_id: input.plan.id,
        role_family: query.roleFamily,
        query_text: query.queryText,
        opportunity_band: query.opportunityBand,
        priority: query.priority,
        reason: query.reason,
        source: query.source,
        execution_status: query.executionStatus,
        created_at: query.createdAt ?? input.plan.createdAt,
      })),
    );
    if (queryError) throw persistence("Planned queries could not be saved.", queryError);

    const plan = await this.getSearchPlanById(input.plan.id, input.plan.userId);
    if (!plan) throw persistence("Search plan disappeared after save.", null);
    return plan;
  }

  async getLatestSearchPlan(userId: string): Promise<JobSearchPlan | null> {
    const { data, error } = await this.client
      .from("job_search_plans")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw persistence("Search plan could not be loaded.", error);
    if (!data) return null;
    return this.hydratePlan(data);
  }

  async getSearchPlanById(
    id: string,
    userId: string,
  ): Promise<JobSearchPlan | null> {
    const { data, error } = await this.client
      .from("job_search_plans")
      .select()
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw persistence("Search plan could not be loaded.", error);
    if (!data) return null;
    return this.hydratePlan(data);
  }

  async updateSearchPlanStatus(input: {
    id: string;
    userId: string;
    status: JobSearchPlan["status"];
    updatedAt: string;
  }): Promise<void> {
    const { error } = await this.client
      .from("job_search_plans")
      .update({ status: input.status, updated_at: input.updatedAt })
      .eq("id", input.id)
      .eq("user_id", input.userId);
    if (error) throw persistence("Search plan status could not be updated.", error);
  }

  async updatePlannedQueryStatus(input: {
    id: string;
    searchPlanId: string;
    status: PlannedJobQuery["executionStatus"];
  }): Promise<void> {
    const { error } = await this.client
      .from("planned_job_queries")
      .update({ execution_status: input.status })
      .eq("id", input.id)
      .eq("search_plan_id", input.searchPlanId);
    if (error) throw persistence("Planned query status could not be updated.", error);
  }

  async linkJobToQuery(input: {
    listingId: string;
    plannedQueryId: string;
    discoveredAt: string;
  }): Promise<void> {
    const { error } = await this.client.from("job_discovery_query_links").upsert(
      {
        job_listing_id: input.listingId,
        planned_query_id: input.plannedQueryId,
        discovered_at: input.discoveredAt,
      },
      { onConflict: "job_listing_id,planned_query_id" },
    );
    if (error) throw persistence("Query provenance could not be saved.", error);
  }

  async listQueryProvenance(input: {
    userId: string;
    listingIds: string[];
  }): Promise<Map<string, string[]>> {
    if (input.listingIds.length === 0) return new Map();
    const { data, error } = await this.client
      .from("job_discovery_query_links")
      .select(
        "job_listing_id, planned_job_queries!inner(query_text, search_plan_id, job_search_plans!inner(user_id))",
      )
      .in("job_listing_id", input.listingIds);
    if (error) throw persistence("Query provenance could not be loaded.", error);

    const map = new Map<string, string[]>();
    for (const row of data ?? []) {
      const listingId = row.job_listing_id as string;
      const nested = row.planned_job_queries as unknown as {
        query_text: string;
        job_search_plans: { user_id: string } | Array<{ user_id: string }>;
      };
      const planOwner = Array.isArray(nested.job_search_plans)
        ? nested.job_search_plans[0]?.user_id
        : nested.job_search_plans.user_id;
      if (planOwner !== input.userId) continue;
      const current = map.get(listingId) ?? [];
      if (!current.includes(nested.query_text)) current.push(nested.query_text);
      map.set(listingId, current);
    }
    return map;
  }

  async getJobAnalysisByListing(
    userId: string,
    listingId: string,
  ): Promise<JobAnalysis | null> {
    const { data, error } = await this.client
      .from("job_analyses")
      .select("*, job_requirements(*)")
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .maybeSingle();
    if (error) throw persistence("Job analysis could not be loaded.", error);
    return data ? mapJobAnalysis(data) : null;
  }

  async listJobAnalysesByListingIds(
    userId: string,
    listingIds: string[],
  ): Promise<JobAnalysis[]> {
    if (listingIds.length === 0) return [];
    const { data, error } = await this.client
      .from("job_analyses")
      .select("*, job_requirements(*)")
      .eq("user_id", userId)
      .in("listing_id", listingIds);
    if (error) throw persistence("Job analyses could not be listed.", error);
    return (data ?? []).map(mapJobAnalysis);
  }

  async saveJobAnalysis(analysis: JobAnalysis): Promise<JobAnalysis> {
    const { error } = await this.client.from("job_analyses").upsert(
      {
        id: analysis.id,
        user_id: analysis.userId,
        job_id: analysis.jobId,
        listing_id: analysis.listingId,
        description_fingerprint: analysis.descriptionFingerprint,
        description_quality: analysis.descriptionQuality,
        opportunity_band: analysis.opportunityBand,
        opportunity_confidence: analysis.opportunityConfidence,
        opportunity_reasons: analysis.opportunityReasons,
        extraction_policy_version: analysis.extractionPolicyVersion,
        status: analysis.status,
        warnings: analysis.warnings,
        created_at: analysis.createdAt,
        updated_at: analysis.updatedAt,
      },
      { onConflict: "user_id,listing_id" },
    );
    if (error) throw persistence("Job analysis could not be saved.", error);

    await this.client
      .from("job_requirements")
      .delete()
      .eq("job_analysis_id", analysis.id);

    if (analysis.requirements.length > 0) {
      const { error: reqError } = await this.client.from("job_requirements").insert(
        analysis.requirements.map((requirement) => ({
          id: requirement.id,
          job_analysis_id: analysis.id,
          normalized_statement: requirement.statement,
          category: requirement.category,
          importance: requirement.importance,
          explicit: requirement.explicit,
          confidence: requirement.confidence,
          source_quote: requirement.source_quote,
          quantitative_threshold: requirement.quantitative_threshold,
        })),
      );
      if (reqError) throw persistence("Job requirements could not be saved.", reqError);
    }

    const saved = await this.getJobAnalysisByListing(
      analysis.userId,
      analysis.listingId,
    );
    if (!saved) throw persistence("Job analysis disappeared after save.", null);
    return saved;
  }

  async getMatchAnalysisByListing(
    userId: string,
    listingId: string,
  ): Promise<JobMatchAnalysis | null> {
    const { data, error } = await this.client
      .from("job_match_analyses")
      .select("*, requirement_matches(*)")
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .maybeSingle();
    if (error) throw persistence("Match analysis could not be loaded.", error);
    return data ? mapMatchAnalysis(data) : null;
  }

  async saveMatchAnalysis(analysis: JobMatchAnalysis): Promise<JobMatchAnalysis> {
    const { error } = await this.client.from("job_match_analyses").upsert(
      {
        id: analysis.id,
        user_id: analysis.userId,
        job_analysis_id: analysis.jobAnalysisId,
        listing_id: analysis.listingId,
        job_id: analysis.jobId,
        career_stage_assessment_id: analysis.careerStageAssessmentId,
        evidence_fingerprint: analysis.evidenceFingerprint,
        preferences_fingerprint: analysis.preferencesFingerprint,
        description_fingerprint: analysis.descriptionFingerprint,
        evidence_fit_score: analysis.evidenceFitScore,
        career_level: analysis.careerLevel,
        hard_constraint_eligible: analysis.hardConstraintEligible,
        hard_constraint_reasons: analysis.hardConstraintReasons,
        analysis_confidence: analysis.analysisConfidence,
        scoring_policy_version: analysis.scoringPolicyVersion,
        matching_policy_version: analysis.matchingPolicyVersion,
        score_breakdown: analysis.scoreBreakdown,
        explanation: analysis.explanation,
        status: analysis.status,
        created_at: analysis.createdAt,
        updated_at: analysis.updatedAt,
      },
      { onConflict: "user_id,listing_id" },
    );
    if (error) throw persistence("Match analysis could not be saved.", error);

    await this.client
      .from("requirement_matches")
      .delete()
      .eq("job_match_analysis_id", analysis.id);

    if (analysis.matches.length > 0) {
      const { error: matchError } = await this.client
        .from("requirement_matches")
        .insert(
          analysis.matches.map((match) => ({
            job_match_analysis_id: analysis.id,
            requirement_id: match.requirement_id,
            status: match.status,
            supporting_evidence_ids: match.evidence_ids,
            reason: match.reason,
            confidence: match.confidence,
            classifier_source: match.classifier,
          })),
        );
      if (matchError) {
        throw persistence("Requirement matches could not be saved.", matchError);
      }
    }

    const saved = await this.getMatchAnalysisByListing(
      analysis.userId,
      analysis.listingId,
    );
    if (!saved) throw persistence("Match analysis disappeared after save.", null);
    return saved;
  }

  async listCurrentMatchAnalyses(userId: string): Promise<JobMatchAnalysis[]> {
    const { data, error } = await this.client
      .from("job_match_analyses")
      .select("*, requirement_matches(*)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw persistence("Match analyses could not be listed.", error);
    return (data ?? []).map(mapMatchAnalysis);
  }

  async markMatchAnalysesStale(input: {
    userId: string;
    exceptIds?: string[];
    updatedAt: string;
  }): Promise<void> {
    let query = this.client
      .from("job_match_analyses")
      .update({ status: "stale", updated_at: input.updatedAt })
      .eq("user_id", input.userId)
      .eq("status", "current");
    if (input.exceptIds && input.exceptIds.length > 0) {
      query = query.not("id", "in", `(${input.exceptIds.join(",")})`);
    }
    const { error } = await query;
    if (error) throw persistence("Match analyses could not be marked stale.", error);
  }

  async clearMatchAnalyses(userId: string): Promise<number> {
    const { data, error } = await this.client
      .from("job_match_analyses")
      .delete()
      .eq("user_id", userId)
      .select("id");
    if (error) throw persistence("Match analyses could not be cleared.", error);
    return data?.length ?? 0;
  }

  async saveCapabilityProfile(
    profile: PersistedCandidateCapabilityProfile,
  ): Promise<PersistedCandidateCapabilityProfile> {
    const { error } = await this.client.from("candidate_capability_profiles").upsert(
      {
        id: profile.id,
        user_id: profile.userId,
        evidence_set_id: profile.evidenceSetId,
        evidence_fingerprint: profile.evidenceFingerprint,
        extraction_policy_version: profile.extractionPolicyVersion,
        aggregation_policy_version: profile.aggregationPolicyVersion,
        status: profile.status,
        warnings: profile.warnings,
        aggregates: profile.aggregates,
        directions: profile.directions,
        created_at: profile.createdAt,
        updated_at: profile.updatedAt,
      },
      { onConflict: "user_id" },
    );
    if (error) throw persistence("Capability profile could not be saved.", error);

    await this.client
      .from("capability_evidence_signals")
      .delete()
      .eq("profile_id", profile.id);

    if (profile.signals.length > 0) {
      const { error: signalError } = await this.client
        .from("capability_evidence_signals")
        .insert(
          profile.signals.map((signal) => ({
            profile_id: profile.id,
            capability_key: signal.capability_key,
            display_label: signal.display_label,
            capability_type: signal.capability_type,
            evidence_ids: signal.evidence_ids,
            evidence_context: signal.evidence_context,
            depth: String(signal.depth),
            ownership_signal: signal.ownership_signal,
            source_quote: signal.source_quote,
            rationale: signal.rationale,
            warnings: signal.warnings,
          })),
        );
      if (signalError) {
        throw persistence("Capability signals could not be saved.", signalError);
      }
    }

    const saved = await this.getLatestCapabilityProfile(profile.userId);
    if (!saved) throw persistence("Capability profile disappeared after save.", null);
    return saved;
  }

  async getLatestCapabilityProfile(
    userId: string,
  ): Promise<PersistedCandidateCapabilityProfile | null> {
    const { data, error } = await this.client
      .from("candidate_capability_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingCapabilitySchema(error)) {
        console.warn(
          "Capability profile tables are unavailable. Apply supabase/migrations/0004_slice_2_1.sql.",
          error,
        );
        return null;
      }
      throw persistence("Capability profile could not be loaded.", error);
    }
    if (!data) return null;

    const { data: signals, error: signalError } = await this.client
      .from("capability_evidence_signals")
      .select("*")
      .eq("profile_id", data.id as string);
    if (signalError) {
      if (isMissingCapabilitySchema(signalError)) {
        console.warn(
          "Capability signal table is unavailable. Apply supabase/migrations/0004_slice_2_1.sql.",
          signalError,
        );
        return mapCapabilityProfile({ ...data, capability_evidence_signals: [] });
      }
      throw persistence("Capability signals could not be loaded.", signalError);
    }

    return mapCapabilityProfile({
      ...data,
      capability_evidence_signals: signals ?? [],
    });
  }

  async markCapabilityProfileStale(input: {
    userId: string;
    updatedAt: string;
  }): Promise<void> {
    const { error } = await this.client
      .from("candidate_capability_profiles")
      .update({ status: "stale", updated_at: input.updatedAt })
      .eq("user_id", input.userId);
    if (error) {
      if (isMissingCapabilitySchema(error)) {
        console.warn(
          "Skipping capability staleness update; apply supabase/migrations/0004_slice_2_1.sql.",
          error,
        );
        return;
      }
      throw persistence("Capability profile could not be marked stale.", error);
    }
  }

  private async hydratePlan(row: Record<string, unknown>): Promise<JobSearchPlan> {
    const { data, error } = await this.client
      .from("planned_job_queries")
      .select()
      .eq("search_plan_id", row.id as string)
      .order("priority", { ascending: true });
    if (error) throw persistence("Planned queries could not be loaded.", error);

    return {
      id: row.id as string,
      userId: row.user_id as string,
      careerStageAssessmentId: row.career_stage_assessment_id as string,
      preferencesFingerprint: row.preferences_fingerprint as string,
      evidenceFingerprint: row.evidence_fingerprint as string,
      queryBudget: row.query_budget as number,
      status: row.status as JobSearchPlan["status"],
      reasons: row.reasons as string[],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      queries: (data ?? []).map((query) => ({
        id: query.id as string,
        searchPlanId: query.search_plan_id as string,
        roleFamily: query.role_family as string,
        queryText: query.query_text as string,
        opportunityBand: query.opportunity_band as OpportunityBand,
        priority: query.priority as number,
        reason: query.reason as string,
        source: query.source as PlannedJobQuery["source"],
        executionStatus: query.execution_status as PlannedJobQuery["executionStatus"],
        createdAt: query.created_at as string,
      })),
    };
  }
}

function mapAssessment(row: Record<string, unknown>): PersistedCareerStageAssessment {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    evidenceSetId: row.evidence_set_id as string,
    inferredStage: row.inferred_stage as PersistedCareerStageAssessment["inferredStage"],
    confidence: row.confidence as PersistedCareerStageAssessment["confidence"],
    experienceSummary:
      row.experience_summary as PersistedCareerStageAssessment["experienceSummary"],
    targetOpportunityBands: row.target_opportunity_bands as OpportunityBand[],
    stretchOpportunityBands: row.stretch_opportunity_bands as OpportunityBand[],
    unsuitableBands: row.unsuitable_bands as OpportunityBand[],
    reasons: row.reasons as string[],
    preferenceOverrides:
      row.preference_overrides as PersistedCareerStageAssessment["preferenceOverrides"],
    evidenceIds: row.evidence_ids as string[],
    policyVersion: row.policy_version as string,
    assessedAt: row.assessed_at as string,
    evidenceFingerprint: row.evidence_fingerprint as string,
    preferencesFingerprint: row.preferences_fingerprint as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapJobAnalysis(row: Record<string, unknown>): JobAnalysis {
  const requirements = ((row.job_requirements as Array<Record<string, unknown>>) ?? []).map(
    (requirement) =>
      jobRequirementSchema.parse({
        id: requirement.id,
        statement: requirement.normalized_statement,
        category: requirement.category,
        importance: requirement.importance,
        explicit: requirement.explicit,
        confidence: requirement.confidence,
        source_quote: requirement.source_quote,
        quantitative_threshold: requirement.quantitative_threshold ?? null,
      }),
  );

  return {
    id: row.id as string,
    userId: row.user_id as string,
    jobId: row.job_id as string,
    listingId: row.listing_id as string,
    descriptionFingerprint: row.description_fingerprint as string,
    descriptionQuality:
      row.description_quality as JobAnalysis["descriptionQuality"],
    opportunityBand: row.opportunity_band as OpportunityBand,
    opportunityConfidence:
      row.opportunity_confidence as JobAnalysis["opportunityConfidence"],
    opportunityReasons: row.opportunity_reasons as string[],
    extractionPolicyVersion: row.extraction_policy_version as string,
    status: row.status as JobAnalysis["status"],
    warnings: row.warnings as string[],
    requirements,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMatchAnalysis(row: Record<string, unknown>): JobMatchAnalysis {
  const matches = ((row.requirement_matches as Array<Record<string, unknown>>) ?? []).map(
    (match) =>
      requirementMatchSchema.parse({
        requirement_id: match.requirement_id,
        status: match.status,
        evidence_ids: match.supporting_evidence_ids,
        reason: match.reason,
        confidence: match.confidence,
        classifier: match.classifier_source,
      }),
  );

  return {
    id: row.id as string,
    userId: row.user_id as string,
    jobAnalysisId: row.job_analysis_id as string,
    listingId: row.listing_id as string,
    jobId: row.job_id as string,
    careerStageAssessmentId: row.career_stage_assessment_id as string,
    evidenceFingerprint: row.evidence_fingerprint as string,
    preferencesFingerprint: row.preferences_fingerprint as string,
    descriptionFingerprint: row.description_fingerprint as string,
    evidenceFitScore: row.evidence_fit_score as number,
    careerLevel: row.career_level as JobMatchAnalysis["careerLevel"],
    hardConstraintEligible: row.hard_constraint_eligible as boolean,
    hardConstraintReasons: row.hard_constraint_reasons as string[],
    analysisConfidence:
      row.analysis_confidence as JobMatchAnalysis["analysisConfidence"],
    scoringPolicyVersion: row.scoring_policy_version as string,
    matchingPolicyVersion: row.matching_policy_version as string,
    scoreBreakdown: scoreBreakdownSchema.parse(row.score_breakdown),
    explanation: row.explanation as string,
    status: row.status as JobMatchAnalysis["status"],
    matches: matches as RequirementMatch[],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function isMissingCapabilitySchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string; details?: string };
  const text = `${record.message ?? ""} ${record.details ?? ""}`.toLocaleLowerCase();
  return (
    record.code === "42P01" ||
    record.code === "PGRST205" ||
    record.code === "PGRST200" ||
    text.includes("does not exist") ||
    text.includes("could not find the table") ||
    text.includes("could not find a relationship")
  );
}

function mapCapabilityProfile(
  row: Record<string, unknown>,
): PersistedCandidateCapabilityProfile {
  const signals = (
    (row.capability_evidence_signals as Array<Record<string, unknown>>) ?? []
  ).map((signal) => {
    const rawDepth = signal.depth;
    const depth =
      rawDepth === "unknown" || rawDepth === null || rawDepth === undefined
        ? "unknown"
        : ([0, 1, 2, 3, 4] as const)[
            Math.min(Math.max(Number(rawDepth), 0), 4)
          ]!;
    return capabilitySignalSchema.parse({
      capability_key: signal.capability_key,
      display_label: signal.display_label,
      capability_type: signal.capability_type,
      evidence_ids: signal.evidence_ids,
      evidence_context: signal.evidence_context,
      depth,
      ownership_signal: signal.ownership_signal,
      source_quote:
        typeof signal.source_quote === "string" && signal.source_quote.trim()
          ? signal.source_quote
          : null,
      rationale: signal.rationale,
      warnings: signal.warnings ?? [],
    });
  });

  return {
    id: row.id as string,
    userId: row.user_id as string,
    evidenceSetId: row.evidence_set_id as string,
    evidenceFingerprint: row.evidence_fingerprint as string,
    extractionPolicyVersion: row.extraction_policy_version as string,
    aggregationPolicyVersion: row.aggregation_policy_version as string,
    status: row.status as PersistedCandidateCapabilityProfile["status"],
    warnings: row.warnings as string[],
    aggregates:
      row.aggregates as PersistedCandidateCapabilityProfile["aggregates"],
    directions:
      row.directions as PersistedCandidateCapabilityProfile["directions"],
    signals,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function persistence(message: string, cause: unknown): CareerIntelligenceError {
  const detail =
    cause && typeof cause === "object" && "message" in cause
      ? String((cause as { message?: unknown }).message ?? "")
      : "";
  if (detail) {
    console.error(message, cause);
  }
  return new CareerIntelligenceError(
    "PERSISTENCE_FAILED",
    detail ? `${message} (${detail})` : message,
    { cause },
  );
}
