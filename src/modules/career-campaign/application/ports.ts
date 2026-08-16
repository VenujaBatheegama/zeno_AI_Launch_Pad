import type {
  ApplicationPacket,
  CampaignRun,
  CampaignRunStatus,
  DecisionReason,
  EventSource,
  FeedbackSignal,
  FitSummarySnapshot,
  GrowthAction,
  JobApplication,
  JobApplicationEvent,
  JobRecommendation,
  NotificationChannel,
  NotificationOutboxItem,
  RecommendationStatus,
  ScoreSnapshot,
} from "../domain/schemas";

export type UpsertRecommendationInput = {
  id: string;
  userId: string;
  listingId: string;
  jobMatchAnalysisId: string;
  campaignRunId: string | null;
  jobSearchCampaignId?: string | null;
  scoreSnapshot: ScoreSnapshot;
  fitSummarySnapshot: FitSummarySnapshot;
  scoringPolicyVersion: string;
  recommendedAt: string;
};

export type CreatePacketInput = {
  id: string;
  userId: string;
  recommendationId: string;
  listingId: string;
  evidenceSetId: string | null;
  evidenceVersion: number | null;
  jobMatchAnalysisId: string | null;
  applicationUrl: string | null;
  requestedAt: string;
};

export type CreateApplicationInput = {
  id: string;
  userId: string;
  listingId: string;
  recommendationId: string;
  applicationPacketId: string;
  cvVariantId: string | null;
  status: JobApplication["status"];
  createdAt: string;
};

export type CreateRunInput = {
  id: string;
  userId: string;
  searchProfileId: string | null;
  trigger: CampaignRun["trigger"];
  idempotencyKey: string;
  createdAt: string;
};

export type EnqueueNotificationInput = {
  id: string;
  userId: string;
  eventType: string;
  channel: NotificationChannel;
  relatedEntityType: string;
  relatedEntityId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  scheduledAt: string;
};

