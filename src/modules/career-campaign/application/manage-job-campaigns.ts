import { CareerCampaignError } from "../domain/errors";
import {
  canonicalLinkedInSearchKey,
  FRESH_RECENCY_STRATEGY,
  LINKEDIN_GUEST_PROVIDER,
} from "../domain/canonical-search";
import {
  ACTIVE_JOB_CAMPAIGN_LIMIT,
  campaignIdCommandSchema,
  campaignNeedsAttention,
  createJobCampaignSchema,
  generateCampaignName,
  patchJobCampaignSchema,
  type JobCampaignOverview,
  type JobCampaignTile,
  type JobSearchCampaign,
} from "../domain/job-campaign";
import type {
  FreshWatchCaps,
  FreshWatchLogger,
  FreshWatchRepository,
} from "./fresh-watch-ports";
import { defaultFreshWatchLogger } from "./fresh-watch-ports";
import { LINKEDIN_GUEST_PROVIDER as PROVIDER } from "../domain/canonical-search";

export { ACTIVE_JOB_CAMPAIGN_LIMIT };

export async function createJobCampaign(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    createId: () => string;
    now: () => Date;
    caps: FreshWatchCaps;
    log?: FreshWatchLogger;
  },
): Promise<JobSearchCampaign> {
  const command = createJobCampaignSchema.parse(raw);
  const log = deps.log ?? defaultFreshWatchLogger;
  const now = deps.now().toISOString();
  const active = await deps.repository.countActiveCampaigns(command.userId);
  if (active >= ACTIVE_JOB_CAMPAIGN_LIMIT) {
    throw new CareerCampaignError(
      "LIMIT_REACHED",
      `You can have at most ${ACTIVE_JOB_CAMPAIGN_LIMIT} active job campaigns. Pause or archive one to create another.`,
    );
  }

  const search = await ensureCanonicalSearch(
    {
      primaryRole: command.primaryRole,
      location: command.location,
      workMode: command.workMode,
    },
    now,
    deps,
  );

  const campaign: JobSearchCampaign = {
    id: deps.createId(),
    userId: command.userId,
    name: (command.name ?? generateCampaignName(command.primaryRole, command.location)).trim(),
    status: "active",
    primaryRole: command.primaryRole.trim(),
    location: command.location.trim(),
    workMode: command.workMode,
    employmentTypes: command.employmentTypes,
    experienceLevels: command.experienceLevels,
    minimumScore: command.minimumScore ?? deps.caps.minScore,
    preferredTechnologies: command.preferredTechnologies ?? [],
    targetReadyDate: command.targetReadyDate ?? null,
    weeklyHoursAvailable: command.weeklyHoursAvailable ?? null,
    criteriaVersion: 1,
    canonicalSearchId: search.id,
    lastLinkedInSearchAt: null,
    nextLinkedInSearchAt: now,
    lastBroadSearchAt: null,
    nextBroadSearchAt: addMs(now, deps.caps.broadIntervalMs),
    lastDiscoveryAt: null,
    lastError: null,
    initialAlertsRemaining: deps.caps.initialAlertCap,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  const saved = await deps.repository.insertCampaign(campaign);
  await deps.repository.replaceMembership({
    campaignId: saved.id,
    userId: saved.userId,
    canonicalSearchId: search.id,
    attachedAt: now,
  });
  log("campaign_created", { userId: command.userId, campaignId: saved.id });
  return saved;
}

export async function listJobCampaigns(
  userId: string,
  deps: { repository: FreshWatchRepository },
): Promise<JobSearchCampaign[]> {
  return deps.repository.listCampaignsByUserId(userId);
}

export async function getJobCampaignForUser(
  raw: unknown,
  deps: { repository: FreshWatchRepository },
): Promise<JobSearchCampaign> {
  const command = campaignIdCommandSchema.parse(raw);
  const campaign = await requireOwnedCampaign(command, deps.repository);
  return campaign;
}

export async function updateJobCampaign(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    createId: () => string;
    now: () => Date;
    caps: FreshWatchCaps;
    log?: FreshWatchLogger;
  },
): Promise<JobSearchCampaign> {
  const command = patchJobCampaignSchema.parse(raw);
  const campaign = await requireMutableCampaign(command, deps.repository);
  const now = deps.now().toISOString();
  const log = deps.log ?? defaultFreshWatchLogger;

  const primaryRole = command.primaryRole?.trim() ?? campaign.primaryRole;
  const location = command.location?.trim() ?? campaign.location;
  const workMode = command.workMode ?? campaign.workMode;
  const preferredTechnologies =
    command.preferredTechnologies ?? campaign.preferredTechnologies;
  const targetReadyDate =
    command.targetReadyDate === undefined
      ? campaign.targetReadyDate
      : command.targetReadyDate;
  const weeklyHoursAvailable =
    command.weeklyHoursAvailable === undefined
      ? campaign.weeklyHoursAvailable
      : command.weeklyHoursAvailable;
  const criteriaChanged =
    primaryRole !== campaign.primaryRole ||
    location !== campaign.location ||
    workMode !== campaign.workMode;

  let canonicalSearchId = campaign.canonicalSearchId;
  let criteriaVersion = campaign.criteriaVersion;
  if (criteriaChanged) {
    const search = await ensureCanonicalSearch(
      { primaryRole, location, workMode },
      now,
      deps,
    );
    canonicalSearchId = search.id;
    criteriaVersion = campaign.criteriaVersion + 1;
    if (campaign.status === "active") {
      await deps.repository.replaceMembership({
        campaignId: campaign.id,
        userId: campaign.userId,
        canonicalSearchId: search.id,
        attachedAt: now,
      });
    }
    log("campaign_criteria_changed", {
      campaignId: campaign.id,
      from: campaign.canonicalSearchId,
      to: search.id,
      criteriaVersion,
    });
  }

  const name =
    command.name?.trim() ??
    (criteriaChanged && campaign.name === generateCampaignName(campaign.primaryRole, campaign.location)
      ? generateCampaignName(primaryRole, location)
      : campaign.name);

  return deps.repository.updateCampaign(campaign.id, {
    name,
    primaryRole,
    location,
    workMode,
    employmentTypes: command.employmentTypes ?? campaign.employmentTypes,
    experienceLevels: command.experienceLevels ?? campaign.experienceLevels,
    minimumScore: command.minimumScore ?? campaign.minimumScore,
    preferredTechnologies,
    targetReadyDate,
    weeklyHoursAvailable,
    criteriaVersion,
    canonicalSearchId,
    nextLinkedInSearchAt: criteriaChanged ? now : campaign.nextLinkedInSearchAt,
    lastError: null,
    updatedAt: now,
  });
}

