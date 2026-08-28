import { canonicalizeJobUrl } from "@/modules/job-discovery/domain/dedupe";
import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";
import { titleMatchesExcludedKeyword } from "@/modules/job-discovery/domain/job";
import { jobMatchesLocationPreferences } from "@/modules/job-discovery/domain/location-match";
import type { NormalizedExternalJob } from "@/modules/job-discovery/domain/job";

import {
  jobIdentityFingerprint,
  LINKEDIN_GUEST_PROVIDER,
} from "../domain/canonical-search";
import type { CareerCampaignRepository } from "./ports";
import type {
  FreshAnalysisResult,
  FreshWatchCaps,
  FreshWatchLogger,
  FreshWatchRepository,
  LinkedInFreshClient,
} from "./fresh-watch-ports";
import { defaultFreshWatchLogger } from "./fresh-watch-ports";

export function getDigestScheduledAt(now: Date): string {
  const hour = now.getUTCHours();
  // Quiet hours: 10 PM to 8 AM UTC
  if (hour >= 22 || hour < 8) {
    const scheduled = new Date(now);
    if (hour >= 22) {
      scheduled.setUTCDate(scheduled.getUTCDate() + 1);
    }
    scheduled.setUTCHours(8, 0, 0, 0);
    return scheduled.toISOString();
  }
  return now.toISOString();
}
export type ProcessLinkedInFreshSearchCommand = {
  canonicalSearchId: string;
  runId: string;
};

export type LinkedInFreshSearchResult = {
  canonicalSearchId: string;
  linkedInRequests: number;
  cardsReturned: number;
  repeated: number;
  newlyPersisted: number;
  descriptionsFetched: number;
  crossProviderDuplicates: number;
  deterministicRejected: number;
  llmCalls: number;
  llmCallsSaved: number;
  recommendationsCreated: number;
  skipped: boolean;
  skipReason: string | null;
  error: string | null;
};

