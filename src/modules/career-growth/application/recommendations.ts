import { CareerGrowthError } from "../domain/errors";
import { MAX_CHAT_HISTORY } from "../domain/policy";
import {
  advisorChatResponseSchema,
  advisorRecommendationSchema,
  type GrowthRecommendation,
} from "../domain/schemas";
import { mergeProposalRevision } from "../domain/recommendation";
import {
  assertRecommendationTransition,
  canDismissRecommendation,
  canOpenRecommendation,
} from "../domain/transitions";
import { toCampaignIntent, toVerifiedEvidenceSummary } from "../domain/mappers";
import type {
  CareerGrowthRepository,
  Clock,
  GrowthAdvisor,
  GrowthCampaignReader,
  GrowthEvidenceReader,
  GrowthNotifier,
  IdGenerator,
} from "./ports";

export async function getGrowthRecommendation(
  input: { userId: string; recommendationId: string },
  deps: { repository: CareerGrowthRepository },
) {
  const recommendation = await requireOwnedRecommendation(input, deps.repository);
  if (recommendation.status === "dismissed") {
    throw new CareerGrowthError("NOT_FOUND", "Growth recommendation was not found.");
  }
  const assessment = await deps.repository.getAssessment(
    recommendation.assessmentId,
  );
  const conversation = await deps.repository.getConversationByRecommendation(
    recommendation.id,
  );
  const messages = conversation
    ? await deps.repository.listMessages(conversation.id)
    : [];
  const project = await deps.repository.getProjectBySourceRecommendation(
    recommendation.id,
  );
  return { recommendation, assessment, conversation, messages, project };
}

export async function openGrowthRecommendation(
  input: { userId: string; recommendationId: string },
  deps: { repository: CareerGrowthRepository; now: Clock },
) {
  const recommendation = await requireOwnedRecommendation(input, deps.repository);
  if (!canOpenRecommendation(recommendation.status)) {
    return recommendation;
  }
  if (recommendation.status === "opened") return recommendation;
  const now = deps.now().toISOString();
  assertRecommendationTransition(recommendation.status, "opened");
  return deps.repository.updateRecommendation(recommendation.id, {
    status: "opened",
    openedAt: now,
    updatedAt: now,
  });
}

export async function dismissGrowthRecommendation(
  input: {
    userId: string;
    recommendationId: string;
    category?: string;
  },
  deps: {
    repository: CareerGrowthRepository;
    notifier: GrowthNotifier;
    now: Clock;
    createId: IdGenerator;
  },
) {
  const recommendation = await requireOwnedRecommendation(input, deps.repository);
  if (!canDismissRecommendation(recommendation.status)) {
    throw new CareerGrowthError(
      "INVALID_TRANSITION",
      "This Growth recommendation can no longer be dismissed.",
    );
  }
  const now = deps.now().toISOString();
  assertRecommendationTransition(recommendation.status, "dismissed");
  const assessment = await deps.repository.getAssessment(
    recommendation.assessmentId,
  );
  const request = assessment
    ? await deps.repository.getAssessmentRequest(assessment.requestId)
    : null;
  await deps.repository.insertSuppression({
    id: deps.createId(),
    userId: input.userId,
    campaignId: recommendation.campaignId,
    gapKey: recommendation.gapKey,
    fingerprint: recommendation.fingerprint,
    criteriaFingerprint: request?.criteriaFingerprint ?? recommendation.fingerprint,
    evidenceVersion: assessment?.evidenceVersion ?? "unknown",
    dismissalCategory: input.category ?? null,
    dismissedAt: now,
  });
  await deps.notifier.suppressNotificationsForEntity({
    userId: input.userId,
    relatedEntityType: "growth_recommendation",
    relatedEntityId: recommendation.id,
    eventTypes: ["growth_recommendation_ready"],
  });
  await deps.repository.updateRecommendation(recommendation.id, {
    status: "dismissed",
    title: "Dismissed recommendation",
    summary: "This recommendation was dismissed.",
    rationale: "",
    evidenceGap: "",
    expectedEvidence: [],
    proposedMilestones: recommendation.proposedMilestones.map((item) => ({
      ...item,
      description: "Removed",
    })),
    currentProposal: null,
    updatedAt: now,
  });
  return { dismissed: true };
}