export async function pauseJobCampaign(
  raw: unknown,
  deps: { repository: FreshWatchRepository; now: () => Date; log?: FreshWatchLogger },
): Promise<JobSearchCampaign> {
  const command = campaignIdCommandSchema.parse(raw);
  const campaign = await requireMutableCampaign(command, deps.repository);
  const now = deps.now().toISOString();
  await deps.repository.detachMembership(campaign.id);
  const updated = await deps.repository.updateCampaign(campaign.id, {
    status: "paused",
    nextLinkedInSearchAt: null,
    updatedAt: now,
  });
  (deps.log ?? defaultFreshWatchLogger)("campaign_paused", {
    campaignId: campaign.id,
  });
  return updated;
}

export async function resumeJobCampaign(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    createId: () => string;
    now: () => Date;
    caps: FreshWatchCaps;
    log?: FreshWatchLogger;
  },
): Promise<JobSearchCampaign> {
  const command = campaignIdCommandSchema.parse(raw);
  const campaign = await requireOwnedCampaign(command, deps.repository);
  if (campaign.status === "archived") {
    throw new CareerCampaignError(
      "CONFLICT",
      "This campaign is archived and cannot be resumed.",
    );
  }
  if (campaign.status === "active") return campaign;
  const active = await deps.repository.countActiveCampaigns(command.userId);
  if (active >= ACTIVE_JOB_CAMPAIGN_LIMIT) {
    throw new CareerCampaignError(
      "LIMIT_REACHED",
      `You can have at most ${ACTIVE_JOB_CAMPAIGN_LIMIT} active job campaigns.`,
    );
  }
  const now = deps.now().toISOString();
  const search = await ensureCanonicalSearch(
    {
      primaryRole: campaign.primaryRole,
      location: campaign.location,
      workMode: campaign.workMode,
    },
    now,
    deps,
  );
  await deps.repository.replaceMembership({
    campaignId: campaign.id,
    userId: campaign.userId,
    canonicalSearchId: search.id,
    attachedAt: now,
  });
  const updated = await deps.repository.updateCampaign(campaign.id, {
    status: "active",
    canonicalSearchId: search.id,
    nextLinkedInSearchAt: now,
    nextBroadSearchAt: campaign.nextBroadSearchAt ?? addMs(now, deps.caps.broadIntervalMs),
    lastError: null,
    updatedAt: now,
  });
  (deps.log ?? defaultFreshWatchLogger)("campaign_resumed", {
    campaignId: campaign.id,
  });
  return updated;
}