export async function processLinkedInFreshSearch(
  command: ProcessLinkedInFreshSearchCommand,
  deps: {
    repository: FreshWatchRepository;
    campaignRepository: CareerCampaignRepository;
    linkedIn: LinkedInFreshClient;
    analyseListing: (input: {
      userId: string;
      listingId: string;
    }) => Promise<FreshAnalysisResult>;
    createId: () => string;
    now: () => Date;
    caps: FreshWatchCaps;
    linkedInEnabled?: boolean;
    telegramEnabled?: boolean;
    log?: FreshWatchLogger;
  },
): Promise<LinkedInFreshSearchResult> {
  const log = deps.log ?? defaultFreshWatchLogger;
  const now = deps.now();
  const nowIso = now.toISOString();
  const empty: LinkedInFreshSearchResult = {
    canonicalSearchId: command.canonicalSearchId,
    linkedInRequests: 0,
    cardsReturned: 0,
    repeated: 0,
    newlyPersisted: 0,
    descriptionsFetched: 0,
    crossProviderDuplicates: 0,
    deterministicRejected: 0,
    llmCalls: 0,
    llmCallsSaved: 0,
    recommendationsCreated: 0,
    skipped: false,
    skipReason: null,
    error: null,
  };

  const search = await deps.repository.getCanonicalSearchById(
    command.canonicalSearchId,
  );
  if (!search) {
    return { ...empty, skipped: true, skipReason: "missing_search" };
  }

  const members = await deps.repository.listMembers(search.id);
  const campaigns = await Promise.all(
    members.map(async (member) => ({
      member,
      campaign: await deps.repository.getCampaignById(member.campaignId),
    })),
  );
  const active = campaigns.filter(
    (row) => row.campaign?.status === "active" && !row.campaign.archivedAt,
  );
  if (active.length === 0) {
    log("linkedin_query_skipped", {
      searchId: search.id,
      reason: "no_active_members",
    });
    await deps.repository.updateCanonicalSearch(search.id, {
      nextDueAt: addMs(nowIso, deps.caps.linkedInIntervalMs),
      lastError: null,
    });
    return { ...empty, skipped: true, skipReason: "no_active_members" };
  }

  if (deps.linkedInEnabled === false) {
    await markProviderHealth(deps.repository, "disabled", nowIso, null, "disabled");
    log("linkedin_query_skipped", { searchId: search.id, reason: "provider_disabled" });
    return { ...empty, skipped: true, skipReason: "provider_disabled" };
  }

  const health = await deps.repository.getProviderHealth(LINKEDIN_GUEST_PROVIDER);
  if (
    health &&
    (health.status === "cooldown" || health.status === "suspended") &&
    health.cooldownUntil &&
    health.cooldownUntil > nowIso
  ) {
    log("linkedin_query_skipped", {
      searchId: search.id,
      reason: "provider_cooldown",
      cooldownUntil: health.cooldownUntil,
    });
    return { ...empty, skipped: true, skipReason: "provider_cooldown" };
  }

  log("linkedin_query_attempted", {
    searchId: search.id,
    role: search.primaryRole,
    location: search.location,
    recencySeconds: deps.caps.linkedInRecencySeconds,
  });

  let cards: NormalizedExternalJob[] = [];
  try {
    const result = await deps.linkedIn.searchFreshCards({
      keywords: search.primaryRole,
      location: search.location,
      recencySeconds: deps.caps.linkedInRecencySeconds,
      maxPages: deps.caps.linkedInMaxPages,
      pageSize: deps.caps.linkedInMaxResults,
    });
    cards = result.jobs;
    empty.linkedInRequests = 1;
    await markProviderHealth(deps.repository, "ok", nowIso, 200, null);
  } catch (error) {
    empty.linkedInRequests = 1;
    const { status, cooldown } = classifyLinkedInFailure(error, deps.caps.providerCooldownMs);
    await markProviderHealth(
      deps.repository,
      status,
      nowIso,
      status === "cooldown" ? 429 : 403,
      error instanceof Error ? error.message : "linkedin_failed",
      addMs(nowIso, cooldown),
    );
    log(status === "cooldown" ? "linkedin_rate_limited" : "linkedin_suspended", {
      searchId: search.id,
    });
    await deps.repository.updateCanonicalSearch(search.id, {
      lastAttemptedAt: nowIso,
      lastError: error instanceof Error ? error.message.slice(0, 300) : "failed",
      nextDueAt: addMs(nowIso, deps.caps.linkedInIntervalMs),
    });
    return {
      ...empty,
      error: error instanceof Error ? error.message : "linkedin_failed",
    };
  }

  empty.cardsReturned = cards.length;
  log("search_cards_returned", { searchId: search.id, count: cards.length });

  if (cards.length === 0) {
    await finishSearch(deps.repository, search.id, nowIso, deps.caps.linkedInIntervalMs, {
      cards: 0,
    });
    log("llm_analyses_avoided", { searchId: search.id, reason: "empty_result", saved: 0 });
    return empty;
  }

  const newSightings: Array<{
    listingId: string;
    job: NormalizedExternalJob;
    firstSeenAt: string;
    publishedAt: string | null;
  }> = [];

  for (const job of cards) {
    const fingerprint = jobIdentityFingerprint({
      company: job.organization?.name ?? null,
      title: job.title,
      location: job.location,
      publishedAt: job.published_at,
    });
    const prior = await deps.repository.findSightingByFingerprint(fingerprint);
    const sighting = await deps.repository.observeProviderJob({
      provider: LINKEDIN_GUEST_PROVIDER,
      providerJobId: job.external_id,
      title: job.title,
      company: job.organization?.name ?? null,
      location: job.location,
      publicUrl: canonicalizeJobUrl(job.application_url ?? job.source_url),
      publishedAt: job.published_at,
      fingerprint,
      seenAt: nowIso,
    });
    if (!sighting.isNew) {
      empty.repeated += 1;
      if (sighting.listingId) {
        for (const row of active) {
          if (!row.campaign) continue;
          await deps.repository.attachCampaignListing({
            campaignId: row.campaign.id,
            listingId: sighting.listingId,
            discoverySource: "linkedin_fresh",
            seenAt: nowIso,
            originatingRunId: command.runId,
          });
        }
      }
      continue;
    }
    empty.newlyPersisted += 1;
    if (
      prior &&
      !(
        prior.provider === LINKEDIN_GUEST_PROVIDER &&
        prior.providerJobId === job.external_id
      )
    ) {
      empty.crossProviderDuplicates += 1;
      log("cross_provider_duplicate_detected", {
        providerJobId: job.external_id,
        fingerprint,
      });
      continue;
    }
    if (!passesCheapFilters(job, search.location, search.workMode)) {
      empty.deterministicRejected += 1;
      log("deterministic_filters_rejected", { providerJobId: job.external_id });
      continue;
    }
    if (!sighting.listingId) continue;
    newSightings.push({
      listingId: sighting.listingId,
      job,
      firstSeenAt: sighting.firstSeenAt,
      publishedAt: sighting.publishedAt,
    });
  }

  log("existing_provider_ids_discarded", { count: empty.repeated });
  log("new_provider_ids_persisted", { count: empty.newlyPersisted });

  if (newSightings.length === 0) {
    await finishSearch(deps.repository, search.id, nowIso, deps.caps.linkedInIntervalMs, {
      cards: cards.length,
      repeated: empty.repeated,
    });
    empty.llmCallsSaved = cards.length;
    log("llm_analyses_avoided", {
      searchId: search.id,
      reason: "all_seen_or_rejected",
      saved: empty.llmCallsSaved,
    });
    return empty;
  }

  for (const item of newSightings) {
    if (empty.descriptionsFetched >= deps.caps.maxDescriptionFetchesPerTick) break;
    const existing = await deps.repository.getListingDescription(item.listingId);
    if (existing && existing.trim().length >= 80) continue;
    const description = await deps.linkedIn.fetchJobDescription(item.job.external_id);
    if (!description) continue;
    await deps.repository.setJobDescriptionIfEmpty({
      listingId: item.listingId,
      description,
    });
    empty.descriptionsFetched += 1;
  }
  log("full_descriptions_fetched", { count: empty.descriptionsFetched });

  let analysesThisTick = 0;
  const analysedByUserListing = new Map<string, FreshAnalysisResult>();
  for (const row of active) {
    const campaign = row.campaign;
    if (!campaign) continue;
    let analysesForUser = 0;
    const skip = await deps.campaignRepository.listRejectedOrAppliedListingIds(
      campaign.userId,
    );
    const activeRecs =
      await deps.campaignRepository.listListingIdsWithActiveRecommendations(
        campaign.userId,
      );

    for (const item of newSightings) {
      const attached = await deps.repository.attachCampaignListing({
        campaignId: campaign.id,
        listingId: item.listingId,
        discoverySource: "linkedin_fresh",
        seenAt: nowIso,
        originatingRunId: command.runId,
      });
      if (skip.has(item.listingId) || activeRecs.has(item.listingId)) {
        log("recommendation_suppressed", {
          userId: campaign.userId,
          listingId: item.listingId,
          reason: "already_recommended_or_closed",
        });
        continue;
      }
      const description = await deps.repository.getListingDescription(item.listingId);
      if (!description || description.trim().length < 80) {
        empty.llmCallsSaved += 1;
        continue;
      }
      if (analysesThisTick >= deps.caps.maxGroqAnalysesPerTick) {
        empty.llmCallsSaved += 1;
        continue;
      }
      if (analysesForUser >= deps.caps.maxAnalysesPerUser) {
        empty.llmCallsSaved += 1;
        continue;
      }

      await deps.repository.attachUserJob({
        userId: campaign.userId,
        listingId: item.listingId,
        seenAt: nowIso,
      });

      const analysisKey = `${campaign.userId}:${item.listingId}`;
      const cachedAnalysis = analysedByUserListing.get(analysisKey);
      log("llm_analyses_requested", {
        userId: campaign.userId,
        listingId: item.listingId,
        reused: Boolean(cachedAnalysis),
      });
      const analysis =
        cachedAnalysis ??
        (await deps.analyseListing({
          userId: campaign.userId,
          listingId: item.listingId,
        }));
      if (!cachedAnalysis) analysedByUserListing.set(analysisKey, analysis);
      const llm = cachedAnalysis
        ? 0
        : (analysis.llmCalls ?? (analysis.extractionCacheHit ? 0 : 1));
      empty.llmCalls += llm;
      if (analysis.extractionCacheHit || cachedAnalysis) empty.llmCallsSaved += 1;
      if (!cachedAnalysis) {
        analysesThisTick += 1;
        analysesForUser += 1;
      }

      const minScore = campaign.minimumScore ?? deps.caps.minScore;
      if (
        !analysis.ok ||
        !analysis.matchAnalysisId ||
        (analysis.evidenceFitScore ?? 0) < minScore ||
        analysis.hardConstraintEligible === false
      ) {
        await deps.repository.updateCampaignListingQualification({
          campaignId: campaign.id,
          listingId: item.listingId,
          qualification:
            analysis.hardConstraintEligible === false
              ? "ineligible"
              : "below_threshold",
        });
        log("recommendation_suppressed", {
          userId: campaign.userId,
          listingId: item.listingId,
          reason: "weak_or_ineligible",
          score: analysis.evidenceFitScore ?? 0,
        });
        continue;
      }
      if (campaign.initialAlertsRemaining <= 0) {
        log("recommendation_suppressed", {
          userId: campaign.userId,
          listingId: item.listingId,
          reason: "initial_alert_cap",
        });
        continue;
      }

      const { recommendation, created } =
        await deps.campaignRepository.upsertRecommendation({
          id: deps.createId(),
          userId: campaign.userId,
          listingId: item.listingId,
          jobMatchAnalysisId: analysis.matchAnalysisId,
          campaignRunId: null,
          jobSearchCampaignId: campaign.id,
          scoreSnapshot: {
            evidenceFitScore: analysis.evidenceFitScore ?? 0,
            careerLevel: analysis.careerLevel ?? "unknown",
            hardConstraintEligible: analysis.hardConstraintEligible ?? true,
            analysisConfidence: analysis.analysisConfidence ?? "medium",
            scoringPolicyVersion: analysis.scoringPolicyVersion ?? "v2",
            matchingPolicyVersion: analysis.matchingPolicyVersion,
            finalScore: analysis.evidenceFitScore,
          },
          fitSummarySnapshot: {
            explanation: analysis.explanation ?? "",
            topMatched: analysis.topMatched ?? [],
            primaryGaps: analysis.primaryGaps ?? [],
            rankingReasons: [
              "Newly discovered",
              `First seen by Zeno ${relativeMinutes(item.firstSeenAt, now)}`,
              item.publishedAt
                ? "Posted recently"
                : "Publication time unavailable",
            ],
            title: analysis.title ?? item.job.title,
            organizationName:
              analysis.organizationName ?? item.job.organization?.name ?? null,
            applicationUrl:
              analysis.applicationUrl ?? item.job.application_url ?? null,
            location: analysis.location ?? item.job.location,
            workMode: analysis.workMode ?? item.job.work_mode,
          },
          scoringPolicyVersion: analysis.scoringPolicyVersion ?? "v2",
          recommendedAt: nowIso,
        });
      if (!created) continue;

      await deps.repository.updateCampaignListingQualification({
        campaignId: campaign.id,
        listingId: item.listingId,
        qualification: "qualifying",
      });

      const { created: queued } = await deps.campaignRepository.enqueueNotification({
        id: deps.createId(),
        userId: campaign.userId,
        eventType: "recommendation_created",
        channel: "in_app",
        relatedEntityType: "job_recommendation",
        relatedEntityId: recommendation.id,
        payload: {
          title: analysis.title ?? item.job.title,
          listingId: item.listingId,
          firstSeenAt: item.firstSeenAt,
          publishedAt: item.publishedAt,
          freshness: "newly_discovered",
          campaignId: campaign.id,
        },
        idempotencyKey: `rec:${recommendation.id}:in_app`,
        scheduledAt: nowIso,
      });
      const telegramLink = await deps.campaignRepository.getTelegramLink(
        campaign.userId,
      );
      if (
        deps.telegramEnabled &&
        telegramLink?.optedInAt &&
        !telegramLink.optedOutAt
      ) {
        await deps.campaignRepository.enqueueNotification({
          id: deps.createId(),
          userId: campaign.userId,
          eventType: "recommendation_created",
          channel: "telegram",
          relatedEntityType: "job_recommendation",
          relatedEntityId: recommendation.id,
          payload: {
            title: analysis.title ?? item.job.title,
            listingId: item.listingId,
            freshness: "newly_discovered",
            campaignId: campaign.id,
            reviewPath: "/app/recommendations",
          },
          idempotencyKey: `rec:${recommendation.id}:telegram`,
          scheduledAt: getDigestScheduledAt(deps.now()),
        });
      }
      if (queued) {
        empty.recommendationsCreated += 1;
        await deps.repository.updateCampaign(campaign.id, {
          initialAlertsRemaining: Math.max(0, campaign.initialAlertsRemaining - 1),
          lastDiscoveryAt: nowIso,
        });
        campaign.initialAlertsRemaining = Math.max(
          0,
          campaign.initialAlertsRemaining - 1,
        );
        log("recommendation_created", {
          userId: campaign.userId,
          recommendationId: recommendation.id,
          campaignId: campaign.id,
        });
        log("notification_queued", {
          userId: campaign.userId,
          recommendationId: recommendation.id,
        });
      }
      void attached;
    }

    await deps.repository.updateCampaign(campaign.id, {
      lastLinkedInSearchAt: nowIso,
      nextLinkedInSearchAt: addMs(nowIso, deps.caps.linkedInIntervalMs),
    });
  }

  await finishSearch(deps.repository, search.id, nowIso, deps.caps.linkedInIntervalMs, {
    cards: cards.length,
    repeated: empty.repeated,
    new: empty.newlyPersisted,
    fetched: empty.descriptionsFetched,
    llm: empty.llmCalls,
    recommended: empty.recommendationsCreated,
  });
  return empty;
}

