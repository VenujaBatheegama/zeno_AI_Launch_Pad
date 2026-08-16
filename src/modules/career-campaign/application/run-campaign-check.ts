import { z } from "zod";

import { CareerCampaignError } from "../domain/errors";
import {
  campaignRunTriggerSchema,
  type CampaignRun,
} from "../domain/schemas";
import type { CareerCampaignRepository } from "./ports";

export const runCampaignCheckCommandSchema = z.object({
  userId: z.uuid(),
  trigger: campaignRunTriggerSchema,
  idempotencyKey: z.string().min(8).max(200),
});

export type RunCampaignCheckCommand = z.infer<
  typeof runCampaignCheckCommandSchema
>;

export type CampaignCheckDependencies = {
  repository: CareerCampaignRepository;
  createId: () => string;
  now: () => Date;
  /** Discover + rank + analyse orchestration hooks into existing modules. */
  executeSearch: (userId: string) => Promise<{
    jobsFound: number;
    listingIds: string[];
    searchProfileId: string | null;
    partialFailure: boolean;
    warnings: string[];
  }>;
  analyseListings: (
    userId: string,
    listingIds: string[],
  ) => Promise<
    Array<{
      listingId: string;
      ok: boolean;
      matchAnalysisId?: string;
      evidenceFitScore?: number;
      careerLevel?: string;
      hardConstraintEligible?: boolean;
      analysisConfidence?: string;
      scoringPolicyVersion?: string;
      matchingPolicyVersion?: string;
      explanation?: string;
      topMatched?: string[];
      primaryGaps?: string[];
      rankingReasons?: string[];
      title?: string;
      organizationName?: string | null;
      applicationUrl?: string | null;
      location?: string | null;
      workMode?: string | null;
      searchRelevance?: number;
      interestAlignment?: number;
      error?: string;
    }>
  >;
  caps: {
    analysisBatchSize: number;
    maxRecommendations: number;
    minScore: number;
  };
  whatsappOptedIn?: (userId: string) => Promise<boolean>;
  telegramOptedIn?: (userId: string) => Promise<boolean>;
};

export type CampaignCheckResult = {
  run: CampaignRun;
  reused: boolean;
  recommendedIds: string[];
};

export async function runCampaignCheck(
  raw: RunCampaignCheckCommand,
  deps: CampaignCheckDependencies,
): Promise<CampaignCheckResult> {
  const command = runCampaignCheckCommandSchema.parse(raw);
  const existing = await deps.repository.getRunByIdempotencyKey(
    command.idempotencyKey,
  );
  if (
    existing &&
    (existing.status === "completed" || existing.status === "partially_failed")
  ) {
    return { run: existing, reused: true, recommendedIds: [] };
  }

  if (
    existing &&
    (existing.status === "queued" || existing.status === "running")
  ) {
    return continueRun(existing, command, deps, false);
  }

  // Failed runs are retryable: use a derived key so the unique constraint
  // still blocks duplicate concurrent retries of the same attempt.
  let idempotencyKey = command.idempotencyKey;
  if (existing?.status === "failed") {
    idempotencyKey = `${command.idempotencyKey}:retry`;
    const retryExisting =
      await deps.repository.getRunByIdempotencyKey(idempotencyKey);
    if (
      retryExisting &&
      (retryExisting.status === "completed" ||
        retryExisting.status === "partially_failed")
    ) {
      return { run: retryExisting, reused: true, recommendedIds: [] };
    }
    if (
      retryExisting &&
      (retryExisting.status === "queued" || retryExisting.status === "running")
    ) {
      return continueRun(
        retryExisting,
        { ...command, idempotencyKey },
        deps,
        false,
      );
    }
    if (retryExisting?.status === "failed") {
      idempotencyKey = `${command.idempotencyKey}:retry:${deps.now().toISOString()}`;
    }
  }

  const active = await deps.repository.findActiveRun(command.userId);
  if (active && active.idempotencyKey !== idempotencyKey) {
    throw new CareerCampaignError(
      "RUN_IN_PROGRESS",
      "A campaign check is already running. Wait for it to finish.",
    );
  }

  const { run, created } = await deps.repository.createOrGetRun({
    id: deps.createId(),
    userId: command.userId,
    searchProfileId: null,
    trigger: command.trigger,
    idempotencyKey,
    createdAt: deps.now().toISOString(),
  });

  if (!created && run.status !== "queued" && run.status !== "failed") {
    return { run, reused: true, recommendedIds: [] };
  }

  return continueRun(
    run,
    { ...command, idempotencyKey },
    deps,
    true,
  );
}

