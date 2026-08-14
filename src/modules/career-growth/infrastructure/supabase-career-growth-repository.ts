import type { SupabaseClient } from "@supabase/supabase-js";

import { CareerGrowthError } from "../domain/errors";
import type {
  GrowthAssessment,
  GrowthAssessmentRequest,
  GrowthConversation,
  GrowthMessage,
  GrowthMilestone,
  GrowthProject,
  GrowthRecommendation,
  GrowthSuppression,
} from "../domain/schemas";
import type { CareerGrowthRepository } from "../application/ports";

export class SupabaseCareerGrowthRepository implements CareerGrowthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertAssessmentRequest(request: GrowthAssessmentRequest) {
    const { data, error } = await this.client
      .from("growth_assessment_requests")
      .insert(toRequestRow(request))
      .select()
      .single();
    if (error || !data) throw persistence("Growth assessment could not be queued.", error);
    return mapRequest(data);
  }

  async getAssessmentRequest(id: string) {
    const { data, error } = await this.client
      .from("growth_assessment_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistence("Growth assessment request could not be loaded.", error);
    return data ? mapRequest(data) : null;
  }

  async listAssessmentRequests(input: {
    userId: string;
    campaignId?: string;
    statuses?: GrowthAssessmentRequest["status"][];
  }) {
    let query = this.client
      .from("growth_assessment_requests")
      .select("*")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false });
    if (input.campaignId) query = query.eq("campaign_id", input.campaignId);
    if (input.statuses?.length) query = query.in("status", input.statuses);
    const { data, error } = await query;
    if (error) throw persistence("Growth assessment requests could not be loaded.", error);
    return (data ?? []).map(mapRequest);
  }

  async claimAssessmentRequest(input: {
    id: string;
    owner: string;
    now: string;
    leaseExpiresAt: string;
  }) {
    const current = await this.getAssessmentRequest(input.id);
    if (!current) return null;
    if (
      current.status === "processing" &&
      current.leaseExpiresAt &&
      current.leaseExpiresAt > input.now &&
      current.leaseOwner !== input.owner
    ) {
      return null;
    }
    if (
      current.status !== "pending" &&
      current.status !== "failed_retryable" &&
      current.status !== "processing"
    ) {
      return current.status === "completed" ? current : null;
    }
    const { data, error } = await this.client
      .from("growth_assessment_requests")
      .update({
        status: "processing",
        lease_owner: input.owner,
        lease_expires_at: input.leaseExpiresAt,
        attempt_count: current.attemptCount + 1,
        updated_at: input.now,
      })
      .eq("id", input.id)
      .select()
      .single();
    if (error || !data) return null;
    return mapRequest(data);
  }

  async claimDueAssessmentRequests(input: {
    now: string;
    owner: string;
    leaseExpiresAt: string;
    limit: number;
  }) {
    const { data, error } = await this.client.rpc("claim_due_growth_assessments", {
      p_now: input.now,
      p_owner: input.owner,
      p_lease_expires_at: input.leaseExpiresAt,
      p_limit: input.limit,
    });
    if (error) throw persistence("Due Growth assessments could not be claimed.", error);
    return ((data ?? []) as Record<string, unknown>[]).map(mapRequest);
  }

  async updateAssessmentRequest(
    id: string,
    patch: Partial<GrowthAssessmentRequest>,
  ) {
    const { data, error } = await this.client
      .from("growth_assessment_requests")
      .update(toRequestPatch(patch))
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw persistence("Growth assessment request could not be updated.", error);
    return mapRequest(data);
  }

  async findAssessmentByFingerprint(input: {
    userId: string;
    fingerprint: string;
  }) {
    const { data, error } = await this.client
      .from("growth_assessments")
      .select("*")
      .eq("user_id", input.userId)
      .eq("input_fingerprint", input.fingerprint)
      .maybeSingle();
    if (error) throw persistence("Growth assessment cache could not be loaded.", error);
    return data ? mapAssessment(data) : null;
  }

  async insertAssessment(assessment: GrowthAssessment) {
    const { data, error } = await this.client
      .from("growth_assessments")
      .insert(toAssessmentRow(assessment))
      .select()
      .single();
    if (error || !data) throw persistence("Growth assessment could not be saved.", error);
    return mapAssessment(data);
  }

  async getAssessment(id: string) {
    const { data, error } = await this.client
      .from("growth_assessments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistence("Growth assessment could not be loaded.", error);
    return data ? mapAssessment(data) : null;
  }

  async listAssessmentsForCampaign(input: {
    userId: string;
    campaignId: string;
  }) {
    const { data, error } = await this.client
      .from("growth_assessments")
      .select("*")
      .eq("user_id", input.userId)
      .eq("campaign_id", input.campaignId)
      .order("created_at", { ascending: false });
    if (error) throw persistence("Growth assessments could not be loaded.", error);
    return (data ?? []).map(mapAssessment);
  }

  async insertRecommendation(recommendation: GrowthRecommendation) {
    const { data, error } = await this.client
      .from("growth_recommendations")
      .insert(toRecommendationRow(recommendation))
      .select()
      .single();
    if (error || !data) throw persistence("Growth recommendation could not be saved.", error);
    return mapRecommendation(data);
  }

  async updateRecommendation(id: string, patch: Partial<GrowthRecommendation>) {
    const { data, error } = await this.client
      .from("growth_recommendations")
      .update(toRecommendationPatch(patch))
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw persistence("Growth recommendation could not be updated.", error);
    return mapRecommendation(data);
  }

  async getRecommendation(id: string) {
    const { data, error } = await this.client
      .from("growth_recommendations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistence("Growth recommendation could not be loaded.", error);
    return data ? mapRecommendation(data) : null;
  }

  async listRecommendations(input: {
    userId: string;
    campaignId?: string;
    statuses?: GrowthRecommendation["status"][];
  }) {
    let query = this.client
      .from("growth_recommendations")
      .select("*")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false });
    if (input.campaignId) query = query.eq("campaign_id", input.campaignId);
    if (input.statuses?.length) query = query.in("status", input.statuses);
    const { data, error } = await query;
    if (error) throw persistence("Growth recommendations could not be loaded.", error);
    return (data ?? []).map(mapRecommendation);
  }

  async insertSuppression(suppression: GrowthSuppression) {
    const { data, error } = await this.client
      .from("growth_suppressions")
      .insert({
        id: suppression.id,
        user_id: suppression.userId,
        campaign_id: suppression.campaignId,
        gap_key: suppression.gapKey,
        fingerprint: suppression.fingerprint,
        criteria_fingerprint: suppression.criteriaFingerprint,
        evidence_version: suppression.evidenceVersion,
        dismissal_category: suppression.dismissalCategory,
        dismissed_at: suppression.dismissedAt,
      })
      .select()
      .single();
    if (error || !data) throw persistence("Dismissal could not be saved.", error);
    return mapSuppression(data);
  }

  async listSuppressions(input: { userId: string; campaignId: string }) {
    const { data, error } = await this.client
      .from("growth_suppressions")
      .select("*")
      .eq("user_id", input.userId)
      .eq("campaign_id", input.campaignId)
      .order("dismissed_at", { ascending: false });
    if (error) throw persistence("Growth dismissals could not be loaded.", error);
    return (data ?? []).map(mapSuppression);
  }

  async insertProject(project: GrowthProject) {
    const { data, error } = await this.client
      .from("growth_projects")
      .insert(toProjectRow(project))
      .select()
      .single();
    if (error || !data) throw persistence("Growth project could not be saved.", error);
    if (project.supportingCampaignIds.length > 0) {
      const { error: joinError } = await this.client.from("growth_project_campaigns").insert(
        project.supportingCampaignIds.map((campaignId) => ({
          project_id: project.id,
          campaign_id: campaignId,
          user_id: project.userId,
        })),
      );
      if (joinError) throw persistence("Growth project campaigns could not be linked.", joinError);
    }
    return mapProject(data, project.supportingCampaignIds);
  }

  async updateProject(id: string, patch: Partial<GrowthProject>) {
    const { data, error } = await this.client
      .from("growth_projects")
      .update(toProjectPatch(patch))
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw persistence("Growth project could not be updated.", error);
    const campaignIds =
      patch.supportingCampaignIds ?? (await this.campaignIdsForProject(id));
    return mapProject(data, campaignIds);
  }

  async getProject(id: string) {
    const { data, error } = await this.client
      .from("growth_projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistence("Growth project could not be loaded.", error);
    if (!data) return null;
    return mapProject(data, await this.campaignIdsForProject(id));
  }

  async getProjectBySourceRecommendation(recommendationId: string) {
    const { data, error } = await this.client
      .from("growth_projects")
      .select("*")
      .eq("source_recommendation_id", recommendationId)
      .maybeSingle();
    if (error) throw persistence("Growth project could not be loaded.", error);
    if (!data) return null;
    return mapProject(data, await this.campaignIdsForProject(data.id as string));
  }

  async listProjects(input: {
    userId: string;
    statuses?: GrowthProject["status"][];
  }) {
    let query = this.client
      .from("growth_projects")
      .select("*")
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false });
    if (input.statuses?.length) query = query.in("status", input.statuses);
    const { data, error } = await query;
    if (error) throw persistence("Growth projects could not be loaded.", error);
    const rows = data ?? [];
    const result: GrowthProject[] = [];
    for (const row of rows) {
      result.push(mapProject(row, await this.campaignIdsForProject(row.id as string)));
    }
    return result;
  }

  async replaceMilestones(projectId: string, milestones: GrowthMilestone[]) {
    const { error: delError } = await this.client
      .from("growth_milestones")
      .delete()
      .eq("project_id", projectId);
    if (delError) throw persistence("Growth milestones could not be replaced.", delError);
    if (milestones.length === 0) return [];
    const { data, error } = await this.client
      .from("growth_milestones")
      .insert(milestones.map(toMilestoneRow))
      .select();
    if (error) throw persistence("Growth milestones could not be saved.", error);
    return (data ?? []).map(mapMilestone);
  }

  async listMilestones(projectId: string) {
    const { data, error } = await this.client
      .from("growth_milestones")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });
    if (error) throw persistence("Growth milestones could not be loaded.", error);
    return (data ?? []).map(mapMilestone);
  }

  async getMilestone(id: string) {
    const { data, error } = await this.client
      .from("growth_milestones")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistence("Growth milestone could not be loaded.", error);
    return data ? mapMilestone(data) : null;
  }

  async updateMilestone(id: string, patch: Partial<GrowthMilestone>) {
    const mapped: Record<string, unknown> = {};
    if ("status" in patch) mapped.status = patch.status;
    if ("completedAt" in patch) mapped.completed_at = patch.completedAt;
    if ("targetDate" in patch) mapped.target_date = patch.targetDate;
    if ("title" in patch) mapped.title = patch.title;
    if ("description" in patch) mapped.description = patch.description;
    const { data, error } = await this.client
      .from("growth_milestones")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw persistence("Growth milestone could not be updated.", error);
    return mapMilestone(data);
  }

  async insertConversation(conversation: GrowthConversation) {
    const { data, error } = await this.client
      .from("growth_conversations")
      .insert({
        id: conversation.id,
        user_id: conversation.userId,
        recommendation_id: conversation.recommendationId,
        project_id: conversation.projectId,
        objective_snapshot: conversation.objectiveSnapshot,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
      })
      .select()
      .single();
    if (error || !data) throw persistence("Growth conversation could not be saved.", error);
    return mapConversation(data);
  }

  async getConversationByRecommendation(recommendationId: string) {
    const { data, error } = await this.client
      .from("growth_conversations")
      .select("*")
      .eq("recommendation_id", recommendationId)
      .maybeSingle();
    if (error) throw persistence("Growth conversation could not be loaded.", error);
    return data ? mapConversation(data) : null;
  }

  async updateConversation(id: string, patch: Partial<GrowthConversation>) {
    const mapped: Record<string, unknown> = {};
    if ("projectId" in patch) mapped.project_id = patch.projectId;
    if ("objectiveSnapshot" in patch) mapped.objective_snapshot = patch.objectiveSnapshot;
    if ("updatedAt" in patch) mapped.updated_at = patch.updatedAt;
    const { data, error } = await this.client
      .from("growth_conversations")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw persistence("Growth conversation could not be updated.", error);
    return mapConversation(data);
  }

  async listMessages(conversationId: string) {
    const { data, error } = await this.client
      .from("growth_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw persistence("Growth messages could not be loaded.", error);
    return (data ?? []).map(mapMessage);
  }

  async insertMessage(message: GrowthMessage) {
    const { data, error } = await this.client
      .from("growth_messages")
      .insert({
        id: message.id,
        conversation_id: message.conversationId,
        user_id: message.userId,
        role: message.role,
        content: message.content,
        created_at: message.createdAt,
      })
      .select()
      .single();
    if (error || !data) throw persistence("Growth message could not be saved.", error);
    return mapMessage(data);
  }

  private async campaignIdsForProject(projectId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("growth_project_campaigns")
      .select("campaign_id")
      .eq("project_id", projectId);
    if (error) throw persistence("Growth project campaigns could not be loaded.", error);
    return (data ?? []).map((row) => row.campaign_id as string);
  }
}

