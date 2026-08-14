import { z } from "zod";

import {
  ASSESSMENT_DIMENSION_KEYS,
  WEEKLY_HOUR_OPTIONS,
  type AssessmentDimensionKey,
  type WeeklyHoursAvailable,
} from "./policy";

export const weeklyHoursAvailableSchema = z.union([
  z.literal(2),
  z.literal(5),
  z.literal(8),
  z.literal(10),
]);

export const assessmentModeSchema = z.enum(["preliminary", "market_refined"]);
export type AssessmentMode = z.infer<typeof assessmentModeSchema>;

export const assessmentRequestStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed_retryable",
  "failed_permanent",
]);
export type AssessmentRequestStatus = z.infer<
  typeof assessmentRequestStatusSchema
>;

export const dimensionStatusSchema = z.enum([
  "strong",
  "partial",
  "missing",
  "unknown",
]);
export type DimensionStatus = z.infer<typeof dimensionStatusSchema>;

export const recommendationTypeSchema = z.enum([
  "new_project",
  "extend_existing_project",
  "improve_portfolio",
  "document_existing_work",
  "learning_artifact",
]);
export type GrowthRecommendationType = z.infer<typeof recommendationTypeSchema>;

export const recommendationStatusSchema = z.enum([
  "pending",
  "opened",
  "accepted",
  "dismissed",
  "superseded",
  "completed",
]);
export type GrowthRecommendationStatus = z.infer<
  typeof recommendationStatusSchema
>;

export const projectStatusSchema = z.enum([
  "planned",
  "in_progress",
  "paused",
  "completed",
  "abandoned",
]);
export type GrowthProjectStatus = z.infer<typeof projectStatusSchema>;

export const milestoneStatusSchema = z.enum([
  "todo",
  "in_progress",
  "completed",
  "skipped",
]);
export type GrowthMilestoneStatus = z.infer<typeof milestoneStatusSchema>;

export const assessmentDimensionSchema = z.object({
  key: z.enum(ASSESSMENT_DIMENSION_KEYS),
  label: z.string().min(1),
  status: dimensionStatusSchema,
  explanation: z.string().min(1),
  supportingEvidenceIds: z.array(z.string()),
  missingEvidence: z.array(z.string()),
});
export type GrowthAssessmentDimension = z.infer<
  typeof assessmentDimensionSchema
>;

export const proposedMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(600),
  estimatedHours: z.number().int().min(1).max(80),
});
export type ProposedMilestone = z.infer<typeof proposedMilestoneSchema>;

export const advisorAssessmentSchema = z.object({
  dimensions: z.array(assessmentDimensionSchema).min(1),
  highestPriorityGapKey: z.enum(ASSESSMENT_DIMENSION_KEYS),
  marketEvidenceSummary: z.string().max(800).nullable(),
});
export type AdvisorAssessment = z.infer<typeof advisorAssessmentSchema>;

export const advisorRecommendationSchema = z.object({
  type: recommendationTypeSchema,
  gapKey: z.enum(ASSESSMENT_DIMENSION_KEYS),
  title: z.string().trim().min(8).max(140),
  summary: z.string().trim().min(20).max(600),
  rationale: z.string().trim().min(20).max(1200),
  evidenceGap: z.string().trim().min(12).max(800),
  expectedEvidence: z.array(z.string().trim().min(1)).min(1).max(8),
  estimatedWeeks: z.number().int().min(1).max(12),
  estimatedHoursPerWeek: z.number().int().min(1).max(20),
  proposedMilestones: z.array(proposedMilestoneSchema).min(2).max(6),
  supportingCampaignIds: z.array(z.uuid()).min(1),
  marketEvidenceSummary: z.string().max(800).nullable(),
});
export type AdvisorRecommendation = z.infer<typeof advisorRecommendationSchema>;

export const proposalRevisionSchema = advisorRecommendationSchema
  .omit({ supportingCampaignIds: true, gapKey: true })
  .partial()
  .extend({
    title: z.string().trim().min(8).max(140).optional(),
    summary: z.string().trim().min(20).max(600).optional(),
    proposedMilestones: z.array(proposedMilestoneSchema).min(2).max(6).optional(),
  });
export type ProposalRevision = z.infer<typeof proposalRevisionSchema>;

export const advisorChatResponseSchema = z.object({
  reply: z.string().trim().min(1).max(1600),
  proposalRevision: advisorRecommendationSchema.partial().nullable(),
});
export type AdvisorChatResponse = z.infer<typeof advisorChatResponseSchema>;

export type CampaignIntent = {
  id: string;
  userId: string;
  name: string;
  status: "active" | "paused" | "archived";
  primaryRole: string;
  location: string;
  workMode: string;
  employmentTypes: string[];
  experienceLevels: string[];
  preferredTechnologies: string[];
  targetReadyDate: string | null;
  weeklyHoursAvailable: WeeklyHoursAvailable | null;
  criteriaVersion: number;
  priority: number;
};