export async function sendGrowthChatMessage(
  input: {
    userId: string;
    recommendationId: string;
    message: string;
  },
  deps: {
    repository: CareerGrowthRepository;
    campaigns: GrowthCampaignReader;
    evidence: GrowthEvidenceReader;
    advisor: GrowthAdvisor;
    createId: IdGenerator;
    now: Clock;
  },
) {
  const message = input.message.trim();
  if (!message) {
    throw new CareerGrowthError("INVALID_INPUT", "Write a message before sending.");
  }
  const recommendation = await requireOwnedRecommendation(input, deps.repository);
  if (!canOpenRecommendation(recommendation.status) && recommendation.status !== "accepted") {
    throw new CareerGrowthError(
      "INVALID_TRANSITION",
      "This recommendation is no longer open for discussion.",
    );
  }
  await openGrowthRecommendation(input, deps);
  const conversation = await deps.repository.getConversationByRecommendation(
    recommendation.id,
  );
  if (!conversation) {
    throw new CareerGrowthError("NOT_FOUND", "Growth conversation was not found.");
  }
  const now = deps.now().toISOString();
  await deps.repository.insertMessage({
    id: deps.createId(),
    conversationId: conversation.id,
    userId: input.userId,
    role: "user",
    content: message.slice(0, 2000),
    createdAt: now,
  });
  const campaign = await deps.campaigns.getCampaign(recommendation.campaignId);
  const assessment = await deps.repository.getAssessment(recommendation.assessmentId);
  const evidenceSet = await deps.evidence.getCurrent(input.userId);
  const history = await deps.repository.listMessages(conversation.id);
  const currentProposal =
    recommendation.currentProposal ?? toAdvisorRecommendation(recommendation);
  let reply = "I can help you reshape this plan. Say if you want it smaller, shorter, or based on work you already have.";
  let revision = null;
  try {
    const generated = await deps.advisor.chat({
      intent: campaign
        ? toCampaignIntent(campaign)
        : {
            id: recommendation.campaignId,
            userId: input.userId,
            name: "",
            status: "active",
            primaryRole: "",
            location: "",
            workMode: "any",
            employmentTypes: [],
            experienceLevels: [],
            preferredTechnologies: [],
            targetReadyDate: null,
            weeklyHoursAvailable: null,
            criteriaVersion: 1,
            priority: 1,
          },
      assessmentSummary:
        assessment?.dimensions
          .map((item) => `${item.label}: ${item.status}. ${item.explanation}`)
          .join(" ")
          .slice(0, 1200) ?? recommendation.evidenceGap,
      evidence: toVerifiedEvidenceSummary({
        evidenceSetId: evidenceSet?.id ?? null,
        status: evidenceSet?.status ?? null,
        updatedAt: evidenceSet?.updatedAt ?? null,
        evidence: evidenceSet?.evidence ?? null,
      }),
      recommendation: currentProposal,
      workload:
        assessment?.workloadSnapshot ?? {
          activeProjectCount: 0,
          totalEstimatedWeeklyHours: 0,
          remainingMilestones: 0,
          availableWeeklyHours: 5,
          remainingCapacityHours: 5,
          overcommitted: false,
          coveringProjectId: null,
          coveringProjectTitle: null,
          campaignOverlapIds: [],
        },
      history: history.slice(-MAX_CHAT_HISTORY).map((item) => ({
        role: item.role,
        content: item.content.slice(0, 800),
      })),
      message,
    });
    const parsed = advisorChatResponseSchema.parse(generated);
    reply = parsed.reply;
    if (parsed.proposalRevision) {
      revision = mergeProposalRevision(
        currentProposal,
        advisorRecommendationSchema.partial().parse(parsed.proposalRevision),
      );
    }
  } catch {
    revision = maybeLocalRevision(message, currentProposal);
    if (revision) {
      reply = `Updated the plan without a model call. ${revision.summary}`;
    }
  }
  if (revision) {
    await deps.repository.updateRecommendation(recommendation.id, {
      title: revision.title,
      summary: revision.summary,
      rationale: revision.rationale,
      evidenceGap: revision.evidenceGap,
      expectedEvidence: revision.expectedEvidence,
      estimatedWeeks: revision.estimatedWeeks,
      estimatedHoursPerWeek: revision.estimatedHoursPerWeek,
      proposedMilestones: revision.proposedMilestones,
      currentProposal: revision,
      updatedAt: now,
    });
  }
  const assistant = await deps.repository.insertMessage({
    id: deps.createId(),
    conversationId: conversation.id,
    userId: input.userId,
    role: "assistant",
    content: reply,
    createdAt: deps.now().toISOString(),
  });
  return {
    reply: assistant.content,
    proposalRevision: revision,
  };
}

export async function requireOwnedRecommendation(
  input: { userId: string; recommendationId: string },
  repository: CareerGrowthRepository,
): Promise<GrowthRecommendation> {
  const recommendation = await repository.getRecommendation(input.recommendationId);
  if (!recommendation || recommendation.userId !== input.userId) {
    throw new CareerGrowthError("NOT_FOUND", "Growth recommendation was not found.");
  }
  return recommendation;
}

function toAdvisorRecommendation(recommendation: GrowthRecommendation) {
  return {
    type: recommendation.type,
    gapKey: recommendation.gapKey,
    title: recommendation.title,
    summary: recommendation.summary,
    rationale: recommendation.rationale,
    evidenceGap: recommendation.evidenceGap,
    expectedEvidence: recommendation.expectedEvidence,
    estimatedWeeks: recommendation.estimatedWeeks,
    estimatedHoursPerWeek: recommendation.estimatedHoursPerWeek,
    proposedMilestones: recommendation.proposedMilestones,
    supportingCampaignIds: recommendation.supportingCampaignIds,
    marketEvidenceSummary: recommendation.marketEvidenceSummary,
  };
}

function maybeLocalRevision(
  message: string,
  current: ReturnType<typeof toAdvisorRecommendation>,
) {
  const lower = message.toLocaleLowerCase();
  if (/two[- ]week|2 week|smaller|shorter/.test(lower)) {
    return {
      ...current,
      estimatedWeeks: 2,
      estimatedHoursPerWeek: Math.min(current.estimatedHoursPerWeek, 4),
      summary: `${current.summary.split(".")[0]}. Reduced to two weeks so it fits a tighter timeline.`,
    };
  }
  return null;
}
