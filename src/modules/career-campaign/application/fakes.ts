import type {
  ApplicationPacket,
  CampaignRun,
  FeedbackSignal,
  GrowthAction,
  JobApplication,
  JobApplicationEvent,
  JobRecommendation,
  NotificationOutboxItem,
} from "../domain/schemas";
import type {
  CareerCampaignRepository,
  CreateApplicationInput,
  CreatePacketInput,
  CreateRunInput,
  EnqueueNotificationInput,
  UpsertRecommendationInput,
} from "./ports";

function nowIso() {
  return new Date().toISOString();
}

export class InMemoryCareerCampaignRepository
  implements CareerCampaignRepository
{
  runs = new Map<string, CampaignRun>();
  runsByKey = new Map<string, string>();
  recommendations = new Map<string, JobRecommendation>();
  packets = new Map<string, ApplicationPacket>();
  packetsByRec = new Map<string, string>();
  applications = new Map<string, JobApplication>();
  applicationsByListing = new Map<string, string>();
  events: JobApplicationEvent[] = [];
  notifications = new Map<string, NotificationOutboxItem>();
  notificationsByKey = new Map<string, string>();
  feedback: FeedbackSignal[] = [];
  growth: GrowthAction[] = [];
  eligibleUserIds: string[] = [];
  cronCursor: { bucketKey: string; cursorUserId: string | null } | null = null;
  whatsapp = new Map<
    string,
    {
      userId: string;
      waId: string;
      optedInAt: string | null;
      optedOutAt: string | null;
    }
  >();

  async createOrGetRun(input: CreateRunInput) {
    const existingId = this.runsByKey.get(input.idempotencyKey);
    if (existingId) {
      return { run: this.runs.get(existingId)!, created: false };
    }
    const run: CampaignRun = {
      id: input.id,
      userId: input.userId,
      searchProfileId: input.searchProfileId,
      trigger: input.trigger,
      status: "queued",
      idempotencyKey: input.idempotencyKey,
      startedAt: null,
      completedAt: null,
      discoveredCount: 0,
      deduplicatedCount: 0,
      analysedCount: 0,
      recommendedCount: 0,
      failedCount: 0,
      errorSummary: null,
      checkpoint: {},
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.runs.set(run.id, run);
    this.runsByKey.set(run.idempotencyKey, run.id);
    return { run, created: true };
  }

  async getRunByIdempotencyKey(key: string) {
    const id = this.runsByKey.get(key);
    return id ? (this.runs.get(id) ?? null) : null;
  }

  async getRun(userId: string, runId: string) {
    const run = this.runs.get(runId);
    return run?.userId === userId ? run : null;
  }

  async updateRun(userId: string, runId: string, patch: Record<string, unknown>) {
    const run = await this.getRun(userId, runId);
    if (!run) throw new Error("run not found");
    const next = { ...run, ...patch, updatedAt: nowIso() } as CampaignRun;
    this.runs.set(runId, next);
    return next;
  }

  async listRecentRuns(userId: string, limit: number) {
    return [...this.runs.values()]
      .filter((run) => run.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async findActiveRun(userId: string) {
    return (
      [...this.runs.values()].find(
        (run) =>
          run.userId === userId &&
          (run.status === "queued" || run.status === "running"),
      ) ?? null
    );
  }

  async upsertRecommendation(input: UpsertRecommendationInput) {
    const existing = [...this.recommendations.values()].find(
      (item) =>
        item.userId === input.userId &&
        item.listingId === input.listingId &&
        ["pending_review", "saved", "accepted"].includes(item.status),
    );
    if (existing) return { recommendation: existing, created: false };
    const byAnalysis = [...this.recommendations.values()].find(
      (item) =>
        item.userId === input.userId &&
        item.jobMatchAnalysisId === input.jobMatchAnalysisId,
    );
    if (byAnalysis) return { recommendation: byAnalysis, created: false };

    const recommendation: JobRecommendation = {
      id: input.id,
      userId: input.userId,
      listingId: input.listingId,
      jobMatchAnalysisId: input.jobMatchAnalysisId,
      campaignRunId: input.campaignRunId,
      status: "pending_review",
      scoreSnapshot: input.scoreSnapshot,
      fitSummarySnapshot: input.fitSummarySnapshot,
      scoringPolicyVersion: input.scoringPolicyVersion,
      decisionReason: null,
      decisionNote: null,
      recommendedAt: input.recommendedAt,
      reviewedAt: null,
      createdAt: input.recommendedAt,
      updatedAt: input.recommendedAt,
    };
    this.recommendations.set(recommendation.id, recommendation);
    return { recommendation, created: true };
  }

  async listRecommendations(input: {
    userId: string;
    statuses?: JobRecommendation["status"][];
    limit?: number;
  }) {
    return [...this.recommendations.values()]
      .filter((item) => item.userId === input.userId)
      .filter(
        (item) =>
          !input.statuses || input.statuses.includes(item.status),
      )
      .sort((a, b) => b.recommendedAt.localeCompare(a.recommendedAt))
      .slice(0, input.limit ?? 50);
  }

  async getRecommendation(userId: string, recommendationId: string) {
    const item = this.recommendations.get(recommendationId);
    return item?.userId === userId ? item : null;
  }

  async updateRecommendationDecision(input: {
    userId: string;
    recommendationId: string;
    status: "saved" | "accepted" | "rejected";
    decisionReason?: JobRecommendation["decisionReason"];
    decisionNote?: string | null;
    reviewedAt: string;
  }) {
    const item = await this.getRecommendation(
      input.userId,
      input.recommendationId,
    );
    if (!item) throw new Error("recommendation not found");
    const next: JobRecommendation = {
      ...item,
      status: input.status,
      decisionReason: input.decisionReason ?? item.decisionReason,
      decisionNote:
        input.decisionNote === undefined
          ? item.decisionNote
          : input.decisionNote,
      reviewedAt: input.reviewedAt,
      updatedAt: input.reviewedAt,
    };
    this.recommendations.set(item.id, next);
    return next;
  }

  async listListingIdsWithActiveRecommendations(userId: string) {
    return new Set(
      [...this.recommendations.values()]
        .filter(
          (item) =>
            item.userId === userId &&
            ["pending_review", "saved", "accepted"].includes(item.status),
        )
        .map((item) => item.listingId),
    );
  }

  async listRejectedOrAppliedListingIds(userId: string) {
    const rejected = [...this.recommendations.values()]
      .filter((item) => item.userId === userId && item.status === "rejected")
      .map((item) => item.listingId);
    const applied = [...this.applications.values()]
      .filter(
        (item) =>
          item.userId === userId &&
          item.status !== "ready" &&
          item.status !== "withdrawn",
      )
      .map((item) => item.listingId);
    return new Set([...rejected, ...applied]);
  }

  async createOrGetPacket(input: CreatePacketInput) {
    const existingId = this.packetsByRec.get(input.recommendationId);
    if (existingId) {
      return { packet: this.packets.get(existingId)!, created: false };
    }
    const packet: ApplicationPacket = {
      id: input.id,
      userId: input.userId,
      recommendationId: input.recommendationId,
      listingId: input.listingId,
      status: "requested",
      evidenceSetId: input.evidenceSetId,
      evidenceVersion: input.evidenceVersion,
      jobMatchAnalysisId: input.jobMatchAnalysisId,
      cvVariantId: null,
      coverLetterDraft: null,
      coverLetterMeta: {},
      applicationUrl: input.applicationUrl,
      failureCode: null,
      failureMessage: null,
      requestedAt: input.requestedAt,
      readyAt: null,
      createdAt: input.requestedAt,
      updatedAt: input.requestedAt,
    };
    this.packets.set(packet.id, packet);
    this.packetsByRec.set(packet.recommendationId, packet.id);
    return { packet, created: true };
  }

  async getPacket(userId: string, packetId: string) {
    const packet = this.packets.get(packetId);
    return packet?.userId === userId ? packet : null;
  }

  async getPacketByRecommendation(userId: string, recommendationId: string) {
    const id = this.packetsByRec.get(recommendationId);
    if (!id) return null;
    return this.getPacket(userId, id);
  }

  async countReadyPackets(userId: string) {
    return [...this.packets.values()].filter(
      (packet) => packet.userId === userId && packet.status === "ready",
    ).length;
  }

  async updatePacket(
    userId: string,
    packetId: string,
    patch: Record<string, unknown>,
  ) {
    const packet = await this.getPacket(userId, packetId);
    if (!packet) throw new Error("packet not found");
    const next = { ...packet, ...patch, updatedAt: nowIso() } as ApplicationPacket;
    this.packets.set(packetId, next);
    return next;
  }

  async createOrGetApplication(input: CreateApplicationInput) {
    const existingId = this.applicationsByListing.get(
      `${input.userId}:${input.listingId}`,
    );
    if (existingId) {
      return { application: this.applications.get(existingId)!, created: false };
    }
    const application: JobApplication = {
      id: input.id,
      userId: input.userId,
      listingId: input.listingId,
      recommendationId: input.recommendationId,
      applicationPacketId: input.applicationPacketId,
      cvVariantId: input.cvVariantId,
      status: input.status,
      appliedAt: null,
      followUpDueAt: null,
      interviewAt: null,
      outcomeAt: null,
      userNote: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.applications.set(application.id, application);
    this.applicationsByListing.set(
      `${input.userId}:${input.listingId}`,
      application.id,
    );
    return { application, created: true };
  }

  async getApplication(userId: string, applicationId: string) {
    const application = this.applications.get(applicationId);
    return application?.userId === userId ? application : null;
  }

  async getApplicationByListing(userId: string, listingId: string) {
    const id = this.applicationsByListing.get(`${userId}:${listingId}`);
    if (!id) return null;
    return this.getApplication(userId, id);
  }

  async listApplications(input: {
    userId: string;
    statuses?: JobApplication["status"][];
    limit?: number;
  }) {
    return [...this.applications.values()]
      .filter((item) => item.userId === input.userId)
      .filter(
        (item) => !input.statuses || input.statuses.includes(item.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, input.limit ?? 50);
  }

  async updateApplication(
    userId: string,
    applicationId: string,
    patch: Record<string, unknown>,
  ) {
    const application = await this.getApplication(userId, applicationId);
    if (!application) throw new Error("application not found");
    const next = {
      ...application,
      ...patch,
      updatedAt: nowIso(),
    } as JobApplication;
    this.applications.set(applicationId, next);
    return next;
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
  }) {
    const existing = this.events.find(
      (event) => event.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { event: existing, created: false };
    const event: JobApplicationEvent = {
      id: input.id,
      applicationId: input.applicationId,
      userId: input.userId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      eventType: input.eventType,
      source: input.source,
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
      createdAt: input.occurredAt,
    };
    this.events.push(event);
    return { event, created: true };
  }

  async listApplicationEvents(userId: string, applicationId: string) {
    return this.events.filter(
      (event) =>
        event.userId === userId && event.applicationId === applicationId,
    );
  }

  async findDueFollowUps(input: {
    userId?: string;
    asOf: string;
    limit: number;
  }) {
    return [...this.applications.values()]
      .filter((item) => !input.userId || item.userId === input.userId)
      .filter(
        (item) =>
          item.status === "applied" &&
          item.followUpDueAt &&
          item.followUpDueAt <= input.asOf,
      )
      .slice(0, input.limit);
  }

  async enqueueNotification(input: EnqueueNotificationInput) {
    const existingId = this.notificationsByKey.get(input.idempotencyKey);
    if (existingId) {
      return { item: this.notifications.get(existingId)!, created: false };
    }
    const item: NotificationOutboxItem = {
      id: input.id,
      userId: input.userId,
      eventType: input.eventType,
      channel: input.channel,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      status: "pending",
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      scheduledAt: input.scheduledAt,
      sentAt: null,
      attemptCount: 0,
      lastError: null,
      createdAt: input.scheduledAt,
      updatedAt: input.scheduledAt,
    };
    this.notifications.set(item.id, item);
    this.notificationsByKey.set(item.idempotencyKey, item.id);
    return { item, created: true };
  }

  async claimPendingNotifications(input: {
    channel?: NotificationOutboxItem["channel"];
    limit: number;
    now: string;
  }) {
    const claimed: NotificationOutboxItem[] = [];
    for (const item of this.notifications.values()) {
      if (claimed.length >= input.limit) break;
      if (item.status !== "pending" && item.status !== "failed") continue;
      if (input.channel && item.channel !== input.channel) continue;
      if (item.scheduledAt > input.now) continue;
      const next = {
        ...item,
        status: "processing" as const,
        attemptCount: item.attemptCount + 1,
        updatedAt: input.now,
      };
      this.notifications.set(item.id, next);
      claimed.push(next);
    }
    return claimed;
  }

  async updateNotification(
    id: string,
    patch: Record<string, unknown>,
  ) {
    const item = this.notifications.get(id);
    if (!item) throw new Error("notification not found");
    const next = { ...item, ...patch, updatedAt: nowIso() } as NotificationOutboxItem;
    this.notifications.set(id, next);
    return next;
  }

  async listNotifications(input: { userId: string; limit?: number }) {
    return [...this.notifications.values()]
      .filter((item) => item.userId === input.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, input.limit ?? 50);
  }

  async suppressNotificationsForEntity(input: {
    userId: string;
    relatedEntityType: string;
    relatedEntityId: string;
    eventTypes?: string[];
  }) {
    let count = 0;
    for (const [id, item] of this.notifications) {
      if (item.userId !== input.userId) continue;
      if (item.relatedEntityType !== input.relatedEntityType) continue;
      if (item.relatedEntityId !== input.relatedEntityId) continue;
      if (input.eventTypes && !input.eventTypes.includes(item.eventType)) {
        continue;
      }
      if (item.status === "pending" || item.status === "failed") {
        this.notifications.set(id, {
          ...item,
          status: "suppressed",
          updatedAt: nowIso(),
        });
        count += 1;
      }
    }
    return count;
  }

  async addFeedbackSignal(input: FeedbackSignal) {
    this.feedback.push(input);
    return input;
  }

  async listFeedbackSignals(userId: string) {
    return this.feedback.filter((item) => item.userId === userId);
  }

  async upsertGrowthAction(
    input: Omit<GrowthAction, "updatedAt"> & { updatedAt?: string },
  ) {
    const existing = this.growth.find(
      (item) =>
        item.userId === input.userId &&
        item.gapKey === input.gapKey &&
        item.status === "active",
    );
    if (existing) {
      const next = {
        ...existing,
        ...input,
        updatedAt: input.updatedAt ?? nowIso(),
      };
      this.growth = this.growth.map((item) =>
        item.id === existing.id ? next : item,
      );
      return next;
    }
    const created: GrowthAction = {
      ...input,
      updatedAt: input.updatedAt ?? input.createdAt,
    };
    this.growth.push(created);
    return created;
  }

  async listGrowthActions(userId: string) {
    return this.growth.filter((item) => item.userId === userId);
  }

  async listEligibleUserIds(input: {
    afterUserId: string | null;
    limit: number;
  }) {
    const sorted = [...this.eligibleUserIds].sort();
    const start = input.afterUserId
      ? sorted.findIndex((id) => id > input.afterUserId!) + 0
      : 0;
    const from = input.afterUserId
      ? sorted.findIndex((id) => id > (input.afterUserId as string))
      : 0;
    const idx = from < 0 ? sorted.length : from === 0 && !input.afterUserId ? 0 : from;
    const startIdx = input.afterUserId
      ? sorted.findIndex((id) => id > input.afterUserId!) 
      : 0;
    const safeStart = startIdx < 0 ? sorted.length : startIdx;
    void start;
    void idx;
    return sorted.slice(safeStart, safeStart + input.limit);
  }

  async getCronCheckpoint(bucketKey: string) {
    if (!this.cronCursor || this.cronCursor.bucketKey !== bucketKey) {
      return null;
    }
    return {
      cursorUserId: this.cronCursor.cursorUserId,
      bucketKey,
    };
  }

  async saveCronCheckpoint(input: {
    bucketKey: string;
    cursorUserId: string | null;
  }) {
    this.cronCursor = input;
  }

  async getWhatsAppLink(userId: string) {
    return this.whatsapp.get(userId) ?? null;
  }

  async getUserIdByWhatsAppId(waId: string) {
    for (const link of this.whatsapp.values()) {
      if (link.waId === waId) return link.userId;
    }
    return null;
  }

  async setWhatsAppOptOut(userId: string, at: string) {
    const link = this.whatsapp.get(userId);
    if (!link) return;
    this.whatsapp.set(userId, { ...link, optedOutAt: at });
  }
}