function passesCheapFilters(
  job: NormalizedExternalJob,
  location: string,
  workMode: string,
): boolean {
  if (!jobMatchesLocationPreferences(job, [location])) return false;
  if (titleMatchesExcludedKeyword(job.title, [])) return false;
  if (
    workMode !== "any" &&
    job.work_mode &&
    job.work_mode !== workMode
  ) {
    return false;
  }
  return true;
}

function classifyLinkedInFailure(
  error: unknown,
  cooldownMs: number,
): { status: "cooldown" | "suspended"; cooldown: number } {
  if (error instanceof JobDiscoveryError && error.code === "SOURCE_RATE_LIMITED") {
    return { status: "cooldown", cooldown: cooldownMs };
  }
  if (error instanceof JobDiscoveryError && error.code === "SOURCE_FORBIDDEN") {
    return { status: "suspended", cooldown: cooldownMs };
  }
  return { status: "cooldown", cooldown: cooldownMs };
}

async function markProviderHealth(
  repository: FreshWatchRepository,
  status: "ok" | "cooldown" | "suspended" | "disabled",
  nowIso: string,
  statusCode: number | null,
  lastError: string | null,
  cooldownUntil?: string,
) {
  const current = await repository.getProviderHealth(LINKEDIN_GUEST_PROVIDER);
  await repository.upsertProviderHealth({
    provider: LINKEDIN_GUEST_PROVIDER,
    status,
    cooldownUntil: status === "ok" ? null : (cooldownUntil ?? null),
    lastStatusCode: statusCode,
    lastError,
    consecutiveFailures:
      status === "ok" ? 0 : (current?.consecutiveFailures ?? 0) + 1,
    updatedAt: nowIso,
  });
}

async function finishSearch(
  repository: FreshWatchRepository,
  searchId: string,
  nowIso: string,
  intervalMs: number,
  summary: Record<string, unknown>,
) {
  await repository.updateCanonicalSearch(searchId, {
    lastAttemptedAt: nowIso,
    lastSucceededAt: nowIso,
    lastError: null,
    lastResultSummary: summary,
    nextDueAt: addMs(nowIso, intervalMs),
  });
}

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function relativeMinutes(firstSeenAt: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - Date.parse(firstSeenAt)) / 60_000),
  );
  if (minutes <= 1) return "just now";
  return `${minutes} minutes ago`;
}
