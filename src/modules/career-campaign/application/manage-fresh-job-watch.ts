import { CareerCampaignError } from "../domain/errors";
import {
  enableFreshJobWatchSchema,
  pauseFreshJobWatchSchema,
  type FreshJobWatchStatusView,
} from "../domain/fresh-watch";
import type { JobSearchCampaign } from "../domain/job-campaign";
import type {
  FreshWatchCaps,
  FreshWatchLogger,
  FreshWatchRepository,
} from "./fresh-watch-ports";
import {
  createJobCampaign,
  listJobCampaigns,
  pauseJobCampaign,
  providerWarningFor,
} from "./manage-job-campaigns";
import { LINKEDIN_GUEST_PROVIDER } from "../domain/canonical-search";

export async function enableFreshJobWatch(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    createId: () => string;
    now: () => Date;
    caps: FreshWatchCaps;
    log?: FreshWatchLogger;
  },
): Promise<JobSearchCampaign> {
  const command = enableFreshJobWatchSchema.parse(raw);
  return createJobCampaign(
    {
      userId: command.userId,
      primaryRole: command.primaryRole,
      location: command.location,
      workMode: command.workMode,
      minimumScore: command.minScore,
    },
    deps,
  );
}

export async function pauseFreshJobWatch(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    now: () => Date;
    log?: FreshWatchLogger;
  },
): Promise<JobSearchCampaign> {
  const command = pauseFreshJobWatchSchema.parse(raw);
  const campaigns = await listJobCampaigns(command.userId, {
    repository: deps.repository,
  });
  const active = campaigns.find((item) => item.status === "active");
  if (!active) {
    throw new CareerCampaignError(
      "NOT_FOUND",
      "No active job campaign to pause.",
    );
  }
  return pauseJobCampaign(
    { userId: command.userId, campaignId: active.id },
    deps,
  );
}

export async function getFreshJobWatchStatus(
  userId: string,
  deps: {
    repository: FreshWatchRepository;
  },
): Promise<FreshJobWatchStatusView> {
  const campaigns = await listJobCampaigns(userId, deps);
  const watch = campaigns.find((item) => item.status === "active") ?? campaigns[0];
  if (!watch) {
    return {
      status: "disabled",
      enabled: false,
      primaryRole: null,
      location: null,
      workMode: null,
      lastLinkedInCheckAt: null,
      lastBroadSearchAt: null,
      nextLinkedInCheckAt: null,
      nextBroadSearchAt: null,
      lastDiscoveryAt: null,
      providerWarning: null,
      recommendationsHref: "/app/recommendations",
    };
  }
  const search = await deps.repository.getCanonicalSearchById(
    watch.canonicalSearchId,
  );
  const health = await deps.repository.getProviderHealth(LINKEDIN_GUEST_PROVIDER);
  return {
    status: watch.status === "archived" ? "disabled" : watch.status,
    enabled: watch.status === "active",
    primaryRole: watch.primaryRole,
    location: watch.location,
    workMode: watch.workMode,
    lastLinkedInCheckAt:
      watch.lastLinkedInSearchAt ??
      search?.lastSucceededAt ??
      search?.lastAttemptedAt ??
      null,
    lastBroadSearchAt: watch.lastBroadSearchAt,
    nextLinkedInCheckAt: watch.nextLinkedInSearchAt ?? search?.nextDueAt ?? null,
    nextBroadSearchAt: watch.nextBroadSearchAt,
    lastDiscoveryAt: watch.lastDiscoveryAt,
    providerWarning: providerWarningFor(
      health?.status ?? "ok",
      health?.cooldownUntil ?? null,
    ),
    recommendationsHref: "/app/recommendations",
  };
}
