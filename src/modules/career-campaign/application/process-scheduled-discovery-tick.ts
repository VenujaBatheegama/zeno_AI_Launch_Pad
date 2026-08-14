import type { CareerCampaignRepository } from "./ports";
import type {
  FreshAnalysisResult,
  FreshWatchCaps,
  FreshWatchLogger,
  FreshWatchRepository,
  LinkedInFreshClient,
} from "./fresh-watch-ports";
import { defaultFreshWatchLogger } from "./fresh-watch-ports";
import {
  processLinkedInFreshSearch,
  type LinkedInFreshSearchResult,
} from "./process-linkedin-fresh-search";

export type ScheduledDiscoveryTickResult = {
  runId: string;
  linkedIn: {
    claimed: number;
    processed: number;
    skipped: number;
    failed: number;
    requests: number;
    cards: number;
    repeated: number;
    newIds: number;
    descriptionsFetched: number;
    llmCalls: number;
    recommendations: number;
  };
  broad: {
    claimed: number;
    processed: number;
    failed: number;
    recommended: number;
  };
  notificationsDelivered: number;
};

export type ScheduledDiscoveryTickDependencies = {
  repository: FreshWatchRepository;
  campaignRepository: CareerCampaignRepository;
  createId: () => string;
  now: () => Date;
  caps: FreshWatchCaps;
  linkedIn?: LinkedInFreshClient;
  analyseListing?: (input: {
    userId: string;
    listingId: string;
  }) => Promise<FreshAnalysisResult>;
  processLinkedInSearch?: (input: {
    canonicalSearchId: string;
    runId: string;
  }) => Promise<LinkedInFreshSearchResult>;
  runBroadCampaign: (input: {
    userId: string;
    campaignId: string;
    runId: string;
  }) => Promise<{ recommended: number; status: string }>;
  deliverNotifications?: () => Promise<number>;
  linkedInEnabled?: boolean;
  log?: FreshWatchLogger;
};

export async function processScheduledDiscoveryTick(
  deps: ScheduledDiscoveryTickDependencies,
): Promise<ScheduledDiscoveryTickResult> {
  const log = deps.log ?? defaultFreshWatchLogger;
  const runId = deps.createId();
  const nowIso = deps.now().toISOString();
  const leaseExpiresAt = new Date(
    Date.parse(nowIso) + deps.caps.schedulerLeaseMs,
  ).toISOString();
  log("fresh_tick_started", { runId });

  const summary: ScheduledDiscoveryTickResult = {
    runId,
    linkedIn: {
      claimed: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
      requests: 0,
      cards: 0,
      repeated: 0,
      newIds: 0,
      descriptionsFetched: 0,
      llmCalls: 0,
      recommendations: 0,
    },
    broad: { claimed: 0, processed: 0, failed: 0, recommended: 0 },
    notificationsDelivered: 0,
  };

  const claimedSearches = await deps.repository.claimDueCanonicalSearches({
    now: nowIso,
    leaseOwner: runId,
    leaseExpiresAt,
    limit: deps.caps.maxCanonicalSearchesPerTick,
  });
  summary.linkedIn.claimed = claimedSearches.length;

  for (const search of claimedSearches) {
    try {
      const result = deps.processLinkedInSearch
        ? await deps.processLinkedInSearch({
            canonicalSearchId: search.id,
            runId,
          })
        : await processLinkedInFreshSearch(
            { canonicalSearchId: search.id, runId },
            {
              repository: deps.repository,
              campaignRepository: deps.campaignRepository,
              linkedIn: deps.linkedIn!,
              analyseListing: deps.analyseListing!,
              createId: deps.createId,
              now: deps.now,
              caps: deps.caps,
              linkedInEnabled: deps.linkedInEnabled,
              log,
            },
          );
      summary.linkedIn.processed += 1;
      if (result.skipped) summary.linkedIn.skipped += 1;
      if (result.error) summary.linkedIn.failed += 1;
      summary.linkedIn.requests += result.linkedInRequests;
      summary.linkedIn.cards += result.cardsReturned;
      summary.linkedIn.repeated += result.repeated;
      summary.linkedIn.newIds += result.newlyPersisted;
      summary.linkedIn.descriptionsFetched += result.descriptionsFetched;
      summary.linkedIn.llmCalls += result.llmCalls;
      summary.linkedIn.recommendations += result.recommendationsCreated;
    } catch (error) {
      summary.linkedIn.failed += 1;
      log("linkedin_query_skipped", {
        searchId: search.id,
        reason: "search_failure",
        error: error instanceof Error ? error.message : "failed",
      });
    } finally {
      await deps.repository.releaseCanonicalSearchLease(search.id);
    }
  }

  const claimedCampaigns = await deps.repository.claimDueBroadCampaigns({
    now: nowIso,
    leaseOwner: runId,
    leaseExpiresAt,
    limit: Math.min(3, deps.caps.maxCanonicalSearchesPerTick),
  });
  summary.broad.claimed = claimedCampaigns.length;
  log("broad_campaign_due", { count: claimedCampaigns.length, runId });

  for (const campaign of claimedCampaigns) {
    try {
      const result = await deps.runBroadCampaign({
        userId: campaign.userId,
        campaignId: campaign.id,
        runId,
      });
      summary.broad.processed += 1;
      summary.broad.recommended += result.recommended;
      await deps.repository.updateCampaign(campaign.id, {
        lastBroadSearchAt: nowIso,
        nextBroadSearchAt: new Date(
          Date.parse(nowIso) + deps.caps.broadIntervalMs,
        ).toISOString(),
        lastError: result.status === "failed" ? "broad_failed" : null,
      });
      log("broad_campaign_completed", {
        userId: campaign.userId,
        campaignId: campaign.id,
        status: result.status,
        recommended: result.recommended,
      });
    } catch (error) {
      summary.broad.failed += 1;
      await deps.repository.updateCampaign(campaign.id, {
        lastError:
          error instanceof Error ? error.message.slice(0, 300) : "failed",
        nextBroadSearchAt: new Date(
          Date.parse(nowIso) + deps.caps.broadIntervalMs,
        ).toISOString(),
      });
    } finally {
      await deps.repository.releaseBroadCampaignLease(campaign.id);
    }
  }

  if (deps.deliverNotifications) {
    summary.notificationsDelivered = await deps.deliverNotifications();
  }

  log("fresh_tick_completed", { ...summary });
  return summary;
}
