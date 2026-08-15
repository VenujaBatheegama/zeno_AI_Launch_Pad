import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CareerCampaignRepository,
  CreateApplicationInput,
  CreatePacketInput,
  CreateRunInput,
  EnqueueNotificationInput,
  UpsertRecommendationInput,
} from "../application/ports";
import { CareerCampaignError } from "../domain/errors";
import type {
  ApplicationPacket,
  CampaignRun,
  FeedbackSignal,
  FitSummarySnapshot,
  GrowthAction,
  JobApplication,
  JobApplicationEvent,
  JobRecommendation,
  NotificationOutboxItem,
  ScoreSnapshot,
} from "../domain/schemas";

type RecommendationRow = {
  id: string;
  user_id: string;
  listing_id: string;
  job_match_analysis_id: string;
  campaign_run_id: string | null;
  job_search_campaign_id: string | null;
  status: JobRecommendation["status"];
  score_snapshot: ScoreSnapshot;
  fit_summary_snapshot: FitSummarySnapshot;
  scoring_policy_version: string;
  decision_reason: JobRecommendation["decisionReason"];
  decision_note: string | null;
  recommended_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PacketRow = {
  id: string;
  user_id: string;
  recommendation_id: string;
  listing_id: string;
  status: ApplicationPacket["status"];
  evidence_set_id: string | null;
  evidence_version: number | null;
  job_match_analysis_id: string | null;
  cv_variant_id: string | null;
  cover_letter_draft: string | null;
  cover_letter_meta: Record<string, unknown>;
  application_url: string | null;
  failure_code: string | null;
  failure_message: string | null;
  requested_at: string;
  ready_at: string | null;
  created_at: string;
  updated_at: string;
};

type ApplicationRow = {
  id: string;
  user_id: string;
  listing_id: string;
  recommendation_id: string;
  application_packet_id: string;
  cv_variant_id: string | null;
  status: JobApplication["status"];
  applied_at: string | null;
  follow_up_due_at: string | null;
  interview_at: string | null;
  outcome_at: string | null;
  user_note: string | null;
  created_at: string;
  updated_at: string;
};

type ApplicationEventRow = {
  id: string;
  application_id: string;
  user_id: string;
  from_status: JobApplication["status"] | null;
  to_status: JobApplication["status"];
  event_type: string;
  source: JobApplicationEvent["source"];
  metadata: Record<string, unknown>;
  idempotency_key: string;
  occurred_at: string;
  created_at: string;
};

type CampaignRunRow = {
  id: string;
  user_id: string;
  search_profile_id: string | null;
  trigger: CampaignRun["trigger"];
  status: CampaignRun["status"];
  idempotency_key: string;
  started_at: string | null;
  completed_at: string | null;
  discovered_count: number;
  deduplicated_count: number;
  analysed_count: number;
  recommended_count: number;
  failed_count: number;
  error_summary: string | null;
  checkpoint: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  event_type: string;
  channel: NotificationOutboxItem["channel"];
  related_entity_type: string;
  related_entity_id: string;
  status: NotificationOutboxItem["status"];
  payload: Record<string, unknown>;
  idempotency_key: string;
  scheduled_at: string;
  sent_at: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type FeedbackRow = {
  id: string;
  user_id: string;
  recommendation_id: string | null;
  signal_type: string;
  signal_value: string;
  weight: number;
  created_at: string;
};

type GrowthActionRow = {
  id: string;
  user_id: string;
  gap_key: string;
  gap_label: string;
  frequency: number;
  affected_listing_ids: string[];
  why_it_matters: string;
  suggested_action: string;
  evidence_artifact: string;
  coverage_impact: string;
  status: GrowthAction["status"];
  created_at: string;
  updated_at: string;
};

type CronCheckpointRow = {
  id: string;
  cursor_user_id: string | null;
  bucket_key: string;
  updated_at: string;
};

type WhatsAppLinkRow = {
  user_id: string;
  wa_id: string;
  opted_in_at: string | null;
  opted_out_at: string | null;
};

const ACTIVE_RECOMMENDATION_STATUSES = [
  "pending_review",
  "saved",
  "accepted",
] as const;

export class SupabaseCareerCampaignRepository
  implements CareerCampaignRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async createOrGetRun(input: CreateRunInput): Promise<{
    run: CampaignRun;
    created: boolean;
  }> {
    const { data, error } = await this.client
      .from("campaign_runs")
      .insert({
        id: input.id,
        user_id: input.userId,
        search_profile_id: input.searchProfileId,
        trigger: input.trigger,
        status: "queued",
        idempotency_key: input.idempotencyKey,
        created_at: input.createdAt,
        updated_at: input.createdAt,
      })
      .select()
      .single();

    if (!error && data) {
      return { run: mapRun(data as CampaignRunRow), created: true };
    }

    if (isUniqueViolation(error)) {
      const existing = await this.getRunByIdempotencyKey(input.idempotencyKey);
      if (existing) return { run: existing, created: false };
    }

    throw persistenceError("Campaign run could not be created.", error);
  }

  async getRunByIdempotencyKey(key: string): Promise<CampaignRun | null> {
    const { data, error } = await this.client
      .from("campaign_runs")
      .select()
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) {
      throw persistenceError("Campaign run could not be loaded.", error);
    }
    return data ? mapRun(data as CampaignRunRow) : null;
  }

  async getRun(userId: string, runId: string): Promise<CampaignRun | null> {
    const { data, error } = await this.client
      .from("campaign_runs")
      .select()
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle();
    if (error) {
      throw persistenceError("Campaign run could not be loaded.", error);
    }
    return data ? mapRun(data as CampaignRunRow) : null;
  }

  async updateRun(
    userId: string,
    runId: string,
    patch: Partial<{
      status: CampaignRun["status"];
      searchProfileId: string | null;
      startedAt: string | null;
      completedAt: string | null;
      discoveredCount: number;
      deduplicatedCount: number;
      analysedCount: number;
      recommendedCount: number;
      failedCount: number;
      errorSummary: string | null;
      checkpoint: Record<string, unknown>;
    }>,
  ): Promise<CampaignRun> {
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.searchProfileId !== undefined) {
      payload.search_profile_id = patch.searchProfileId;
    }
    if (patch.startedAt !== undefined) payload.started_at = patch.startedAt;
    if (patch.completedAt !== undefined) {
      payload.completed_at = patch.completedAt;
    }
    if (patch.discoveredCount !== undefined) {
      payload.discovered_count = patch.discoveredCount;
    }
    if (patch.deduplicatedCount !== undefined) {
      payload.deduplicated_count = patch.deduplicatedCount;
    }
    if (patch.analysedCount !== undefined) {
      payload.analysed_count = patch.analysedCount;
    }
    if (patch.recommendedCount !== undefined) {
      payload.recommended_count = patch.recommendedCount;
    }
    if (patch.failedCount !== undefined) {
      payload.failed_count = patch.failedCount;
    }
    if (patch.errorSummary !== undefined) {
      payload.error_summary = patch.errorSummary;
    }
    if (patch.checkpoint !== undefined) payload.checkpoint = patch.checkpoint;

    const { data, error } = await this.client
      .from("campaign_runs")
      .update(payload)
      .eq("user_id", userId)
      .eq("id", runId)
      .select()
      .maybeSingle();
    if (error) {
      throw persistenceError("Campaign run could not be updated.", error);
    }
    if (!data) {
      throw new CareerCampaignError("NOT_FOUND", "Campaign run not found.");
    }
    return mapRun(data as CampaignRunRow);
  }

  async listRecentRuns(userId: string, limit: number): Promise<CampaignRun[]> {
    const { data, error } = await this.client
      .from("campaign_runs")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw persistenceError("Campaign runs could not be listed.", error);
    }
    return ((data ?? []) as CampaignRunRow[]).map(mapRun);
  }

  async findActiveRun(userId: string): Promise<CampaignRun | null> {
    const { data, error } = await this.client
      .from("campaign_runs")
      .select()
      .eq("user_id", userId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw persistenceError("Active campaign run could not be loaded.", error);
    }
    return data ? mapRun(data as CampaignRunRow) : null;
  }

  async upsertRecommendation(input: UpsertRecommendationInput): Promise<{
    recommendation: JobRecommendation;
    created: boolean;
  }> {
    const { data, error } = await this.client
      .from("job_recommendations")
      .insert({
        id: input.id,
        user_id: input.userId,
        listing_id: input.listingId,
        job_match_analysis_id: input.jobMatchAnalysisId,
        campaign_run_id: input.campaignRunId,
        job_search_campaign_id: input.jobSearchCampaignId ?? null,
        status: "pending_review",
        score_snapshot: input.scoreSnapshot,
        fit_summary_snapshot: input.fitSummarySnapshot,
        scoring_policy_version: input.scoringPolicyVersion,
        recommended_at: input.recommendedAt,
        created_at: input.recommendedAt,
        updated_at: input.recommendedAt,
      })
      .select()
      .single();

    if (!error && data) {
      return {
        recommendation: mapRecommendation(data as RecommendationRow),
        created: true,
      };
    }

    if (isUniqueViolation(error)) {
      const existing = await this.findExistingRecommendationOnConflict(input);
      if (existing) {
        return { recommendation: existing, created: false };
      }
    }

    throw persistenceError("Recommendation could not be saved.", error);
  }

  async listRecommendations(input: {
    userId: string;
    statuses?: JobRecommendation["status"][];
    limit?: number;
  }): Promise<JobRecommendation[]> {
    let query = this.client
      .from("job_recommendations")
      .select()
      .eq("user_id", input.userId)
      .order("recommended_at", { ascending: false })
      .limit(input.limit ?? 50);
    if (input.statuses && input.statuses.length > 0) {
      query = query.in("status", input.statuses);
    }
    const { data, error } = await query;
    if (error) {
      throw persistenceError("Recommendations could not be listed.", error);
    }
    return ((data ?? []) as RecommendationRow[]).map(mapRecommendation);
  }

  async getRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<JobRecommendation | null> {
    const { data, error } = await this.client
      .from("job_recommendations")
      .select()
      .eq("user_id", userId)
      .eq("id", recommendationId)
      .maybeSingle();
    if (error) {
      throw persistenceError("Recommendation could not be loaded.", error);
    }
    return data ? mapRecommendation(data as RecommendationRow) : null;
  }

  async updateRecommendationDecision(input: {
    userId: string;
    recommendationId: string;
    status: Extract<
      JobRecommendation["status"],
      "saved" | "accepted" | "rejected"
    >;
    decisionReason?: JobRecommendation["decisionReason"];
    decisionNote?: string | null;
    reviewedAt: string;
  }): Promise<JobRecommendation> {
    const payload: Record<string, unknown> = {
      status: input.status,
      reviewed_at: input.reviewedAt,
    };
    if (input.decisionReason !== undefined) {
      payload.decision_reason = input.decisionReason;
    }
    if (input.decisionNote !== undefined) {
      payload.decision_note = input.decisionNote;
    }

    const { data, error } = await this.client
      .from("job_recommendations")
      .update(payload)
      .eq("user_id", input.userId)
      .eq("id", input.recommendationId)
      .select()
      .maybeSingle();
    if (error) {
      throw persistenceError(
        "Recommendation decision could not be saved.",
        error,
      );
    }
    if (!data) {
      throw new CareerCampaignError("NOT_FOUND", "Recommendation not found.");
    }
    return mapRecommendation(data as RecommendationRow);
  }

  async listListingIdsWithActiveRecommendations(
    userId: string,
  ): Promise<Set<string>> {
    const { data, error } = await this.client
      .from("job_recommendations")
      .select("listing_id")
      .eq("user_id", userId)
      .in("status", [...ACTIVE_RECOMMENDATION_STATUSES]);
    if (error) {
      throw persistenceError(
        "Active recommendation listings could not be loaded.",
        error,
      );
    }
    return new Set(
      ((data ?? []) as Array<{ listing_id: string }>).map(
        (row) => row.listing_id,
      ),
    );
  }

  async listRejectedOrAppliedListingIds(userId: string): Promise<Set<string>> {
    const [rejectedResult, appliedResult] = await Promise.all([
      this.client
        .from("job_recommendations")
        .select("listing_id")
        .eq("user_id", userId)
        .eq("status", "rejected"),
      this.client
        .from("job_applications")
        .select("listing_id")
        .eq("user_id", userId)
        .in("status", ["applied", "interview", "rejected", "offer"]),
    ]);

    if (rejectedResult.error) {
      throw persistenceError(
        "Rejected listings could not be loaded.",
        rejectedResult.error,
      );
    }
    if (appliedResult.error) {
      throw persistenceError(
        "Applied listings could not be loaded.",
        appliedResult.error,
      );
    }

    return new Set([
      ...((rejectedResult.data ?? []) as Array<{ listing_id: string }>).map(
        (row) => row.listing_id,
      ),
      ...((appliedResult.data ?? []) as Array<{ listing_id: string }>).map(
        (row) => row.listing_id,
      ),
    ]);
  }

  async createOrGetPacket(input: CreatePacketInput): Promise<{
    packet: ApplicationPacket;
    created: boolean;
  }> {
    const { data, error } = await this.client
      .from("application_packets")
      .insert({
        id: input.id,
        user_id: input.userId,
        recommendation_id: input.recommendationId,
        listing_id: input.listingId,
        status: "requested",
        evidence_set_id: input.evidenceSetId,
        evidence_version: input.evidenceVersion,
        job_match_analysis_id: input.jobMatchAnalysisId,
        application_url: input.applicationUrl,
        requested_at: input.requestedAt,
        created_at: input.requestedAt,
        updated_at: input.requestedAt,
      })
      .select()
      .single();

    if (!error && data) {
      return { packet: mapPacket(data as PacketRow), created: true };
    }

    if (isUniqueViolation(error)) {
      const existing = await this.getPacketByRecommendation(
        input.userId,
        input.recommendationId,
      );
      if (existing) return { packet: existing, created: false };
    }

    throw persistenceError("Application packet could not be created.", error);
  }

  async getPacket(
    userId: string,
    packetId: string,
  ): Promise<ApplicationPacket | null> {
    const { data, error } = await this.client
      .from("application_packets")
      .select()
      .eq("user_id", userId)
      .eq("id", packetId)
      .maybeSingle();
    if (error) {
      throw persistenceError("Application packet could not be loaded.", error);
    }
    return data ? mapPacket(data as PacketRow) : null;
  }

  async getPacketByRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<ApplicationPacket | null> {
    const { data, error } = await this.client
      .from("application_packets")
      .select()
      .eq("user_id", userId)
      .eq("recommendation_id", recommendationId)
      .maybeSingle();
    if (error) {
      throw persistenceError("Application packet could not be loaded.", error);
    }
    return data ? mapPacket(data as PacketRow) : null;
  }

  async countReadyPackets(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from("application_packets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "ready");
    if (error) {
      throw persistenceError("Ready packets could not be counted.", error);
    }
    return count ?? 0;
  }

  async updatePacket(
    userId: string,
    packetId: string,
    patch: Partial<{
      status: ApplicationPacket["status"];
      cvVariantId: string | null;
      coverLetterDraft: string | null;
      coverLetterMeta: Record<string, unknown>;
      applicationUrl: string | null;
      failureCode: string | null;
      failureMessage: string | null;
      readyAt: string | null;
      evidenceSetId: string | null;
      evidenceVersion: number | null;
      jobMatchAnalysisId: string | null;
    }>,
  ): Promise<ApplicationPacket> {
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.cvVariantId !== undefined) {
      payload.cv_variant_id = patch.cvVariantId;
    }
    if (patch.coverLetterDraft !== undefined) {
      payload.cover_letter_draft = patch.coverLetterDraft;
    }
    if (patch.coverLetterMeta !== undefined) {
      payload.cover_letter_meta = patch.coverLetterMeta;
    }
    if (patch.applicationUrl !== undefined) {
      payload.application_url = patch.applicationUrl;
    }
    if (patch.failureCode !== undefined) {
      payload.failure_code = patch.failureCode;
    }
    if (patch.failureMessage !== undefined) {
      payload.failure_message = patch.failureMessage;
    }
    if (patch.readyAt !== undefined) payload.ready_at = patch.readyAt;
    if (patch.evidenceSetId !== undefined) {
      payload.evidence_set_id = patch.evidenceSetId;
    }
    if (patch.evidenceVersion !== undefined) {
      payload.evidence_version = patch.evidenceVersion;
    }
    if (patch.jobMatchAnalysisId !== undefined) {
      payload.job_match_analysis_id = patch.jobMatchAnalysisId;
    }

    const { data, error } = await this.client
      .from("application_packets")
      .update(payload)
      .eq("user_id", userId)
      .eq("id", packetId)
      .select()
      .maybeSingle();
    if (error) {
      throw persistenceError("Application packet could not be updated.", error);
    }
    if (!data) {
      throw new CareerCampaignError(
        "NOT_FOUND",
        "Application packet not found.",
      );
    }
    return mapPacket(data as PacketRow);
  }

  async createOrGetApplication(input: CreateApplicationInput): Promise<{
    application: JobApplication;
    created: boolean;
  }> {
    const { data, error } = await this.client
      .from("job_applications")
      .insert({
        id: input.id,
        user_id: input.userId,
        listing_id: input.listingId,
        recommendation_id: input.recommendationId,
        application_packet_id: input.applicationPacketId,
        cv_variant_id: input.cvVariantId,
        status: input.status,
        created_at: input.createdAt,
        updated_at: input.createdAt,
      })
      .select()
      .single();

    if (!error && data) {
      return {
        application: mapApplication(data as ApplicationRow),
        created: true,
      };
    }

    if (isUniqueViolation(error)) {
      const existing = await this.getApplicationByListing(
        input.userId,
        input.listingId,
      );
      if (existing) return { application: existing, created: false };
    }

    throw persistenceError("Job application could not be created.", error);
  }

  async getApplication(
    userId: string,
    applicationId: string,
  ): Promise<JobApplication | null> {
    const { data, error } = await this.client
      .from("job_applications")
      .select()
      .eq("user_id", userId)
      .eq("id", applicationId)
      .maybeSingle();
    if (error) {
      throw persistenceError("Job application could not be loaded.", error);
    }
    return data ? mapApplication(data as ApplicationRow) : null;
  }

  async getApplicationByListing(
    userId: string,
    listingId: string,
  ): Promise<JobApplication | null> {
    const { data, error } = await this.client
      .from("job_applications")
      .select()
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .maybeSingle();
    if (error) {
      throw persistenceError("Job application could not be loaded.", error);
    }
    return data ? mapApplication(data as ApplicationRow) : null;
  }

  async listApplications(input: {
    userId: string;
    statuses?: JobApplication["status"][];
    limit?: number;
  }): Promise<JobApplication[]> {
    let query = this.client
      .from("job_applications")
      .select()
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 50);
    if (input.statuses && input.statuses.length > 0) {
      query = query.in("status", input.statuses);
    }
    const { data, error } = await query;
    if (error) {
      throw persistenceError("Job applications could not be listed.", error);
    }
    return ((data ?? []) as ApplicationRow[]).map(mapApplication);
  }

  async updateApplication(
    userId: string,
    applicationId: string,
    patch: Partial<{
      status: JobApplication["status"];
      appliedAt: string | null;
      followUpDueAt: string | null;
      interviewAt: string | null;
      outcomeAt: string | null;
      userNote: string | null;
      cvVariantId: string | null;
    }>,
  ): Promise<JobApplication> {
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.appliedAt !== undefined) payload.applied_at = patch.appliedAt;
    if (patch.followUpDueAt !== undefined) {
      payload.follow_up_due_at = patch.followUpDueAt;
    }
    if (patch.interviewAt !== undefined) {
      payload.interview_at = patch.interviewAt;
    }
    if (patch.outcomeAt !== undefined) payload.outcome_at = patch.outcomeAt;
    if (patch.userNote !== undefined) payload.user_note = patch.userNote;
    if (patch.cvVariantId !== undefined) {
      payload.cv_variant_id = patch.cvVariantId;
    }

    const { data, error } = await this.client
      .from("job_applications")
      .update(payload)
      .eq("user_id", userId)
      .eq("id", applicationId)
      .select()
      .maybeSingle();
    if (error) {
      throw persistenceError("Job application could not be updated.", error);
    }
    if (!data) {
      throw new CareerCampaignError("NOT_FOUND", "Application not found.");
    }
    return mapApplication(data as ApplicationRow);
  }

  async appendApplicationEvent(input: {
    id: string;
    applicationId: string;
    userId: string;
    fromStatus: JobApplication["status"] | null;
    toStatus: JobApplication["status"];
    eventType: string;
    source: JobApplicationEvent["source"];
    metadata: Record<string, unknown>;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<{ event: JobApplicationEvent; created: boolean }> {
    const { data, error } = await this.client
      .from("job_application_events")
      .insert({
        id: input.id,
        application_id: input.applicationId,
        user_id: input.userId,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        event_type: input.eventType,
        source: input.source,
        metadata: input.metadata,
        idempotency_key: input.idempotencyKey,
        occurred_at: input.occurredAt,
        created_at: input.occurredAt,
      })
      .select()
      .single();

    if (!error && data) {
      return {
        event: mapApplicationEvent(data as ApplicationEventRow),
        created: true,
      };
    }

    if (isUniqueViolation(error)) {
      const { data: existing, error: fetchError } = await this.client
        .from("job_application_events")
        .select()
        .eq("user_id", input.userId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (fetchError) {
        throw persistenceError(
          "Application event could not be loaded.",
          fetchError,
        );
      }
      if (existing) {
        return {
          event: mapApplicationEvent(existing as ApplicationEventRow),
          created: false,
        };
      }
    }

    throw persistenceError("Application event could not be appended.", error);
  }

  async listApplicationEvents(
    userId: string,
    applicationId: string,
  ): Promise<JobApplicationEvent[]> {
    const { data, error } = await this.client
      .from("job_application_events")
      .select()
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .order("occurred_at", { ascending: true });
    if (error) {
      throw persistenceError("Application events could not be listed.", error);
    }
    return ((data ?? []) as ApplicationEventRow[]).map(mapApplicationEvent);
  }

  async findDueFollowUps(input: {
    userId?: string;
    asOf: string;
    limit: number;
  }): Promise<JobApplication[]> {
    let query = this.client
      .from("job_applications")
      .select()
      .eq("status", "applied")
      .not("follow_up_due_at", "is", null)
      .lte("follow_up_due_at", input.asOf)
      .order("follow_up_due_at", { ascending: true })
      .limit(input.limit);
    if (input.userId) {
      query = query.eq("user_id", input.userId);
    }
    const { data, error } = await query;
    if (error) {
      throw persistenceError("Due follow-ups could not be loaded.", error);
    }
    return ((data ?? []) as ApplicationRow[]).map(mapApplication);
  }

  async enqueueNotification(input: EnqueueNotificationInput): Promise<{
    item: NotificationOutboxItem;
    created: boolean;
  }> {
    const { data, error } = await this.client
      .from("notification_outbox")
      .insert({
        id: input.id,
        user_id: input.userId,
        event_type: input.eventType,
        channel: input.channel,
        related_entity_type: input.relatedEntityType,
        related_entity_id: input.relatedEntityId,
        status: "pending",
        payload: input.payload,
        idempotency_key: input.idempotencyKey,
        scheduled_at: input.scheduledAt,
        created_at: input.scheduledAt,
        updated_at: input.scheduledAt,
      })
      .select()
      .single();

    if (!error && data) {
      return { item: mapNotification(data as NotificationRow), created: true };
    }

    if (isUniqueViolation(error)) {
      const { data: existing, error: fetchError } = await this.client
        .from("notification_outbox")
        .select()
        .eq("user_id", input.userId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (fetchError) {
        throw persistenceError(
          "Notification could not be loaded.",
          fetchError,
        );
      }
      if (existing) {
        return {
          item: mapNotification(existing as NotificationRow),
          created: false,
        };
      }
    }

    throw persistenceError("Notification could not be enqueued.", error);
  }

  async claimPendingNotifications(input: {
    channel?: NotificationOutboxItem["channel"];
    limit: number;
    now: string;
  }): Promise<NotificationOutboxItem[]> {
    let query = this.client
      .from("notification_outbox")
      .select()
      .in("status", ["pending", "failed"])
      .lte("scheduled_at", input.now)
      .order("scheduled_at", { ascending: true })
      .limit(input.limit);
    if (input.channel) {
      query = query.eq("channel", input.channel);
    }

    const { data, error } = await query;
    if (error) {
      throw persistenceError(
        "Pending notifications could not be claimed.",
        error,
      );
    }

    const claimed: NotificationOutboxItem[] = [];
    for (const row of (data ?? []) as NotificationRow[]) {
      const { data: updated, error: updateError } = await this.client
        .from("notification_outbox")
        .update({
          status: "processing",
          attempt_count: row.attempt_count + 1,
        })
        .eq("id", row.id)
        .eq("user_id", row.user_id)
        .in("status", ["pending", "failed"])
        .select()
        .maybeSingle();

      if (updateError) {
        throw persistenceError(
          "Pending notification could not be claimed.",
          updateError,
        );
      }
      if (updated) {
        claimed.push(mapNotification(updated as NotificationRow));
      }
    }

    return claimed;
  }

  async updateNotification(
    id: string,
    patch: Partial<{
      status: NotificationOutboxItem["status"];
      sentAt: string | null;
      attemptCount: number;
      lastError: string | null;
    }>,
  ): Promise<NotificationOutboxItem> {
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.sentAt !== undefined) payload.sent_at = patch.sentAt;
    if (patch.attemptCount !== undefined) {
      payload.attempt_count = patch.attemptCount;
    }
    if (patch.lastError !== undefined) payload.last_error = patch.lastError;

    const { data, error } = await this.client
      .from("notification_outbox")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) {
      throw persistenceError("Notification could not be updated.", error);
    }
    if (!data) {
      throw new CareerCampaignError("NOT_FOUND", "Notification not found.");
    }
    return mapNotification(data as NotificationRow);
  }

  async listNotifications(input: {
    userId: string;
    limit?: number;
  }): Promise<NotificationOutboxItem[]> {
    const { data, error } = await this.client
      .from("notification_outbox")
      .select()
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 50);
    if (error) {
      throw persistenceError("Notifications could not be listed.", error);
    }
    return ((data ?? []) as NotificationRow[]).map(mapNotification);
  }

  async suppressNotificationsForEntity(input: {
    userId: string;
    relatedEntityType: string;
    relatedEntityId: string;
    eventTypes?: string[];
  }): Promise<number> {
    let query = this.client
      .from("notification_outbox")
      .update({ status: "suppressed" }, { count: "exact" })
      .eq("user_id", input.userId)
      .eq("related_entity_type", input.relatedEntityType)
      .eq("related_entity_id", input.relatedEntityId)
      .in("status", ["pending", "failed"]);
    if (input.eventTypes && input.eventTypes.length > 0) {
      query = query.in("event_type", input.eventTypes);
    }
    const { error, count } = await query;
    if (error) {
      throw persistenceError(
        "Notifications could not be suppressed.",
        error,
      );
    }
    return count ?? 0;
  }

  async addFeedbackSignal(input: {
    id: string;
    userId: string;
    recommendationId: string | null;
    signalType: string;
    signalValue: string;
    weight: number;
    createdAt: string;
  }): Promise<FeedbackSignal> {
    const { data, error } = await this.client
      .from("campaign_feedback_signals")
      .insert({
        id: input.id,
        user_id: input.userId,
        recommendation_id: input.recommendationId,
        signal_type: input.signalType,
        signal_value: input.signalValue,
        weight: input.weight,
        created_at: input.createdAt,
      })
      .select()
      .single();
    if (error) {
      throw persistenceError("Feedback signal could not be saved.", error);
    }
    return mapFeedback(data as FeedbackRow);
  }

  async listFeedbackSignals(userId: string): Promise<FeedbackSignal[]> {
    const { data, error } = await this.client
      .from("campaign_feedback_signals")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      throw persistenceError("Feedback signals could not be listed.", error);
    }
    return ((data ?? []) as FeedbackRow[]).map(mapFeedback);
  }

  async upsertGrowthAction(
    input: Omit<GrowthAction, "updatedAt"> & { updatedAt?: string },
  ): Promise<GrowthAction> {
    const updatedAt = input.updatedAt ?? new Date().toISOString();

    const { data: existing, error: findError } = await this.client
      .from("campaign_growth_actions")
      .select()
      .eq("user_id", input.userId)
      .eq("gap_key", input.gapKey)
      .eq("status", "active")
      .maybeSingle();
    if (findError) {
      throw persistenceError("Growth action could not be loaded.", findError);
    }

    if (existing) {
      const { data, error } = await this.client
        .from("campaign_growth_actions")
        .update({
          gap_label: input.gapLabel,
          frequency: input.frequency,
          affected_listing_ids: input.affectedListingIds,
          why_it_matters: input.whyItMatters,
          suggested_action: input.suggestedAction,
          evidence_artifact: input.evidenceArtifact,
          coverage_impact: input.coverageImpact,
          status: input.status,
          updated_at: updatedAt,
        })
        .eq("user_id", input.userId)
        .eq("id", (existing as GrowthActionRow).id)
        .select()
        .single();
      if (error) {
        throw persistenceError("Growth action could not be updated.", error);
      }
      return mapGrowthAction(data as GrowthActionRow);
    }

    const { data, error } = await this.client
      .from("campaign_growth_actions")
      .insert({
        id: input.id,
        user_id: input.userId,
        gap_key: input.gapKey,
        gap_label: input.gapLabel,
        frequency: input.frequency,
        affected_listing_ids: input.affectedListingIds,
        why_it_matters: input.whyItMatters,
        suggested_action: input.suggestedAction,
        evidence_artifact: input.evidenceArtifact,
        coverage_impact: input.coverageImpact,
        status: input.status,
        created_at: input.createdAt,
        updated_at: updatedAt,
      })
      .select()
      .single();

    if (!error && data) {
      return mapGrowthAction(data as GrowthActionRow);
    }

    if (isUniqueViolation(error)) {
      const { data: conflicted, error: refetchError } = await this.client
        .from("campaign_growth_actions")
        .select()
        .eq("user_id", input.userId)
        .eq("gap_key", input.gapKey)
        .eq("status", "active")
        .maybeSingle();
      if (refetchError) {
        throw persistenceError(
          "Growth action could not be loaded.",
          refetchError,
        );
      }
      if (conflicted) {
        const { data: updated, error: updateError } = await this.client
          .from("campaign_growth_actions")
          .update({
            gap_label: input.gapLabel,
            frequency: input.frequency,
            affected_listing_ids: input.affectedListingIds,
            why_it_matters: input.whyItMatters,
            suggested_action: input.suggestedAction,
            evidence_artifact: input.evidenceArtifact,
            coverage_impact: input.coverageImpact,
            status: input.status,
            updated_at: updatedAt,
          })
          .eq("user_id", input.userId)
          .eq("id", (conflicted as GrowthActionRow).id)
          .select()
          .single();
        if (updateError) {
          throw persistenceError(
            "Growth action could not be updated.",
            updateError,
          );
        }
        return mapGrowthAction(updated as GrowthActionRow);
      }
    }

    throw persistenceError("Growth action could not be saved.", error);
  }

  async listGrowthActions(userId: string): Promise<GrowthAction[]> {
    const { data, error } = await this.client
      .from("campaign_growth_actions")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      throw persistenceError("Growth actions could not be listed.", error);
    }
    return ((data ?? []) as GrowthActionRow[]).map(mapGrowthAction);
  }

  async listEligibleUserIds(input: {
    afterUserId: string | null;
    limit: number;
  }): Promise<string[]> {
    let query = this.client
      .from("job_search_profiles")
      .select("user_id")
      .order("user_id", { ascending: true })
      .limit(input.limit);
    if (input.afterUserId) {
      query = query.gt("user_id", input.afterUserId);
    }
    const { data, error } = await query;
    if (error) {
      throw persistenceError("Eligible user ids could not be listed.", error);
    }
    const ids = ((data ?? []) as Array<{ user_id: string }>).map(
      (row) => row.user_id,
    );
    return [...new Set(ids)];
  }

  async getCronCheckpoint(bucketKey: string): Promise<{
    cursorUserId: string | null;
    bucketKey: string;
  } | null> {
    const { data, error } = await this.client
      .from("campaign_cron_checkpoints")
      .select()
      .eq("bucket_key", bucketKey)
      .maybeSingle();
    if (error) {
      throw persistenceError("Cron checkpoint could not be loaded.", error);
    }
    if (!data) return null;
    const row = data as CronCheckpointRow;
    return {
      cursorUserId: row.cursor_user_id,
      bucketKey: row.bucket_key,
    };
  }

  async saveCronCheckpoint(input: {
    bucketKey: string;
    cursorUserId: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("campaign_cron_checkpoints").upsert(
      {
        id: input.bucketKey,
        bucket_key: input.bucketKey,
        cursor_user_id: input.cursorUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      throw persistenceError("Cron checkpoint could not be saved.", error);
    }
  }

  async getWhatsAppLink(userId: string): Promise<{
    userId: string;
    waId: string;
    optedInAt: string | null;
    optedOutAt: string | null;
  } | null> {
    const { data, error } = await this.client
      .from("whatsapp_user_links")
      .select()
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw persistenceError("WhatsApp link could not be loaded.", error);
    }
    if (!data) return null;
    const row = data as WhatsAppLinkRow;
    return {
      userId: row.user_id,
      waId: row.wa_id,
      optedInAt: row.opted_in_at,
      optedOutAt: row.opted_out_at,
    };
  }

  async getUserIdByWhatsAppId(waId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("whatsapp_user_links")
      .select("user_id")
      .eq("wa_id", waId)
      .maybeSingle();
    if (error) {
      throw persistenceError("WhatsApp user could not be resolved.", error);
    }
    return data ? (data as { user_id: string }).user_id : null;
  }

  async createWhatsAppLinkCode(input: {
    id: string;
    userId: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void> {
    const { error: invalidateError } = await this.client
      .from("whatsapp_link_codes")
      .update({ used_at: input.createdAt })
      .eq("user_id", input.userId)
      .is("used_at", null);
    if (invalidateError) {
      throw persistenceError(
        "Previous WhatsApp connection codes could not be invalidated.",
        invalidateError,
      );
    }

    const { error } = await this.client.from("whatsapp_link_codes").insert({
      id: input.id,
      user_id: input.userId,
      code_hash: input.codeHash,
      expires_at: input.expiresAt,
      created_at: input.createdAt,
    });
    if (error) {
      throw persistenceError(
        "WhatsApp connection code could not be saved.",
        error,
      );
    }
  }

  async claimWhatsAppLinkCode(input: {
    codeHash: string;
    waId: string;
    claimedAt: string;
  }): Promise<string | null> {
    const { data, error } = await this.client.rpc("claim_whatsapp_link_code", {
      p_code_hash: input.codeHash,
      p_wa_id: input.waId,
      p_claimed_at: input.claimedAt,
    });
    if (error) {
      throw persistenceError(
        "WhatsApp connection code could not be claimed.",
        error,
      );
    }
    return typeof data === "string" ? data : null;
  }

  async claimWhatsAppInboundMessage(input: {
    messageId: string;
    waId: string;
    receivedAt: string;
  }): Promise<boolean> {
    const { error } = await this.client
      .from("whatsapp_inbound_messages")
      .insert({
        message_id: input.messageId,
        wa_id: input.waId,
        received_at: input.receivedAt,
      });
    if (!error) return true;
    if (isUniqueViolation(error)) return false;
    throw persistenceError("WhatsApp message could not be claimed.", error);
  }

  async deleteWhatsAppLink(userId: string): Promise<void> {
    const { error } = await this.client
      .from("whatsapp_user_links")
      .delete()
      .eq("user_id", userId);
    if (error) {
      throw persistenceError("WhatsApp connection could not be removed.", error);
    }
  }

  async setWhatsAppOptIn(userId: string, at: string): Promise<void> {
    const { error } = await this.client
      .from("whatsapp_user_links")
      .update({ opted_in_at: at, opted_out_at: null })
      .eq("user_id", userId);
    if (error) {
      throw persistenceError("WhatsApp opt-in could not be saved.", error);
    }
  }

  async setWhatsAppOptOut(userId: string, at: string): Promise<void> {
    const { error } = await this.client
      .from("whatsapp_user_links")
      .update({ opted_out_at: at })
      .eq("user_id", userId);
    if (error) {
      throw persistenceError("WhatsApp opt-out could not be saved.", error);
    }
  }

  private async findExistingRecommendationOnConflict(
    input: UpsertRecommendationInput,
  ): Promise<JobRecommendation | null> {
    const byListing = await this.client
      .from("job_recommendations")
      .select()
      .eq("user_id", input.userId)
      .eq("listing_id", input.listingId)
      .in("status", [...ACTIVE_RECOMMENDATION_STATUSES])
      .maybeSingle();
    if (byListing.error) {
      throw persistenceError(
        "Recommendation could not be loaded.",
        byListing.error,
      );
    }
    if (byListing.data) {
      return mapRecommendation(byListing.data as RecommendationRow);
    }

    const byAnalysis = await this.client
      .from("job_recommendations")
      .select()
      .eq("user_id", input.userId)
      .eq("job_match_analysis_id", input.jobMatchAnalysisId)
      .maybeSingle();
    if (byAnalysis.error) {
      throw persistenceError(
        "Recommendation could not be loaded.",
        byAnalysis.error,
      );
    }
    return byAnalysis.data
      ? mapRecommendation(byAnalysis.data as RecommendationRow)
      : null;
  }
}

function mapRecommendation(row: RecommendationRow): JobRecommendation {
  return {
    id: row.id,
    userId: row.user_id,
    listingId: row.listing_id,
    jobMatchAnalysisId: row.job_match_analysis_id,
    campaignRunId: row.campaign_run_id,
    jobSearchCampaignId: row.job_search_campaign_id ?? null,
    status: row.status,
    scoreSnapshot: row.score_snapshot,
    fitSummarySnapshot: row.fit_summary_snapshot,
    scoringPolicyVersion: row.scoring_policy_version,
    decisionReason: row.decision_reason,
    decisionNote: row.decision_note,
    recommendedAt: row.recommended_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPacket(row: PacketRow): ApplicationPacket {
  return {
    id: row.id,
    userId: row.user_id,
    recommendationId: row.recommendation_id,
    listingId: row.listing_id,
    status: row.status,
    evidenceSetId: row.evidence_set_id,
    evidenceVersion: row.evidence_version,
    jobMatchAnalysisId: row.job_match_analysis_id,
    cvVariantId: row.cv_variant_id,
    coverLetterDraft: row.cover_letter_draft,
    coverLetterMeta: row.cover_letter_meta ?? {},
    applicationUrl: row.application_url,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    requestedAt: row.requested_at,
    readyAt: row.ready_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApplication(row: ApplicationRow): JobApplication {
  return {
    id: row.id,
    userId: row.user_id,
    listingId: row.listing_id,
    recommendationId: row.recommendation_id,
    applicationPacketId: row.application_packet_id,
    cvVariantId: row.cv_variant_id,
    status: row.status,
    appliedAt: row.applied_at,
    followUpDueAt: row.follow_up_due_at,
    interviewAt: row.interview_at,
    outcomeAt: row.outcome_at,
    userNote: row.user_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApplicationEvent(row: ApplicationEventRow): JobApplicationEvent {
  return {
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    eventType: row.event_type,
    source: row.source,
    metadata: row.metadata ?? {},
    idempotencyKey: row.idempotency_key,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

function mapRun(row: CampaignRunRow): CampaignRun {
  return {
    id: row.id,
    userId: row.user_id,
    searchProfileId: row.search_profile_id,
    trigger: row.trigger,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    discoveredCount: row.discovered_count,
    deduplicatedCount: row.deduplicated_count,
    analysedCount: row.analysed_count,
    recommendedCount: row.recommended_count,
    failedCount: row.failed_count,
    errorSummary: row.error_summary,
    checkpoint: row.checkpoint ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNotification(row: NotificationRow): NotificationOutboxItem {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    channel: row.channel,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    status: row.status,
    payload: row.payload ?? {},
    idempotencyKey: row.idempotency_key,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFeedback(row: FeedbackRow): FeedbackSignal {
  return {
    id: row.id,
    userId: row.user_id,
    recommendationId: row.recommendation_id,
    signalType: row.signal_type,
    signalValue: row.signal_value,
    weight: row.weight,
    createdAt: row.created_at,
  };
}

function mapGrowthAction(row: GrowthActionRow): GrowthAction {
  return {
    id: row.id,
    userId: row.user_id,
    gapKey: row.gap_key,
    gapLabel: row.gap_label,
    frequency: row.frequency,
    affectedListingIds: row.affected_listing_ids ?? [],
    whyItMatters: row.why_it_matters,
    suggestedAction: row.suggested_action,
    evidenceArtifact: row.evidence_artifact,
    coverageImpact: row.coverage_impact,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string };
  return (
    record.code === "23505" ||
    /duplicate key|unique constraint/i.test(record.message ?? "")
  );
}

function persistenceError(message: string, cause: unknown) {
  return new CareerCampaignError("PERSISTENCE_FAILED", message, { cause });
}
