import { ZodError } from "zod";

import { CareerGrowthError } from "../domain/errors";
import {
  assessEvidenceDimensions,
  selectHighestPriorityGap,
} from "../domain/assessment";
import {
  assessmentInputFingerprint,
  campaignCriteriaFingerprint,
  evidenceVersion,
  recommendationFingerprint,
  workloadVersion,
} from "../domain/fingerprints";
import { toCampaignIntent, toVerifiedEvidenceSummary } from "../domain/mappers";
import {
  aggregateMarketRequirements,
  marketEvidenceSummary,
  shouldRefineFromMarket,
} from "../domain/market-requirements";
import { MAX_ASSESSMENT_ATTEMPTS, PRELIMINARY_MARKET_LABEL } from "../domain/policy";
import {
  advisorAssessmentSchema,
  advisorRecommendationSchema,
  type GrowthAssessment,
  type GrowthRecommendation,
} from "../domain/schemas";
import {
  buildFallbackRecommendation,
  groundedAgainstEvidence,
} from "../domain/recommendation";
import { suppressionStillApplies } from "../domain/transitions";
import { calculateWorkload, recommendActionType } from "../domain/workload";
import type {
  CareerGrowthRepository,
  Clock,
  GrowthAdvisor,
  GrowthCampaignReader,
  GrowthCaps,
  GrowthEvidenceReader,
  GrowthLogger,
  GrowthMarketReader,
  GrowthNotifier,
  IdGenerator,
} from "./ports";

export async function processGrowthAssessment(
  input: { requestId: string; owner?: string; userId?: string },
  deps: {
    repository: CareerGrowthRepository;
    campaigns: GrowthCampaignReader;
    evidence: GrowthEvidenceReader;
    market: GrowthMarketReader;
    advisor: GrowthAdvisor;
    notifier: GrowthNotifier;
    caps: GrowthCaps;
    createId: IdGenerator;
    now: Clock;
    log?: GrowthLogger;
  },
): Promise<{
  requestStatus: string;
  assessment: GrowthAssessment | null;
  recommendation: GrowthRecommendation | null;
  cacheHit: boolean;
  retryAfter?: string | null;
}> {
  const log = deps.log ?? defaultLog;
  const now = deps.now().toISOString();
  const started = Date.now();
  const existingRequest = await deps.repository.getAssessmentRequest(
    input.requestId,
  );
  if (!existingRequest) {
    throw new CareerGrowthError(
      "NOT_FOUND",
      "Growth assessment request was not found.",
    );
  }
  if (input.userId && existingRequest.userId !== input.userId) {
    throw new CareerGrowthError(
      "NOT_FOUND",
      "Growth assessment request was not found.",
    );
  }
  const claimed = await deps.repository.claimAssessmentRequest({
    id: input.requestId,
    owner: input.owner ?? "manual",
    now,
    leaseExpiresAt: new Date(
      deps.now().getTime() + deps.caps.assessmentLeaseMs,
    ).toISOString(),
  });
  if (!claimed) {
    const existing = await deps.repository.getAssessmentRequest(input.requestId);
    if (!existing) {
      throw new CareerGrowthError("NOT_FOUND", "Growth assessment request was not found.");
    }
    return {
      requestStatus: existing.status,
      assessment: null,
      recommendation: null,
      cacheHit: false,
      retryAfter: existing.retryAfter,
    };
  }
  if (claimed.status === "completed") {
    return {
      requestStatus: "completed",
      assessment: null,
      recommendation: null,
      cacheHit: true,
    };
  }

  try {
    const result = await runAssessment(claimed, deps, now);
    log("growth_assessment_processed", {
      requestId: claimed.id,
      campaignId: claimed.campaignId,
      mode: claimed.mode,
      cacheHit: result.cacheHit,
      usedModel: result.assessment?.usedModel ?? false,
      durationMs: Date.now() - started,
      result: result.recommendation ? "recommendation" : "suppressed",
    });
    return result;
  } catch (error) {
    const category = errorCategory(error);
    const retryable =
      category === "capacity" ||
      category === "invalid_output" ||
      category === "unavailable";
    const attempts = claimed.attemptCount;
    const status =
      !retryable || attempts >= MAX_ASSESSMENT_ATTEMPTS
        ? "failed_permanent"
        : "failed_retryable";
    const retryAfter =
      error instanceof CareerGrowthError ? error.retryAfter : null;
    await deps.repository.updateAssessmentRequest(claimed.id, {
      status,
      errorCategory: category,
      retryAfter,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: deps.now().toISOString(),
    });
    log("growth_assessment_failed", {
      requestId: claimed.id,
      category,
      status,
      durationMs: Date.now() - started,
    });
    if (category === "capacity") {
      return {
        requestStatus: status,
        assessment: null,
        recommendation: null,
        cacheHit: false,
        retryAfter,
      };
    }
    throw error;
  }
}