function persistence(message: string, cause: unknown) {
  return new CareerGrowthError("PERSISTENCE_FAILED", message, { cause });
}

function toRequestRow(request: GrowthAssessmentRequest) {
  return {
    id: request.id,
    user_id: request.userId,
    campaign_id: request.campaignId,
    criteria_fingerprint: request.criteriaFingerprint,
    evidence_version: request.evidenceVersion,
    workload_version: request.workloadVersion,
    mode: request.mode,
    status: request.status,
    attempt_count: request.attemptCount,
    lease_owner: request.leaseOwner,
    lease_expires_at: request.leaseExpiresAt,
    error_category: request.errorCategory,
    retry_after: request.retryAfter,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
    completed_at: request.completedAt,
  };
}

function toRequestPatch(patch: Partial<GrowthAssessmentRequest>) {
  const mapped: Record<string, unknown> = {};
  if ("status" in patch) mapped.status = patch.status;
  if ("attemptCount" in patch) mapped.attempt_count = patch.attemptCount;
  if ("leaseOwner" in patch) mapped.lease_owner = patch.leaseOwner;
  if ("leaseExpiresAt" in patch) mapped.lease_expires_at = patch.leaseExpiresAt;
  if ("errorCategory" in patch) mapped.error_category = patch.errorCategory;
  if ("retryAfter" in patch) mapped.retry_after = patch.retryAfter;
  if ("updatedAt" in patch) mapped.updated_at = patch.updatedAt;
  if ("completedAt" in patch) mapped.completed_at = patch.completedAt;
  return mapped;
}