export type VerifiedEvidenceItem = {
  id: string;
  name: string;
  role?: string | null;
  bullets?: string[];
  technologies?: string[];
  employer?: string;
};

export type VerifiedEvidenceSummary = {
  evidenceSetId: string | null;
  verified: boolean;
  updatedAt: string | null;
  skills: VerifiedEvidenceItem[];
  projects: VerifiedEvidenceItem[];
  workExperience: VerifiedEvidenceItem[];
  educationCount: number;
  githubUrl: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
};

export type MarketRequirementStat = {
  key: string;
  label: string;
  category: string;
  frequency: number;
  sampleSize: number;
  percentage: number;
  gapFrequency: number;
};

export type MarketSignals = {
  analysedJobCount: number;
  relevantJobCount: number;
  requirements: MarketRequirementStat[];
};

export type WorkloadSnapshot = {
  activeProjectCount: number;
  totalEstimatedWeeklyHours: number;
  remainingMilestones: number;
  availableWeeklyHours: WeeklyHoursAvailable;
  remainingCapacityHours: number;
  overcommitted: boolean;
  coveringProjectId: string | null;
  coveringProjectTitle: string | null;
  campaignOverlapIds: string[];
};

export type GrowthAssessmentRequest = {
  id: string;
  userId: string;
  campaignId: string;
  criteriaFingerprint: string;
  evidenceVersion: string;
  workloadVersion: string;
  mode: AssessmentMode;
  status: AssessmentRequestStatus;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  errorCategory: string | null;
  retryAfter: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type GrowthAssessment = {
  id: string;
  userId: string;
  campaignId: string;
  requestId: string;
  evidenceVersion: string;
  mode: AssessmentMode;
  dimensions: GrowthAssessmentDimension[];
  highestPriorityGapKey: AssessmentDimensionKey;
  marketSampleSize: number;
  marketEvidenceSummary: string | null;
  inputFingerprint: string;
  workloadSnapshot: WorkloadSnapshot;
  model: string | null;
  provider: string | null;
  usedModel: boolean;
  createdAt: string;
};

export type GrowthRecommendation = {
  id: string;
  userId: string;
  campaignId: string;
  assessmentId: string;
  type: GrowthRecommendationType;
  gapKey: AssessmentDimensionKey;
  title: string;
  summary: string;
  rationale: string;
  evidenceGap: string;
  expectedEvidence: string[];
  estimatedWeeks: number;
  estimatedHoursPerWeek: number;
  proposedMilestones: ProposedMilestone[];
  supportingCampaignIds: string[];
  marketEvidenceSummary: string | null;
  status: GrowthRecommendationStatus;
  fingerprint: string;
  currentProposal: AdvisorRecommendation | null;
  openedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GrowthSuppression = {
  id: string;
  userId: string;
  campaignId: string;
  gapKey: AssessmentDimensionKey;
  fingerprint: string;
  criteriaFingerprint: string;
  evidenceVersion: string;
  dismissalCategory: string | null;
  dismissedAt: string;
};

export type GrowthProject = {
  id: string;
  userId: string;
  sourceRecommendationId: string;
  title: string;
  objective: string;
  status: GrowthProjectStatus;
  startDate: string;
  targetDate: string;
  estimatedHoursPerWeek: number;
  progress: number;
  expectedEvidence: string[];
  supportingCampaignIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type GrowthMilestone = {
  id: string;
  projectId: string;
  userId: string;
  position: number;
  title: string;
  description: string;
  estimatedHours: number;
  targetDate: string | null;
  status: GrowthMilestoneStatus;
  completedAt: string | null;
};

export type GrowthConversation = {
  id: string;
  userId: string;
  recommendationId: string;
  projectId: string | null;
  objectiveSnapshot: string;
  createdAt: string;
  updatedAt: string;
};

export type GrowthMessage = {
  id: string;
  conversationId: string;
  userId: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
};

export type GrowthInboxItem = {
  kind: "growth";
  id: string;
  recommendationId: string;
  campaignId: string;
  campaignName: string;
  title: string;
  reason: string;
  estimatedWeeks: number;
  estimatedHoursPerWeek: number;
  createdAt: string;
  href: string;
};

export type JobInboxItem = {
  kind: "job";
  id: string;
  listingId: string;
  title: string;
  organizationName: string | null;
  reason: string;
  score: number | null;
  createdAt: string;
  href: string;
};

export type InboxItem = GrowthInboxItem | JobInboxItem;

export type CampaignGrowthState =
  | { kind: "assessing"; requestId: string; href: string }
  | { kind: "recommendation_ready"; recommendationId: string; href: string }
  | { kind: "project_in_progress"; projectId: string; count: number; href: string }
  | { kind: "none" };

export { WEEKLY_HOUR_OPTIONS };
export type { AssessmentDimensionKey, WeeklyHoursAvailable };
