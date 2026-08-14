import type { CareerEvidenceSet } from "@/modules/career-evidence/domain/evidence";
import type { JobSearchCampaign } from "@/modules/career-campaign/domain/job-campaign";
import type { EnqueueNotificationInput } from "@/modules/career-campaign/application/ports";
import type { NotificationOutboxItem } from "@/modules/career-campaign/domain/schemas";

import { CareerGrowthError } from "../domain/errors";
import { buildFallbackRecommendation } from "../domain/recommendation";
import type { AnalysedCampaignJob } from "../domain/market-requirements";
import type {
  AdvisorAssessment,
  AdvisorChatResponse,
  AdvisorRecommendation,
  GrowthAssessment,
  GrowthAssessmentRequest,
  GrowthConversation,
  GrowthMessage,
  GrowthMilestone,
  GrowthProject,
  GrowthRecommendation,
  GrowthSuppression,
} from "../domain/schemas";
import type {
  CompactAssessmentInput,
  CompactChatInput,
  CompactRecommendationInput,
  GrowthAdvisor,
  GrowthCampaignReader,
  GrowthCaps,
  GrowthEvidenceReader,
  GrowthMarketReader,
  GrowthNotifier,
  CareerGrowthRepository,
} from "./ports";

export const DEFAULT_GROWTH_CAPS: GrowthCaps = {
  marketMinAnalysedJobs: 5,
  assessmentLeaseMs: 120_000,
  publicAppBaseUrl: "https://zeno.example",
};

export class InMemoryCareerGrowthRepository implements CareerGrowthRepository {
  requests = new Map<string, GrowthAssessmentRequest>();
  assessments = new Map<string, GrowthAssessment>();
  recommendations = new Map<string, GrowthRecommendation>();
  suppressions = new Map<string, GrowthSuppression>();
  projects = new Map<string, GrowthProject>();
  milestones = new Map<string, GrowthMilestone[]>();
  conversations = new Map<string, GrowthConversation>();
  messages = new Map<string, GrowthMessage[]>();