function mapRequest(row: Record<string, unknown>): GrowthAssessmentRequest {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    campaignId: row.campaign_id as string,
    criteriaFingerprint: row.criteria_fingerprint as string,
    evidenceVersion: row.evidence_version as string,
    workloadVersion: row.workload_version as string,
    mode: row.mode as GrowthAssessmentRequest["mode"],
    status: row.status as GrowthAssessmentRequest["status"],
    attemptCount: Number(row.attempt_count),
    leaseOwner: (row.lease_owner as string | null) ?? null,
    leaseExpiresAt: (row.lease_expires_at as string | null) ?? null,
    errorCategory: (row.error_category as string | null) ?? null,
    retryAfter: (row.retry_after as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function toAssessmentRow(assessment: GrowthAssessment) {
  return {
    id: assessment.id,
    user_id: assessment.userId,
    campaign_id: assessment.campaignId,
    request_id: assessment.requestId,
    evidence_version: assessment.evidenceVersion,
    mode: assessment.mode,
    dimensions: assessment.dimensions,
    highest_priority_gap_key: assessment.highestPriorityGapKey,
    market_sample_size: assessment.marketSampleSize,
    market_evidence_summary: assessment.marketEvidenceSummary,
    input_fingerprint: assessment.inputFingerprint,
    workload_snapshot: assessment.workloadSnapshot,
    model: assessment.model,
    provider: assessment.provider,
    used_model: assessment.usedModel,
    created_at: assessment.createdAt,
  };
}

function mapAssessment(row: Record<string, unknown>): GrowthAssessment {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    campaignId: row.campaign_id as string,
    requestId: row.request_id as string,
    evidenceVersion: row.evidence_version as string,
    mode: row.mode as GrowthAssessment["mode"],
    dimensions: (row.dimensions as GrowthAssessment["dimensions"]) ?? [],
    highestPriorityGapKey: row.highest_priority_gap_key as GrowthAssessment["highestPriorityGapKey"],
    marketSampleSize: Number(row.market_sample_size),
    marketEvidenceSummary: (row.market_evidence_summary as string | null) ?? null,
    inputFingerprint: row.input_fingerprint as string,
    workloadSnapshot: row.workload_snapshot as GrowthAssessment["workloadSnapshot"],
    model: (row.model as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    usedModel: Boolean(row.used_model),
    createdAt: row.created_at as string,
  };
}

function toRecommendationRow(recommendation: GrowthRecommendation) {
  return {
    id: recommendation.id,
    user_id: recommendation.userId,
    campaign_id: recommendation.campaignId,
    assessment_id: recommendation.assessmentId,
    type: recommendation.type,
    gap_key: recommendation.gapKey,
    title: recommendation.title,
    summary: recommendation.summary,
    rationale: recommendation.rationale,
    evidence_gap: recommendation.evidenceGap,
    expected_evidence: recommendation.expectedEvidence,
    estimated_weeks: recommendation.estimatedWeeks,
    estimated_hours_per_week: recommendation.estimatedHoursPerWeek,
    proposed_milestones: recommendation.proposedMilestones,
    supporting_campaign_ids: recommendation.supportingCampaignIds,
    market_evidence_summary: recommendation.marketEvidenceSummary,
    status: recommendation.status,
    fingerprint: recommendation.fingerprint,
    current_proposal: recommendation.currentProposal,
    opened_at: recommendation.openedAt,
    accepted_at: recommendation.acceptedAt,
    completed_at: recommendation.completedAt,
    created_at: recommendation.createdAt,
    updated_at: recommendation.updatedAt,
  };
}

function toRecommendationPatch(patch: Partial<GrowthRecommendation>) {
  const mapped: Record<string, unknown> = {};
  if ("status" in patch) mapped.status = patch.status;
  if ("title" in patch) mapped.title = patch.title;
  if ("summary" in patch) mapped.summary = patch.summary;
  if ("rationale" in patch) mapped.rationale = patch.rationale;
  if ("evidenceGap" in patch) mapped.evidence_gap = patch.evidenceGap;
  if ("expectedEvidence" in patch) mapped.expected_evidence = patch.expectedEvidence;
  if ("estimatedWeeks" in patch) mapped.estimated_weeks = patch.estimatedWeeks;
  if ("estimatedHoursPerWeek" in patch) {
    mapped.estimated_hours_per_week = patch.estimatedHoursPerWeek;
  }
  if ("proposedMilestones" in patch) mapped.proposed_milestones = patch.proposedMilestones;
  if ("currentProposal" in patch) mapped.current_proposal = patch.currentProposal;
  if ("openedAt" in patch) mapped.opened_at = patch.openedAt;
  if ("acceptedAt" in patch) mapped.accepted_at = patch.acceptedAt;
  if ("completedAt" in patch) mapped.completed_at = patch.completedAt;
  if ("updatedAt" in patch) mapped.updated_at = patch.updatedAt;
  return mapped;
}

function mapRecommendation(row: Record<string, unknown>): GrowthRecommendation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    campaignId: row.campaign_id as string,
    assessmentId: row.assessment_id as string,
    type: row.type as GrowthRecommendation["type"],
    gapKey: row.gap_key as GrowthRecommendation["gapKey"],
    title: row.title as string,
    summary: row.summary as string,
    rationale: (row.rationale as string) ?? "",
    evidenceGap: (row.evidence_gap as string) ?? "",
    expectedEvidence: (row.expected_evidence as string[]) ?? [],
    estimatedWeeks: Number(row.estimated_weeks),
    estimatedHoursPerWeek: Number(row.estimated_hours_per_week),
    proposedMilestones:
      (row.proposed_milestones as GrowthRecommendation["proposedMilestones"]) ?? [],
    supportingCampaignIds: (row.supporting_campaign_ids as string[]) ?? [],
    marketEvidenceSummary: (row.market_evidence_summary as string | null) ?? null,
    status: row.status as GrowthRecommendation["status"],
    fingerprint: row.fingerprint as string,
    currentProposal:
      (row.current_proposal as GrowthRecommendation["currentProposal"]) ?? null,
    openedAt: (row.opened_at as string | null) ?? null,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapSuppression(row: Record<string, unknown>): GrowthSuppression {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    campaignId: row.campaign_id as string,
    gapKey: row.gap_key as GrowthSuppression["gapKey"],
    fingerprint: row.fingerprint as string,
    criteriaFingerprint: row.criteria_fingerprint as string,
    evidenceVersion: row.evidence_version as string,
    dismissalCategory: (row.dismissal_category as string | null) ?? null,
    dismissedAt: row.dismissed_at as string,
  };
}

function toProjectRow(project: GrowthProject) {
  return {
    id: project.id,
    user_id: project.userId,
    source_recommendation_id: project.sourceRecommendationId,
    title: project.title,
    objective: project.objective,
    status: project.status,
    start_date: project.startDate,
    target_date: project.targetDate,
    estimated_hours_per_week: project.estimatedHoursPerWeek,
    progress: project.progress,
    expected_evidence: project.expectedEvidence,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    completed_at: project.completedAt,
  };
}

function toProjectPatch(patch: Partial<GrowthProject>) {
  const mapped: Record<string, unknown> = {};
  if ("status" in patch) mapped.status = patch.status;
  if ("title" in patch) mapped.title = patch.title;
  if ("objective" in patch) mapped.objective = patch.objective;
  if ("startDate" in patch) mapped.start_date = patch.startDate;
  if ("targetDate" in patch) mapped.target_date = patch.targetDate;
  if ("estimatedHoursPerWeek" in patch) {
    mapped.estimated_hours_per_week = patch.estimatedHoursPerWeek;
  }
  if ("progress" in patch) mapped.progress = patch.progress;
  if ("completedAt" in patch) mapped.completed_at = patch.completedAt;
  if ("updatedAt" in patch) mapped.updated_at = patch.updatedAt;
  return mapped;
}

function mapProject(row: Record<string, unknown>, campaignIds: string[]): GrowthProject {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sourceRecommendationId: row.source_recommendation_id as string,
    title: row.title as string,
    objective: row.objective as string,
    status: row.status as GrowthProject["status"],
    startDate: String(row.start_date).slice(0, 10),
    targetDate: String(row.target_date).slice(0, 10),
    estimatedHoursPerWeek: Number(row.estimated_hours_per_week),
    progress: Number(row.progress),
    expectedEvidence: (row.expected_evidence as string[]) ?? [],
    supportingCampaignIds: campaignIds,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function toMilestoneRow(milestone: GrowthMilestone) {
  return {
    id: milestone.id,
    project_id: milestone.projectId,
    user_id: milestone.userId,
    position: milestone.position,
    title: milestone.title,
    description: milestone.description,
    estimated_hours: milestone.estimatedHours,
    target_date: milestone.targetDate,
    status: milestone.status,
    completed_at: milestone.completedAt,
  };
}

function mapMilestone(row: Record<string, unknown>): GrowthMilestone {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    userId: row.user_id as string,
    position: Number(row.position),
    title: row.title as string,
    description: (row.description as string) ?? "",
    estimatedHours: Number(row.estimated_hours),
    targetDate: row.target_date ? String(row.target_date).slice(0, 10) : null,
    status: row.status as GrowthMilestone["status"],
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function mapConversation(row: Record<string, unknown>): GrowthConversation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    recommendationId: row.recommendation_id as string,
    projectId: (row.project_id as string | null) ?? null,
    objectiveSnapshot: (row.objective_snapshot as string) ?? "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMessage(row: Record<string, unknown>): GrowthMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    userId: row.user_id as string,
    role: row.role as GrowthMessage["role"],
    content: row.content as string,
    createdAt: row.created_at as string,
  };
}
