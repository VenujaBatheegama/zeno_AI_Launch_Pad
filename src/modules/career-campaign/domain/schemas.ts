import { z } from "zod";

export const recommendationStatusSchema = z.enum([
  "pending_review",
  "saved",
  "accepted",
  "rejected",
  "expired",
]);
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;

export const decisionReasonSchema = z.enum([
  "wrong_technology",
  "wrong_role",
  "wrong_seniority",
  "location",
  "work_mode",
  "salary",
  "company",
  "poor_match",
  "not_interested",
  "other",
]);
export type DecisionReason = z.infer<typeof decisionReasonSchema>;

export const packetStatusSchema = z.enum([
  "requested",
  "preparing",
  "ready",
  "failed",
]);
export type PacketStatus = z.infer<typeof packetStatusSchema>;

export const applicationStatusSchema = z.enum([
  "ready",
  "applied",
  "interview",
  "rejected",
  "offer",
  "withdrawn",
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const campaignRunTriggerSchema = z.enum([
  "manual",
  "cron",
  "fresh_linkedin",
  "broad_watch",
]);
export type CampaignRunTrigger = z.infer<typeof campaignRunTriggerSchema>;

export const campaignRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partially_failed",
  "failed",
]);
export type CampaignRunStatus = z.infer<typeof campaignRunStatusSchema>;

export const notificationChannelSchema = z.enum(["in_app", "whatsapp"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationStatusSchema = z.enum([
  "pending",
  "processing",
  "sent",
  "failed",
  "suppressed",
]);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const eventSourceSchema = z.enum(["web", "whatsapp", "system"]);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const scoreSnapshotSchema = z.object({
  evidenceFitScore: z.number(),
  careerLevel: z.string(),
  hardConstraintEligible: z.boolean(),
  analysisConfidence: z.string(),
  scoringPolicyVersion: z.string(),
  matchingPolicyVersion: z.string().optional(),
  searchRelevance: z.number().optional(),
  interestAlignment: z.number().optional(),
  finalScore: z.number().optional(),
});
export type ScoreSnapshot = z.infer<typeof scoreSnapshotSchema>;

export const fitSummarySnapshotSchema = z.object({
  explanation: z.string(),
  topMatched: z.array(z.string()).default([]),
  primaryGaps: z.array(z.string()).default([]),
  rankingReasons: z.array(z.string()).default([]),
  title: z.string().optional(),
  organizationName: z.string().nullable().optional(),
  applicationUrl: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  workMode: z.string().nullable().optional(),
});
export type FitSummarySnapshot = z.infer<typeof fitSummarySnapshotSchema>;

export const coverLetterDraftSchema = z.object({
  draft: z.string().min(40).max(4000),
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        evidenceFactIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  acknowledgedGaps: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type CoverLetterDraft = z.infer<typeof coverLetterDraftSchema>;

export type JobRecommendation = {
  id: string;
  userId: string;
  listingId: string;
  jobMatchAnalysisId: string;
  campaignRunId: string | null;
  jobSearchCampaignId: string | null;
  status: RecommendationStatus;
  scoreSnapshot: ScoreSnapshot;
  fitSummarySnapshot: FitSummarySnapshot;
  scoringPolicyVersion: string;
  decisionReason: DecisionReason | null;
  decisionNote: string | null;
  recommendedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationPacket = {
  id: string;
  userId: string;
  recommendationId: string;
  listingId: string;
  status: PacketStatus;
  evidenceSetId: string | null;
  evidenceVersion: number | null;
  jobMatchAnalysisId: string | null;
  cvVariantId: string | null;
  coverLetterDraft: string | null;
  coverLetterMeta: Record<string, unknown>;
  applicationUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  requestedAt: string;
  readyAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobApplication = {
  id: string;
  userId: string;
  listingId: string;
  recommendationId: string;
  applicationPacketId: string;
  cvVariantId: string | null;
  status: ApplicationStatus;
  appliedAt: string | null;
  followUpDueAt: string | null;
  interviewAt: string | null;
  outcomeAt: string | null;
  userNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobApplicationEvent = {
  id: string;
  applicationId: string;
  userId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  eventType: string;
  source: EventSource;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  occurredAt: string;
  createdAt: string;
};

export type CampaignRun = {
  id: string;
  userId: string;
  searchProfileId: string | null;
  trigger: CampaignRunTrigger;
  status: CampaignRunStatus;
  idempotencyKey: string;
  startedAt: string | null;
  completedAt: string | null;
  discoveredCount: number;
  deduplicatedCount: number;
  analysedCount: number;
  recommendedCount: number;
  failedCount: number;
  errorSummary: string | null;
  checkpoint: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NotificationOutboxItem = {
  id: string;
  userId: string;
  eventType: string;
  channel: NotificationChannel;
  relatedEntityType: string;
  relatedEntityId: string;
  status: NotificationStatus;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  scheduledAt: string;
  sentAt: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackSignal = {
  id: string;
  userId: string;
  recommendationId: string | null;
  signalType: string;
  signalValue: string;
  weight: number;
  createdAt: string;
};

export type GrowthAction = {
  id: string;
  userId: string;
  gapKey: string;
  gapLabel: string;
  frequency: number;
  affectedListingIds: string[];
  whyItMatters: string;
  suggestedAction: string;
  evidenceArtifact: string;
  coverageImpact: string;
  status: "active" | "dismissed" | "completed";
  createdAt: string;
  updatedAt: string;
};