  async insertAssessmentRequest(request: GrowthAssessmentRequest) {
    this.requests.set(request.id, request);
    return request;
  }
  async getAssessmentRequest(id: string) {
    return this.requests.get(id) ?? null;
  }
  async listAssessmentRequests(input: {
    userId: string;
    campaignId?: string;
    statuses?: GrowthAssessmentRequest["status"][];
  }) {
    return [...this.requests.values()].filter((item) => {
      if (item.userId !== input.userId) return false;
      if (input.campaignId && item.campaignId !== input.campaignId) return false;
      if (input.statuses && !input.statuses.includes(item.status)) return false;
      return true;
    });
  }
  async claimAssessmentRequest(input: {
    id: string;
    owner: string;
    now: string;
    leaseExpiresAt: string;
  }) {
    const current = this.requests.get(input.id);
    if (!current) return null;
    const leaseValid =
      current.leaseExpiresAt && current.leaseExpiresAt > input.now;
    if (
      current.status === "processing" &&
      leaseValid &&
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
    const next: GrowthAssessmentRequest = {
      ...current,
      status: "processing",
      leaseOwner: input.owner,
      leaseExpiresAt: input.leaseExpiresAt,
      attemptCount: current.attemptCount + 1,
      updatedAt: input.now,
    };
    this.requests.set(input.id, next);
    return next;
  }
  async claimDueAssessmentRequests(input: {
    now: string;
    owner: string;
    leaseExpiresAt: string;
    limit: number;
  }) {
    const due = [...this.requests.values()]
      .filter((item) => {
        if (item.status === "pending" || item.status === "failed_retryable") {
          return !item.retryAfter || item.retryAfter <= input.now;
        }
        if (item.status === "processing") {
          return !item.leaseExpiresAt || item.leaseExpiresAt <= input.now;
        }
        return false;
      })
      .slice(0, input.limit);
    const claimed: GrowthAssessmentRequest[] = [];
    for (const item of due) {
      const next = await this.claimAssessmentRequest({
        id: item.id,
        owner: input.owner,
        now: input.now,
        leaseExpiresAt: input.leaseExpiresAt,
      });
      if (next) claimed.push(next);
    }
    return claimed;
  }
  async updateAssessmentRequest(
    id: string,
    patch: Partial<GrowthAssessmentRequest>,
  ) {
    const current = this.requests.get(id);
    if (!current) throw new CareerGrowthError("NOT_FOUND", "Assessment request not found.");
    const next = { ...current, ...patch };
    this.requests.set(id, next);
    return next;
  }
  async findAssessmentByFingerprint(input: {
    userId: string;
    fingerprint: string;
  }) {
    return (
      [...this.assessments.values()].find(
        (item) =>
          item.userId === input.userId &&
          item.inputFingerprint === input.fingerprint,
      ) ?? null
    );
  }
  async insertAssessment(assessment: GrowthAssessment) {
    this.assessments.set(assessment.id, assessment);
    return assessment;
  }
  async getAssessment(id: string) {
    return this.assessments.get(id) ?? null;
  }
  async listAssessmentsForCampaign(input: {
    userId: string;
    campaignId: string;
  }) {
    return [...this.assessments.values()].filter(
      (item) => item.userId === input.userId && item.campaignId === input.campaignId,
    );
  }
  async insertRecommendation(recommendation: GrowthRecommendation) {
    this.recommendations.set(recommendation.id, recommendation);
    return recommendation;
  }
  async updateRecommendation(
    id: string,
    patch: Partial<GrowthRecommendation>,
  ) {
    const current = this.recommendations.get(id);
    if (!current) throw new CareerGrowthError("NOT_FOUND", "Recommendation not found.");
    const next = { ...current, ...patch };
    this.recommendations.set(id, next);
    return next;
  }
  async getRecommendation(id: string) {
    return this.recommendations.get(id) ?? null;
  }
  async listRecommendations(input: {
    userId: string;
    campaignId?: string;
    statuses?: GrowthRecommendation["status"][];
  }) {
    return [...this.recommendations.values()].filter((item) => {
      if (item.userId !== input.userId) return false;
      if (input.campaignId && item.campaignId !== input.campaignId) return false;
      if (input.statuses && !input.statuses.includes(item.status)) return false;
      return true;
    });
  }
  async insertSuppression(suppression: GrowthSuppression) {
    this.suppressions.set(suppression.id, suppression);
    return suppression;
  }
  async listSuppressions(input: { userId: string; campaignId: string }) {
    return [...this.suppressions.values()].filter(
      (item) =>
        item.userId === input.userId && item.campaignId === input.campaignId,
    );
  }
  async insertProject(project: GrowthProject) {
    this.projects.set(project.id, project);
    return project;
  }
  async updateProject(id: string, patch: Partial<GrowthProject>) {
    const current = this.projects.get(id);
    if (!current) throw new CareerGrowthError("NOT_FOUND", "Project not found.");
    const next = { ...current, ...patch };
    this.projects.set(id, next);
    return next;
  }
  async getProject(id: string) {
    return this.projects.get(id) ?? null;
  }
  async getProjectBySourceRecommendation(recommendationId: string) {
    return (
      [...this.projects.values()].find(
        (item) => item.sourceRecommendationId === recommendationId,
      ) ?? null
    );
  }
  async listProjects(input: {
    userId: string;
    statuses?: GrowthProject["status"][];
  }) {
    return [...this.projects.values()].filter((item) => {
      if (item.userId !== input.userId) return false;
      if (input.statuses && !input.statuses.includes(item.status)) return false;
      return true;
    });
  }
  async replaceMilestones(projectId: string, milestones: GrowthMilestone[]) {
    this.milestones.set(projectId, milestones);
    return milestones;
  }
  async listMilestones(projectId: string) {
    return this.milestones.get(projectId) ?? [];
  }
  async getMilestone(id: string) {
    for (const items of this.milestones.values()) {
      const found = items.find((item) => item.id === id);
      if (found) return found;
    }
    return null;
  }
  async updateMilestone(id: string, patch: Partial<GrowthMilestone>) {
    for (const [projectId, items] of this.milestones) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) continue;
      const next = { ...items[index]!, ...patch };
      const copy = [...items];
      copy[index] = next;
      this.milestones.set(projectId, copy);
      return next;
    }
    throw new CareerGrowthError("NOT_FOUND", "Milestone not found.");
  }
  async insertConversation(conversation: GrowthConversation) {
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }
  async getConversationByRecommendation(recommendationId: string) {
    return (
      [...this.conversations.values()].find(
        (item) => item.recommendationId === recommendationId,
      ) ?? null
    );
  }
  async updateConversation(id: string, patch: Partial<GrowthConversation>) {
    const current = this.conversations.get(id);
    if (!current) throw new CareerGrowthError("NOT_FOUND", "Conversation not found.");
    const next = { ...current, ...patch };
    this.conversations.set(id, next);
    return next;
  }
  async listMessages(conversationId: string) {
    return this.messages.get(conversationId) ?? [];
  }
  async insertMessage(message: GrowthMessage) {
    const existing = this.messages.get(message.conversationId) ?? [];
    this.messages.set(message.conversationId, [...existing, message]);
    return message;
  }
}