async function runAssessment(
  request: Awaited<ReturnType<CareerGrowthRepository["claimAssessmentRequest"]>> &
    object,
  deps: Parameters<typeof processGrowthAssessment>[1],
  now: string,
): Promise<{
  requestStatus: string;
  assessment: GrowthAssessment | null;
  recommendation: GrowthRecommendation | null;
  cacheHit: boolean;
}> {
  if (!request) {
    throw new CareerGrowthError("NOT_FOUND", "Growth assessment request was not found.");
  }
  const log = deps.log ?? defaultLog;
  const campaign = await deps.campaigns.getCampaign(request.campaignId);
  if (!campaign || campaign.userId !== request.userId) {
    await deps.repository.updateAssessmentRequest(request.id, {
      status: "failed_permanent",
      errorCategory: "campaign_missing",
      updatedAt: now,
      completedAt: now,
    });
    return {
      requestStatus: "failed_permanent",
      assessment: null,
      recommendation: null,
      cacheHit: false,
    };
  }

  const intent = toCampaignIntent(campaign);
  const evidenceSet = await deps.evidence.getCurrent(request.userId);
  const evidence = toVerifiedEvidenceSummary({
    evidenceSetId: evidenceSet?.id ?? null,
    status: evidenceSet?.status ?? null,
    updatedAt: evidenceSet?.updatedAt ?? null,
    evidence: evidenceSet?.evidence ?? null,
  });
  const analysedJobs = await deps.market.listAnalysedJobs({
    userId: request.userId,
    campaignId: request.campaignId,
  });
  const market = aggregateMarketRequirements(analysedJobs, {
    minScore: campaign.minimumScore,
  });
  let isStallFallback = false;
  if (
    request.mode === "market_refined" &&
    !shouldRefineFromMarket(market, deps.caps.marketMinAnalysedJobs)
  ) {
    // Check if this request has been stalled long enough to fall back to preliminary.
    const stalledDays =
      (new Date(now).getTime() - new Date(request.createdAt).getTime()) /
      (1000 * 60 * 60 * 24);
    const isStalled = stalledDays >= deps.caps.preliminaryStallDays;

    if (!isStalled) {
      // Not yet stalled — skip silently as before.
      await deps.repository.updateAssessmentRequest(request.id, {
        status: "completed",
        errorCategory: "market_below_threshold",
        completedAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      return {
        requestStatus: "completed",
        assessment: null,
        recommendation: null,
        cacheHit: false,
      };
    }

    // Stalled: downgrade to preliminary using actual partial data.
    // Do NOT hardcode marketSampleSize: 0 — use the real count so the label
    // accurately represents the basis for the assessment.
    log("growth_assessment_stall_fallback", {
      requestId: request.id,
      campaignId: request.campaignId,
      stalledDays: Math.round(stalledDays),
      actualJobCount: analysedJobs.length,
      marketMinRequired: deps.caps.marketMinAnalysedJobs,
    });
    // Downgrade mode in-place so the rest of the function treats this as preliminary.
    // The real partial job count (analysedJobs.length) flows into marketSampleSize below.
    (request as { mode: string }).mode = "preliminary";
    isStallFallback = true;
  }

  const projects = await deps.repository.listProjects({
    userId: request.userId,
    statuses: ["planned", "in_progress", "paused"],
  });
  const deterministic = assessEvidenceDimensions({
    intent,
    evidence,
    market: request.mode === "market_refined" ? market : null,
  });
  const gapKey = selectHighestPriorityGap(deterministic);
  const workload = calculateWorkload({ intent, projects, gapKey });
  const inputFingerprint = assessmentInputFingerprint({
    userId: request.userId,
    campaignId: request.campaignId,
    criteriaFingerprint: campaignCriteriaFingerprint(intent),
    evidenceVersion: evidenceVersion(evidence),
    workloadVersion: workloadVersion(workload),
    mode: request.mode,
    marketSampleSize:
      request.mode === "market_refined" ? market.relevantJobCount : 0,
    dominantGapKey: gapKey,
  });

  const cached = await deps.repository.findAssessmentByFingerprint({
    userId: request.userId,
    fingerprint: inputFingerprint,
  });
  if (cached) {
    const existingRec = (
      await deps.repository.listRecommendations({
        userId: request.userId,
        campaignId: request.campaignId,
        statuses: ["pending", "opened", "accepted"],
      })
    )[0];
    await deps.repository.updateAssessmentRequest(request.id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCategory: null,
    });
    return {
      requestStatus: "completed",
      assessment: cached,
      recommendation: existingRec ?? null,
      cacheHit: true,
    };
  }

  const suppressions = await deps.repository.listSuppressions({
    userId: request.userId,
    campaignId: request.campaignId,
  });
  const blocked = suppressions.find((item) =>
    suppressionStillApplies({
      suppressionCriteriaFingerprint: item.criteriaFingerprint,
      suppressionEvidenceVersion: item.evidenceVersion,
      currentCriteriaFingerprint: campaignCriteriaFingerprint(intent),
      currentEvidenceVersion: evidenceVersion(evidence),
      suppressionGapKey: item.gapKey,
      currentGapKey: gapKey,
    }),
  );

  // For stall fallbacks, force the preliminary label so the assessment clearly
  // communicates it was generated from partial market data.
  const marketSummary =
    request.mode === "market_refined"
      ? marketEvidenceSummary(market)
      : isStallFallback
        ? PRELIMINARY_MARKET_LABEL
        : null;
  let usedModel = false;
  let modelName: string | null = null;
  let assessmentPayload = advisorAssessmentSchema.parse({
    dimensions: deterministic,
    highestPriorityGapKey: gapKey,
    marketEvidenceSummary: marketSummary,
  });

  assessmentPayload = await withMalformedRetry(
    async () => {
      const generated = await deps.advisor.synthesiseAssessment({
        intent,
        evidence,
        dimensions: deterministic,
        highestPriorityGapKey: gapKey,
        marketSummary,
        mode: request.mode,
      });
      usedModel = true;
      modelName = "groq";
      return advisorAssessmentSchema.parse(generated);
    },
    assessmentPayload,
  );

  const assessment: GrowthAssessment = {
    id: deps.createId(),
    userId: request.userId,
    campaignId: request.campaignId,
    requestId: request.id,
    evidenceVersion: evidenceVersion(evidence),
    mode: request.mode,
    dimensions: assessmentPayload.dimensions,
    highestPriorityGapKey: assessmentPayload.highestPriorityGapKey,
    // For market_refined: use the validated relevantJobCount.
    // For preliminary (including stall-fallback): use the actual count of analysed
    // jobs so the label accurately represents the data that was available.
    marketSampleSize:
      request.mode === "market_refined" ? market.relevantJobCount : analysedJobs.length,

    marketEvidenceSummary: assessmentPayload.marketEvidenceSummary,
    inputFingerprint,
    workloadSnapshot: workload,
    model: modelName,
    provider: modelName ? "groq" : "deterministic",
    usedModel,
    createdAt: now,
  };
  await deps.repository.insertAssessment(assessment);

  if (blocked) {
    await deps.repository.updateAssessmentRequest(request.id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCategory: "suppressed",
    });
    return {
      requestStatus: "completed",
      assessment,
      recommendation: null,
      cacheHit: false,
    };
  }

  const open = await deps.repository.listRecommendations({
    userId: request.userId,
    campaignId: request.campaignId,
    statuses: ["pending", "opened"],
  });
  const fingerprint = recommendationFingerprint({
    campaignId: request.campaignId,
    gapKey: assessment.highestPriorityGapKey,
    type: recommendActionType({
      gapKey: assessment.highestPriorityGapKey,
      workload,
    }),
    criteriaFingerprint: campaignCriteriaFingerprint(intent),
    evidenceVersion: evidenceVersion(evidence),
  });
  const duplicate = open.find((item) => item.fingerprint === fingerprint);
  if (duplicate) {
    await deps.repository.updateAssessmentRequest(request.id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    return {
      requestStatus: "completed",
      assessment,
      recommendation: duplicate,
      cacheHit: false,
    };
  }
  for (const item of open) {
    await deps.repository.updateRecommendation(item.id, {
      status: "superseded",
      updatedAt: now,
    });
  }

  const fallback = buildFallbackRecommendation({
    intent,
    gapKey: assessment.highestPriorityGapKey,
    dimensions: assessment.dimensions,
    evidence,
    market: request.mode === "market_refined" ? market : null,
    workload,
  });
  let generated = fallback;
  generated = await withMalformedRetry(
    async () => {
      const raw = await deps.advisor.generateRecommendation({
        intent,
        evidence,
        dimensions: assessment.dimensions,
        highestPriorityGapKey: assessment.highestPriorityGapKey,
        marketSummary: assessment.marketEvidenceSummary,
        mode: request.mode,
        type: fallback.type,
        workload,
        coveringProjectTitle: workload.coveringProjectTitle,
      });
      const parsed = advisorRecommendationSchema.parse({
        ...raw,
        supportingCampaignIds:
          raw.supportingCampaignIds.length > 0
            ? raw.supportingCampaignIds
            : [intent.id],
        gapKey: assessment.highestPriorityGapKey,
        marketEvidenceSummary:
          raw.marketEvidenceSummary ?? fallback.marketEvidenceSummary,
      });
      if (groundedAgainstEvidence(parsed, evidence).length > 0) {
        return fallback;
      }
      usedModel = true;
      return parsed;
    },
    fallback,
  );

  const recommendation: GrowthRecommendation = {
    id: deps.createId(),
    userId: request.userId,
    campaignId: request.campaignId,
    assessmentId: assessment.id,
    type: generated.type,
    gapKey: generated.gapKey,
    title: generated.title,
    summary: generated.summary,
    rationale: generated.rationale,
    evidenceGap: generated.evidenceGap,
    expectedEvidence: generated.expectedEvidence,
    estimatedWeeks: generated.estimatedWeeks,
    estimatedHoursPerWeek: generated.estimatedHoursPerWeek,
    proposedMilestones: generated.proposedMilestones,
    supportingCampaignIds: generated.supportingCampaignIds,
    marketEvidenceSummary: generated.marketEvidenceSummary,
    status: "pending",
    fingerprint,
    currentProposal: generated,
    openedAt: null,
    acceptedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.repository.insertRecommendation(recommendation);

  const conversationId = deps.createId();
  await deps.repository.insertConversation({
    id: conversationId,
    userId: request.userId,
    recommendationId: recommendation.id,
    projectId: null,
    objectiveSnapshot: generated.summary,
    createdAt: now,
    updatedAt: now,
  });
  await deps.repository.insertMessage({
    id: deps.createId(),
    conversationId,
    userId: request.userId,
    role: "assistant",
    content: openingMessage(recommendation, campaign.name),
    createdAt: now,
  });

  await deps.notifier.enqueueNotification({
    id: deps.createId(),
    userId: request.userId,
    eventType: "growth_recommendation_ready",
    channel: "in_app",
    relatedEntityType: "growth_recommendation",
    relatedEntityId: recommendation.id,
    payload: {
      campaignId: campaign.id,
      campaignName: campaign.name,
      title: recommendation.title,
      summary: recommendation.summary,
      estimatedWeeks: recommendation.estimatedWeeks,
      estimatedHoursPerWeek: recommendation.estimatedHoursPerWeek,
    },
    idempotencyKey: `growth-rec:${recommendation.id}`,
    scheduledAt: now,
  });

  await deps.repository.updateAssessmentRequest(request.id, {
    status: "completed",
    completedAt: now,
    updatedAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    errorCategory: null,
  });

  return {
    requestStatus: "completed",
    assessment,
    recommendation,
    cacheHit: false,
  };
}

export async function refineAssessmentFromCampaignResults(
  input: { userId: string; campaignId: string },
  deps: Parameters<typeof processGrowthAssessment>[1] & {
    request: typeof import("./request-assessment").requestGrowthAssessment;
  },
) {
  const jobs = await deps.market.listAnalysedJobs(input);
  const market = aggregateMarketRequirements(jobs);
  if (!shouldRefineFromMarket(market, deps.caps.marketMinAnalysedJobs)) {
    return { requested: false, analysed: market.relevantJobCount };
  }
  const request = await deps.request(
    {
      userId: input.userId,
      campaignId: input.campaignId,
      mode: "market_refined",
    },
    deps,
  );
  return { requested: true, requestId: request.id, analysed: market.relevantJobCount };
}

function openingMessage(
  recommendation: GrowthRecommendation,
  campaignName: string,
): string {
  return `I prepared a Growth recommendation for ${campaignName}: ${recommendation.title}. ${recommendation.evidenceGap} Estimated ${recommendation.estimatedWeeks} week(s) at ${recommendation.estimatedHoursPerWeek} hours per week. We can make it smaller, switch technology, or start tracking it.`;
}

async function withMalformedRetry<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isMalformed(error) && !isCapacity(error)) throw error;
    if (isCapacity(error)) throw error;
    try {
      return await fn();
    } catch (retryError) {
      if (isCapacity(retryError)) throw retryError;
      if (isMalformed(retryError)) return fallback;
      throw retryError;
    }
  }
}

function isMalformed(error: unknown): boolean {
  return (
    error instanceof ZodError ||
    (error instanceof CareerGrowthError && error.code === "INVALID_AI_OUTPUT")
  );
}

function isCapacity(error: unknown): boolean {
  return (
    error instanceof CareerGrowthError &&
    (error.code === "CAPACITY_UNAVAILABLE" || error.code === "AI_UNAVAILABLE")
  );
}

function errorCategory(error: unknown): string {
  if (error instanceof CareerGrowthError) {
    if (error.code === "CAPACITY_UNAVAILABLE") return "capacity";
    if (error.code === "INVALID_AI_OUTPUT") return "invalid_output";
    if (error.code === "AI_UNAVAILABLE") return "unavailable";
    return error.code.toLowerCase();
  }
  if (error instanceof ZodError) return "invalid_output";
  return "unknown";
}

function defaultLog(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "career-growth", event, ...fields }));
}
