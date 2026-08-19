import type { CareerEvidenceSet } from "@/modules/career-evidence/domain/evidence";
import type { JobSearchCampaign } from "@/modules/career-campaign/domain/job-campaign";
import type { EnqueueNotificationInput } from "@/modules/career-campaign/application/ports";
import type { NotificationOutboxItem } from "@/modules/career-campaign/domain/schemas";

import type { AnalysedCampaignJob } from "../domain/market-requirements";
export type { AnalysedCampaignJob };
import type {
  AdvisorAssessment,
  AdvisorChatResponse,
  AdvisorRecommendation,
  AssessmentMode,
  CampaignIntent,
  GrowthAssessment,
  GrowthAssessmentRequest,
  GrowthConversation,
  GrowthMessage,
  GrowthMilestone,
  GrowthProject,
  GrowthRecommendation,
  GrowthSuppression,
  VerifiedEvidenceSummary,
} from "../domain/schemas";

export type GrowthCaps = {
  marketMinAnalysedJobs: number;
  assessmentLeaseMs: number;
  publicAppBaseUrl: string;
  /** Days after creation before a stalled market-refined request falls back to preliminary. */
  preliminaryStallDays: number;
};

export type CompactAssessmentInput = {
  intent: CampaignIntent;
  evidence: VerifiedEvidenceSummary;
  dimensions: AdvisorAssessment["dimensions"];
  highestPriorityGapKey: AdvisorAssessment["highestPriorityGapKey"];
  marketSummary: string | null;
  mode: AssessmentMode;
};

export type CompactRecommendationInput = CompactAssessmentInput & {
  type: AdvisorRecommendation["type"];
  workload: GrowthAssessment["workloadSnapshot"];
  coveringProjectTitle: string | null;
};

export type CompactChatInput = {
  intent: CampaignIntent;
  assessmentSummary: string;
  evidence: VerifiedEvidenceSummary;
  recommendation: AdvisorRecommendation;
  workload: GrowthAssessment["workloadSnapshot"];
  history: Array<{ role: "assistant" | "user"; content: string }>;
  message: string;
};

export interface GrowthAdvisor {
  synthesiseAssessment(
    input: CompactAssessmentInput,
  ): Promise<AdvisorAssessment>;
  generateRecommendation(
    input: CompactRecommendationInput,
  ): Promise<AdvisorRecommendation>;
  chat(input: CompactChatInput): Promise<AdvisorChatResponse>;
}

export interface GrowthCampaignReader {
  getCampaign(campaignId: string): Promise<JobSearchCampaign | null>;
  listCampaigns(userId: string): Promise<JobSearchCampaign[]>;
}

export interface GrowthEvidenceReader {
  getCurrent(userId: string): Promise<CareerEvidenceSet | null>;
}

export interface GrowthMarketReader {
  listAnalysedJobs(input: {
    userId: string;
    campaignId: string;
  }): Promise<AnalysedCampaignJob[]>;
}

export interface GrowthNotifier {
  enqueueNotification(input: EnqueueNotificationInput): Promise<{
    item: NotificationOutboxItem;
    created: boolean;
  }>;
  suppressNotificationsForEntity(input: {
    userId: string;
    relatedEntityType: string;
    relatedEntityId: string;
    eventTypes?: string[];
  }): Promise<number>;
}

export interface CareerGrowthRepository {
  insertAssessmentRequest(
    request: GrowthAssessmentRequest,
  ): Promise<GrowthAssessmentRequest>;
  getAssessmentRequest(
    id: string,
  ): Promise<GrowthAssessmentRequest | null>;
  listAssessmentRequests(input: {
    userId: string;
    campaignId?: string;
    statuses?: GrowthAssessmentRequest["status"][];
  }): Promise<GrowthAssessmentRequest[]>;
  claimAssessmentRequest(input: {
    id: string;
    owner: string;
    now: string;
    leaseExpiresAt: string;
  }): Promise<GrowthAssessmentRequest | null>;
  claimDueAssessmentRequests(input: {
    now: string;
    owner: string;
    leaseExpiresAt: string;
    limit: number;
  }): Promise<GrowthAssessmentRequest[]>;
  updateAssessmentRequest(
    id: string,
    patch: Partial<GrowthAssessmentRequest>,
  ): Promise<GrowthAssessmentRequest>;

  findAssessmentByFingerprint(input: {
    userId: string;
    fingerprint: string;
  }): Promise<GrowthAssessment | null>;
  insertAssessment(assessment: GrowthAssessment): Promise<GrowthAssessment>;
  getAssessment(id: string): Promise<GrowthAssessment | null>;
  listAssessmentsForCampaign(input: {
    userId: string;
    campaignId: string;
  }): Promise<GrowthAssessment[]>;

  insertRecommendation(
    recommendation: GrowthRecommendation,
  ): Promise<GrowthRecommendation>;
  updateRecommendation(
    id: string,
    patch: Partial<GrowthRecommendation>,
  ): Promise<GrowthRecommendation>;
  getRecommendation(id: string): Promise<GrowthRecommendation | null>;
  listRecommendations(input: {
    userId: string;
    campaignId?: string;
    statuses?: GrowthRecommendation["status"][];
  }): Promise<GrowthRecommendation[]>;

  insertSuppression(suppression: GrowthSuppression): Promise<GrowthSuppression>;
  listSuppressions(input: {
    userId: string;
    campaignId: string;
  }): Promise<GrowthSuppression[]>;

  insertProject(project: GrowthProject): Promise<GrowthProject>;
  updateProject(
    id: string,
    patch: Partial<GrowthProject>,
  ): Promise<GrowthProject>;
  getProject(id: string): Promise<GrowthProject | null>;
  getProjectBySourceRecommendation(
    recommendationId: string,
  ): Promise<GrowthProject | null>;
  listProjects(input: {
    userId: string;
    statuses?: GrowthProject["status"][];
  }): Promise<GrowthProject[]>;

  replaceMilestones(
    projectId: string,
    milestones: GrowthMilestone[],
  ): Promise<GrowthMilestone[]>;
  listMilestones(projectId: string): Promise<GrowthMilestone[]>;
  getMilestone(id: string): Promise<GrowthMilestone | null>;
  updateMilestone(
    id: string,
    patch: Partial<GrowthMilestone>,
  ): Promise<GrowthMilestone>;

  insertConversation(
    conversation: GrowthConversation,
  ): Promise<GrowthConversation>;
  getConversationByRecommendation(
    recommendationId: string,
  ): Promise<GrowthConversation | null>;
  updateConversation(
    id: string,
    patch: Partial<GrowthConversation>,
  ): Promise<GrowthConversation>;
  listMessages(conversationId: string): Promise<GrowthMessage[]>;
  insertMessage(message: GrowthMessage): Promise<GrowthMessage>;
}

export type Clock = () => Date;
export type IdGenerator = () => string;
export type GrowthLogger = (
  event: string,
  fields: Record<string, unknown>,
) => void;