export interface CareerCampaignRepository {
  createOrGetRun(input: CreateRunInput): Promise<{
    run: CampaignRun;
    created: boolean;
  }>;
  getRunByIdempotencyKey(key: string): Promise<CampaignRun | null>;
  getRun(userId: string, runId: string): Promise<CampaignRun | null>;
  updateRun(
    userId: string,
    runId: string,
    patch: Partial<{
      status: CampaignRunStatus;
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
  ): Promise<CampaignRun>;
  listRecentRuns(userId: string, limit: number): Promise<CampaignRun[]>;
  findActiveRun(userId: string): Promise<CampaignRun | null>;

  upsertRecommendation(input: UpsertRecommendationInput): Promise<{
    recommendation: JobRecommendation;
    created: boolean;
  }>;
  listRecommendations(input: {
    userId: string;
    statuses?: RecommendationStatus[];
    limit?: number;
  }): Promise<JobRecommendation[]>;
  getRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<JobRecommendation | null>;
  updateRecommendationDecision(input: {
    userId: string;
    recommendationId: string;
    status: Extract<RecommendationStatus, "saved" | "accepted" | "rejected">;
    decisionReason?: DecisionReason | null;
    decisionNote?: string | null;
    reviewedAt: string;
  }): Promise<JobRecommendation>;
  listListingIdsWithActiveRecommendations(
    userId: string,
  ): Promise<Set<string>>;
  listRejectedOrAppliedListingIds(userId: string): Promise<Set<string>>;

  createOrGetPacket(input: CreatePacketInput): Promise<{
    packet: ApplicationPacket;
    created: boolean;
  }>;
  getPacket(userId: string, packetId: string): Promise<ApplicationPacket | null>;
  getPacketByRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<ApplicationPacket | null>;
  countReadyPackets(userId: string): Promise<number>;
  updatePacket(
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
  ): Promise<ApplicationPacket>;

  createOrGetApplication(input: CreateApplicationInput): Promise<{
    application: JobApplication;
    created: boolean;
  }>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<JobApplication | null>;
  getApplicationByListing(
    userId: string,
    listingId: string,
  ): Promise<JobApplication | null>;
  listApplications(input: {
    userId: string;
    statuses?: JobApplication["status"][];
    limit?: number;
  }): Promise<JobApplication[]>;
  updateApplication(
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
  ): Promise<JobApplication>;
  appendApplicationEvent(input: {
    id: string;
    applicationId: string;
    userId: string;
    fromStatus: JobApplication["status"] | null;
    toStatus: JobApplication["status"];
    eventType: string;
    source: EventSource;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<{ event: JobApplicationEvent; created: boolean }>;
  listApplicationEvents(
    userId: string,
    applicationId: string,
  ): Promise<JobApplicationEvent[]>;
  findDueFollowUps(input: {
    userId?: string;
    asOf: string;
    limit: number;
  }): Promise<JobApplication[]>;

  enqueueNotification(input: EnqueueNotificationInput): Promise<{
    item: NotificationOutboxItem;
    created: boolean;
  }>;
  claimPendingNotifications(input: {
    channel?: NotificationChannel;
    userId?: string;
    limit: number;
    now: string;
  }): Promise<NotificationOutboxItem[]>;
  updateNotification(
    id: string,
    patch: Partial<{
      status: NotificationOutboxItem["status"];
      sentAt: string | null;
      attemptCount: number;
      lastError: string | null;
    }>,
  ): Promise<NotificationOutboxItem>;
  listNotifications(input: {
    userId: string;
    limit?: number;
  }): Promise<NotificationOutboxItem[]>;
  suppressNotificationsForEntity(input: {
    userId: string;
    relatedEntityType: string;
    relatedEntityId: string;
    eventTypes?: string[];
  }): Promise<number>;

  addFeedbackSignal(input: {
    id: string;
    userId: string;
    recommendationId: string | null;
    signalType: string;
    signalValue: string;
    weight: number;
    createdAt: string;
  }): Promise<FeedbackSignal>;
  listFeedbackSignals(userId: string): Promise<FeedbackSignal[]>;

  upsertGrowthAction(input: Omit<GrowthAction, "updatedAt"> & {
    updatedAt?: string;
  }): Promise<GrowthAction>;
  listGrowthActions(userId: string): Promise<GrowthAction[]>;

  listEligibleUserIds(input: {
    afterUserId: string | null;
    limit: number;
  }): Promise<string[]>;
  getCronCheckpoint(bucketKey: string): Promise<{
    cursorUserId: string | null;
    bucketKey: string;
  } | null>;
  saveCronCheckpoint(input: {
    bucketKey: string;
    cursorUserId: string | null;
  }): Promise<void>;

  getWhatsAppLink(userId: string): Promise<{
    userId: string;
    waId: string;
    optedInAt: string | null;
    optedOutAt: string | null;
  } | null>;
  getUserIdByWhatsAppId(waId: string): Promise<string | null>;
  createWhatsAppLinkCode(input: {
    id: string;
    userId: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void>;
  claimWhatsAppLinkCode(input: {
    codeHash: string;
    waId: string;
    claimedAt: string;
  }): Promise<string | null>;
  claimWhatsAppInboundMessage(input: {
    messageId: string;
    waId: string;
    receivedAt: string;
  }): Promise<boolean>;
  deleteWhatsAppLink(userId: string): Promise<void>;
  setWhatsAppOptIn(userId: string, at: string): Promise<void>;
  setWhatsAppOptOut(userId: string, at: string): Promise<void>;

  getTelegramLink(userId: string): Promise<{
    userId: string;
    chatId: string;
    username: string | null;
    optedInAt: string | null;
    optedOutAt: string | null;
  } | null>;
  getUserIdByTelegramChatId(chatId: string): Promise<string | null>;
  createTelegramLinkCode(input: {
    id: string;
    userId: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void>;
  claimTelegramLinkCode(input: {
    codeHash: string;
    chatId: string;
    username: string | null;
    claimedAt: string;
  }): Promise<string | null>;
  claimTelegramInboundMessage(input: {
    updateId: string;
    chatId: string;
    receivedAt: string;
  }): Promise<boolean>;
  releaseTelegramInboundMessage(updateId: string): Promise<void>;
  deleteTelegramLink(userId: string): Promise<void>;
  setTelegramOptIn(userId: string, at: string): Promise<void>;
  setTelegramOptOut(userId: string, at: string): Promise<void>;
}

export type PendingNotification = NotificationOutboxItem;

export type DeliveryResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; retryable: boolean; error: string };

export interface NotificationSender {
  send(notification: PendingNotification): Promise<DeliveryResult>;
}

export interface CoverLetterGenerator {
  generate(input: {
    evidenceJson: unknown;
    jobTitle: string;
    organizationName: string | null;
    jobDescription: string;
    matchedRequirements: string[];
    missingRequirements: string[];
    applicationUrl: string | null;
  }): Promise<{
    draft: string;
    meta: Record<string, unknown>;
  }>;
}
