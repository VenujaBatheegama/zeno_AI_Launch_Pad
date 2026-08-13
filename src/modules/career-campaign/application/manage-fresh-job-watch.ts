import { CareerCampaignError } from "../domain/errors";
import {
  canonicalLinkedInSearchKey,
  FRESH_RECENCY_STRATEGY,
  LINKEDIN_GUEST_PROVIDER,
} from "../domain/canonical-search";
import {
  enableFreshJobWatchSchema,
  pauseFreshJobWatchSchema,
  type FreshJobWatch,
  type FreshJobWatchStatusView,
} from "../domain/fresh-watch";
import type {
  FreshWatchCaps,
  FreshWatchLogger,
  FreshWatchRepository,
} from "./fresh-watch-ports";
import { defaultFreshWatchLogger } from "./fresh-watch-ports";

export async function enableFreshJobWatch(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    createId: () => string;
    now: () => Date;
    caps: FreshWatchCaps;
    log?: FreshWatchLogger;
  },
): Promise<FreshJobWatch> {
  const command = enableFreshJobWatchSchema.parse(raw);
  const now = deps.now().toISOString();
  const log = deps.log ?? defaultFreshWatchLogger;
  const key = canonicalLinkedInSearchKey({
    primaryRole: command.primaryRole,
    location: command.location,
    workMode: command.workMode,
  });

  let search = await deps.repository.getCanonicalSearchByKey(key);
  const createdSearch = !search;
  if (!search) {
    search = await deps.repository.upsertCanonicalSearch({
      id: deps.createId(),
      canonicalKey: key,
      provider: LINKEDIN_GUEST_PROVIDER,
      primaryRole: command.primaryRole.trim(),
      location: command.location.trim(),
      workMode: command.workMode,
      employmentType: null,
      recencyStrategy: FRESH_RECENCY_STRATEGY,
      nextDueAt: now,
      lastAttemptedAt: null,
      lastSucceededAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      lastResultSummary: {},
      createdAt: now,
      updatedAt: now,
    });
    log("canonical_subscription_created", { canonicalKey: key, searchId: search.id });
  } else {
    log("canonical_subscription_reused", { canonicalKey: key, searchId: search.id });
    if (search.nextDueAt > now) {
      search = await deps.repository.updateCanonicalSearch(search.id, {
        nextDueAt: now,
      });
    }
  }

  const existing = await deps.repository.getWatchByUserId(command.userId);
  const watch: FreshJobWatch = {
    id: existing?.id ?? deps.createId(),
    userId: command.userId,
    status: "active",
    primaryRole: command.primaryRole.trim(),
    location: command.location.trim(),
    workMode: command.workMode,
    minScore: command.minScore ?? null,
    canonicalSearchId: search.id,
    lastBroadSearchAt: existing?.lastBroadSearchAt ?? null,
    nextBroadSearchAt: existing?.nextBroadSearchAt ?? addMs(now, deps.caps.broadIntervalMs),
    lastDiscoveryAt: existing?.lastDiscoveryAt ?? null,
    lastError: null,
    initialAlertsRemaining:
      existing?.initialAlertsRemaining ?? deps.caps.initialAlertCap,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const saved = await deps.repository.upsertWatch(watch);
  await deps.repository.replaceMembership({
    watchId: saved.id,
    userId: saved.userId,
    canonicalSearchId: search.id,
    attachedAt: now,
  });
  log(existing ? "watch_criteria_changed" : "watch_enabled", {
    userId: command.userId,
    watchId: saved.id,
    createdSearch,
  });
  return saved;
}

export async function pauseFreshJobWatch(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    now: () => Date;
    log?: FreshWatchLogger;
  },
): Promise<FreshJobWatch> {
  const command = pauseFreshJobWatchSchema.parse(raw);
  const watch = await deps.repository.getWatchByUserId(command.userId);
  if (!watch) {
    throw new CareerCampaignError(
      "NOT_FOUND",
      "Fresh Job Watch is not enabled yet.",
    );
  }
  const updated = await deps.repository.updateWatch(watch.id, {
    status: "paused",
    updatedAt: deps.now().toISOString(),
  } as Partial<FreshJobWatch>);
  (deps.log ?? defaultFreshWatchLogger)("watch_paused", {
    userId: command.userId,
    watchId: watch.id,
  });
  return updated;
}

export async function getFreshJobWatchStatus(
  userId: string,
  deps: {
    repository: FreshWatchRepository;
  },
): Promise<FreshJobWatchStatusView> {
  const watch = await deps.repository.getWatchByUserId(userId);
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
  const providerWarning = providerWarningFor(health?.status ?? "ok", health?.cooldownUntil ?? null);
  return {
    status: watch.status,
    enabled: watch.status === "active",
    primaryRole: watch.primaryRole,
    location: watch.location,
    workMode: watch.workMode,
    lastLinkedInCheckAt: search?.lastSucceededAt ?? search?.lastAttemptedAt ?? null,
    lastBroadSearchAt: watch.lastBroadSearchAt,
    nextLinkedInCheckAt: search?.nextDueAt ?? null,
    nextBroadSearchAt: watch.nextBroadSearchAt,
    lastDiscoveryAt: watch.lastDiscoveryAt,
    providerWarning,
    recommendationsHref: "/app/recommendations",
  };
}

function providerWarningFor(
  status: string,
  cooldownUntil: string | null,
): string | null {
  if (status === "disabled") {
    return "LinkedIn guest search is turned off. Broad search can still run.";
  }
  if (status === "cooldown" || status === "suspended") {
    return cooldownUntil
      ? `LinkedIn is temporarily unavailable. Next retry after ${cooldownUntil}.`
      : "LinkedIn is temporarily unavailable.";
  }
  return null;
}

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}