export async function archiveJobCampaign(
  raw: unknown,
  deps: { repository: FreshWatchRepository; now: () => Date; log?: FreshWatchLogger },
): Promise<JobSearchCampaign> {
  const command = campaignIdCommandSchema.parse(raw);
  const campaign = await requireOwnedCampaign(command, deps.repository);
  if (campaign.status === "archived") {
    throw new CareerCampaignError(
      "CONFLICT",
      "This campaign is already archived.",
    );
  }
  const now = deps.now().toISOString();
  await deps.repository.detachMembership(campaign.id);
  const updated = await deps.repository.updateCampaign(campaign.id, {
    status: "archived",
    archivedAt: now,
    nextLinkedInSearchAt: null,
    nextBroadSearchAt: null,
    updatedAt: now,
  });
  (deps.log ?? defaultFreshWatchLogger)("campaign_archived", {
    campaignId: campaign.id,
  });
  return updated;
}

export async function getJobsWorkspaceOverview(
  userId: string,
  deps: { repository: FreshWatchRepository },
): Promise<JobCampaignOverview> {
  const campaigns = await deps.repository.listCampaignsByUserId(userId);
  const session = await deps.repository.getLatestInstantSearchSession(userId);
  const health = await deps.repository.getProviderHealth(PROVIDER);
  const providerWarning = providerWarningFor(
    health?.status ?? "ok",
    health?.cooldownUntil ?? null,
  );

  const tiles: JobCampaignTile[] = [];
  let newResults = 0;
  for (const campaign of campaigns) {
    const newlyDiscovered = await deps.repository.countNewCampaignListings(
      campaign.id,
    );
    const qualifyingMatches =
      await deps.repository.countQualifyingCampaignListings(campaign.id);
    newResults += newlyDiscovered;
    tiles.push({
      id: campaign.id,
      name: campaign.name,
      primaryRole: campaign.primaryRole,
      location: campaign.location,
      workMode: campaign.workMode,
      status: campaignNeedsAttention(campaign) ? "attention" : campaign.status === "paused" ? "paused" : "active",
      newlyDiscovered,
      qualifyingMatches,
      lastLinkedInSearchAt: campaign.lastLinkedInSearchAt,
      lastBroadSearchAt: campaign.lastBroadSearchAt,
      providerWarning: campaign.status === "active" ? providerWarning : null,
    });
  }

  return {
    instantSearch: {
      lastRanAt: session?.completedAt ?? session?.startedAt ?? null,
      jobsFound: session?.jobsFound ?? 0,
      analysedCount: session?.analysedCount ?? 0,
      hasResults: Boolean(session && session.listingIds.length > 0),
    },
    campaigns: {
      active: campaigns.filter((item) => item.status === "active").length,
      paused: campaigns.filter((item) => item.status === "paused").length,
      newResults,
    },
    tiles,
    recentOpportunities: [],
  };
}

export async function requireOwnedCampaign(
  command: { userId: string; campaignId: string },
  repository: FreshWatchRepository,
): Promise<JobSearchCampaign> {
  const campaign = await repository.getCampaignById(command.campaignId);
  if (!campaign || campaign.userId !== command.userId) {
    throw new CareerCampaignError(
      "NOT_FOUND",
      "That job campaign could not be found.",
    );
  }
  return campaign;
}

async function requireMutableCampaign(
  command: { userId: string; campaignId: string },
  repository: FreshWatchRepository,
): Promise<JobSearchCampaign> {
  const campaign = await requireOwnedCampaign(command, repository);
  if (campaign.status === "archived") {
    throw new CareerCampaignError(
      "CONFLICT",
      "This campaign is archived and cannot be changed.",
    );
  }
  return campaign;
}

export async function ensureCanonicalSearch(
  criteria: {
    primaryRole: string;
    location: string;
    workMode: JobSearchCampaign["workMode"];
  },
  now: string,
  deps: {
    repository: FreshWatchRepository;
    createId: () => string;
    caps: FreshWatchCaps;
  },
) {
  const key = canonicalLinkedInSearchKey({
    primaryRole: criteria.primaryRole,
    location: criteria.location,
    workMode: criteria.workMode,
  });
  let search = await deps.repository.getCanonicalSearchByKey(key);
  if (!search) {
    search = await deps.repository.upsertCanonicalSearch({
      id: deps.createId(),
      canonicalKey: key,
      provider: LINKEDIN_GUEST_PROVIDER,
      primaryRole: criteria.primaryRole.trim(),
      location: criteria.location.trim(),
      workMode: criteria.workMode,
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
  } else if (search.nextDueAt > now) {
    search = await deps.repository.updateCanonicalSearch(search.id, {
      nextDueAt: now,
    });
  }
  return search;
}

export function providerWarningFor(
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