async function continueRun(
  run: CampaignRun,
  command: RunCampaignCheckCommand,
  deps: CampaignCheckDependencies,
  startedFresh: boolean,
): Promise<CampaignCheckResult> {
  const startedAt = deps.now().toISOString();
  let current = await deps.repository.updateRun(command.userId, run.id, {
    status: "running",
    startedAt: run.startedAt ?? startedAt,
  });

  const recommendedIds: string[] = [];
  const errors: string[] = [];
  let discovered = 0;
  let analysed = 0;
  let recommended = 0;
  let failed = 0;

  try {
    const search = await deps.executeSearch(command.userId);
    discovered = search.jobsFound;
    current = await deps.repository.updateRun(command.userId, run.id, {
      searchProfileId: search.searchProfileId,
      discoveredCount: discovered,
      deduplicatedCount: search.listingIds.length,
    });

    if (search.partialFailure) {
      errors.push(...search.warnings.slice(0, 5));
    }

    const skip = await deps.repository.listRejectedOrAppliedListingIds(
      command.userId,
    );
    const activeRecs =
      await deps.repository.listListingIdsWithActiveRecommendations(
        command.userId,
      );

    const shortlist = search.listingIds
      .filter((id) => !skip.has(id))
      .slice(0, deps.caps.analysisBatchSize);

    const analyses = await deps.analyseListings(command.userId, shortlist);
    analysed = analyses.filter((item) => item.ok).length;
    failed += analyses.filter((item) => !item.ok).length;
    for (const item of analyses.filter((row) => !row.ok)) {
      if (item.error) errors.push(item.error);
    }

    const eligible = analyses
      .filter(
        (item) =>
          item.ok &&
          item.matchAnalysisId &&
          (item.evidenceFitScore ?? 0) >= deps.caps.minScore &&
          item.hardConstraintEligible !== false &&
          !activeRecs.has(item.listingId),
      )
      .sort(
        (a, b) => (b.evidenceFitScore ?? 0) - (a.evidenceFitScore ?? 0),
      )
      .slice(0, deps.caps.maxRecommendations);

    const whatsappOk = deps.whatsappOptedIn
      ? await deps.whatsappOptedIn(command.userId)
      : false;
    const telegramOk = deps.telegramOptedIn
      ? await deps.telegramOptedIn(command.userId)
      : false;

    for (const item of eligible) {
      const { recommendation, created } =
        await deps.repository.upsertRecommendation({
          id: deps.createId(),
          userId: command.userId,
          listingId: item.listingId,
          jobMatchAnalysisId: item.matchAnalysisId!,
          campaignRunId: run.id,
          scoreSnapshot: {
            evidenceFitScore: item.evidenceFitScore ?? 0,
            careerLevel: item.careerLevel ?? "unknown",
            hardConstraintEligible: item.hardConstraintEligible ?? true,
            analysisConfidence: item.analysisConfidence ?? "medium",
            scoringPolicyVersion: item.scoringPolicyVersion ?? "v2",
            matchingPolicyVersion: item.matchingPolicyVersion,
            searchRelevance: item.searchRelevance,
            interestAlignment: item.interestAlignment,
            finalScore: item.evidenceFitScore,
          },
          fitSummarySnapshot: {
            explanation: item.explanation ?? "",
            topMatched: item.topMatched ?? [],
            primaryGaps: item.primaryGaps ?? [],
            rankingReasons: item.rankingReasons ?? [],
            title: item.title,
            organizationName: item.organizationName ?? null,
            applicationUrl: item.applicationUrl ?? null,
            location: item.location ?? null,
            workMode: item.workMode ?? null,
          },
          scoringPolicyVersion: item.scoringPolicyVersion ?? "v2",
          recommendedAt: deps.now().toISOString(),
        });

      if (!created) continue;
      recommended += 1;
      recommendedIds.push(recommendation.id);

      await deps.repository.enqueueNotification({
        id: deps.createId(),
        userId: command.userId,
        eventType: "recommendation_created",
        channel: "in_app",
        relatedEntityType: "job_recommendation",
        relatedEntityId: recommendation.id,
        payload: {
          title: item.title ?? "New job recommendation",
          listingId: item.listingId,
          evidenceFitScore: item.evidenceFitScore,
        },
        idempotencyKey: `rec:${recommendation.id}:in_app`,
        scheduledAt: deps.now().toISOString(),
      });

      if (whatsappOk) {
        await deps.repository.enqueueNotification({
          id: deps.createId(),
          userId: command.userId,
          eventType: "recommendation_created",
          channel: "whatsapp",
          relatedEntityType: "job_recommendation",
          relatedEntityId: recommendation.id,
          payload: {
            title: item.title ?? "New job recommendation",
            listingId: item.listingId,
          },
          idempotencyKey: `rec:${recommendation.id}:whatsapp`,
          scheduledAt: deps.now().toISOString(),
        });
      }

      if (telegramOk) {
        await deps.repository.enqueueNotification({
          id: deps.createId(),
          userId: command.userId,
          eventType: "recommendation_created",
          channel: "telegram",
          relatedEntityType: "job_recommendation",
          relatedEntityId: recommendation.id,
          payload: {
            title: item.title ?? "New job recommendation",
            listingId: item.listingId,
            reviewPath: "/app/recommendations",
          },
          idempotencyKey: `rec:${recommendation.id}:telegram`,
          scheduledAt: deps.now().toISOString(),
        });
      }
    }

    const status =
      errors.length > 0 || failed > 0
        ? recommended > 0 || analysed > 0
          ? "partially_failed"
          : "failed"
        : "completed";

    current = await deps.repository.updateRun(command.userId, run.id, {
      status,
      completedAt: deps.now().toISOString(),
      discoveredCount: discovered,
      analysedCount: analysed,
      recommendedCount: recommended,
      failedCount: failed,
      errorSummary: errors.length ? errors.slice(0, 8).join("; ") : null,
    });

    console.info(
      JSON.stringify({
        scope: "career-campaign",
        event: "run_completed",
        runId: current.id,
        userId: command.userId,
        status: current.status,
        discovered,
        analysed,
        recommended,
        failed,
        startedFresh,
      }),
    );

    return { run: current, reused: false, recommendedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Campaign check failed";
    current = await deps.repository.updateRun(command.userId, run.id, {
      status: "failed",
      completedAt: deps.now().toISOString(),
      failedCount: failed + 1,
      errorSummary: message.slice(0, 500),
    });
    console.error(
      JSON.stringify({
        scope: "career-campaign",
        event: "run_failed",
        runId: current.id,
        userId: command.userId,
        error: message,
      }),
    );
    throw error;
  }
}