export class FakeGrowthAdvisor implements GrowthAdvisor {
  calls = {
    assessment: 0,
    recommendation: 0,
    chat: 0,
  };
  failAssessment: "none" | "malformed" | "cooldown" | "once-malformed" = "none";
  private assessmentAttempts = 0;
  chatRevision: AdvisorRecommendation | null = null;
  chatReply = "We can keep the plan focused on evidence you can finish.";
  usedModel = true;

  async synthesiseAssessment(
    input: CompactAssessmentInput,
  ): Promise<AdvisorAssessment> {
    this.calls.assessment += 1;
    this.assessmentAttempts += 1;
    this.throwIfConfigured();
    return {
      dimensions: input.dimensions,
      highestPriorityGapKey: input.highestPriorityGapKey,
      marketEvidenceSummary: input.marketSummary,
    };
  }

  async generateRecommendation(
    input: CompactRecommendationInput,
  ): Promise<AdvisorRecommendation> {
    this.calls.recommendation += 1;
    this.throwIfConfigured();
    return buildFallbackRecommendation({
      intent: input.intent,
      gapKey: input.highestPriorityGapKey,
      dimensions: input.dimensions,
      evidence: input.evidence,
      market: input.marketSummary
        ? {
            analysedJobCount: 5,
            relevantJobCount: 5,
            requirements: [
              {
                key: input.marketSummary.toLocaleLowerCase(),
                label: input.marketSummary.split(" appeared")[0] ?? input.marketSummary,
                category: "technology",
                frequency: 8,
                sampleSize: 5,
                percentage: 80,
                gapFrequency: 8,
              },
            ],
          }
        : null,
      workload: input.workload,
    });
  }

  async chat(_input: CompactChatInput): Promise<AdvisorChatResponse> {
    void _input;
    this.calls.chat += 1;
    this.throwIfConfigured();
    return {
      reply: this.chatReply,
      proposalRevision: this.chatRevision,
    };
  }

  private throwIfConfigured() {
    if (this.failAssessment === "cooldown") {
      throw new CareerGrowthError(
        "CAPACITY_UNAVAILABLE",
        "Groq is cooling down.",
        { retryAfter: "2026-08-13T22:00:00.000Z" },
      );
    }
    if (this.failAssessment === "malformed") {
      throw new CareerGrowthError("INVALID_AI_OUTPUT", "Malformed structured output.");
    }
    if (this.failAssessment === "once-malformed" && this.assessmentAttempts === 1) {
      throw new CareerGrowthError("INVALID_AI_OUTPUT", "Malformed structured output.");
    }
  }
}

export class FakeCampaignReader implements GrowthCampaignReader {
  campaigns = new Map<string, JobSearchCampaign>();
  async getCampaign(campaignId: string) {
    return this.campaigns.get(campaignId) ?? null;
  }
  async listCampaigns(userId: string) {
    return [...this.campaigns.values()].filter((item) => item.userId === userId);
  }
}

export class FakeEvidenceReader implements GrowthEvidenceReader {
  current: CareerEvidenceSet | null = null;
  async getCurrent() {
    return this.current;
  }
}

export class FakeMarketReader implements GrowthMarketReader {
  jobs: AnalysedCampaignJob[] = [];
  async listAnalysedJobs() {
    return this.jobs;
  }
}

export class FakeNotifier implements GrowthNotifier {
  items: NotificationOutboxItem[] = [];
  suppressed: string[] = [];
  async enqueueNotification(input: EnqueueNotificationInput) {
    const existing = this.items.find(
      (item) => item.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { item: existing, created: false };
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
    this.items.push(item);
    return { item, created: true };
  }
  async suppressNotificationsForEntity(input: {
    userId: string;
    relatedEntityType: string;
    relatedEntityId: string;
  }) {
    this.suppressed.push(input.relatedEntityId);
    let count = 0;
    this.items = this.items.map((item) => {
      if (
        item.userId === input.userId &&
        item.relatedEntityType === input.relatedEntityType &&
        item.relatedEntityId === input.relatedEntityId &&
        item.status === "pending"
      ) {
        count += 1;
        return { ...item, status: "suppressed" as const };
      }
      return item;
    });
    return count;
  }
}
