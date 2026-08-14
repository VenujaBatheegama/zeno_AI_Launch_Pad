import type {
  CanonicalJobSearch,
  CanonicalSearchMember,
  ProviderHealth,
  ProviderJobSighting,
} from "../domain/fresh-watch";
import type {
  CampaignListingSighting,
  InstantSearchSession,
  JobSearchCampaign,
  JobSearchCampaignRun,
} from "../domain/job-campaign";
import type {
  CampaignPatch,
  FreshWatchRepository,
  ObserveProviderJobInput,
} from "./fresh-watch-ports";

export class InMemoryFreshWatchRepository implements FreshWatchRepository {
  campaigns = new Map<string, JobSearchCampaign>();
  searches = new Map<string, CanonicalJobSearch>();
  searchesByKey = new Map<string, string>();
  members: CanonicalSearchMember[] = [];
  sightings = new Map<string, ProviderJobSighting>();
  sightingsByFingerprint = new Map<string, string>();
  descriptions = new Map<string, string>();
  userJobs = new Set<string>();
  health = new Map<string, ProviderHealth>();
  listingSeq = 0;
  broadLeases = new Map<string, { owner: string; expiresAt: string }>();
  campaignListings = new Map<string, CampaignListingSighting>();
  sessions = new Map<string, InstantSearchSession>();
  runs = new Map<string, JobSearchCampaignRun>();
  savedListingIds = new Set<string>();

  async listCampaignsByUserId(userId: string) {
    return [...this.campaigns.values()]
      .filter(
        (campaign) =>
          campaign.userId === userId && campaign.status !== "archived",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getCampaignById(campaignId: string) {
    return this.campaigns.get(campaignId) ?? null;
  }

  async countActiveCampaigns(userId: string) {
    return [...this.campaigns.values()].filter(
      (campaign) => campaign.userId === userId && campaign.status === "active",
    ).length;
  }

  async insertCampaign(campaign: JobSearchCampaign) {
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async updateCampaign(campaignId: string, patch: CampaignPatch) {
    const current = this.campaigns.get(campaignId);
    if (!current) throw new Error("campaign not found");
    const next = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? current.updatedAt,
    };
    this.campaigns.set(campaignId, next);
    return next;
  }

  async getWatchByUserId(userId: string) {
    const campaigns = await this.listCampaignsByUserId(userId);
    return campaigns[0] ?? null;
  }

  async claimDueBroadCampaigns(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }) {
    const claimed: JobSearchCampaign[] = [];
    for (const campaign of this.campaigns.values()) {
      if (claimed.length >= input.limit) break;
      if (campaign.status !== "active" || campaign.archivedAt) continue;
      if (!campaign.nextBroadSearchAt || campaign.nextBroadSearchAt > input.now) {
        continue;
      }
      const lease = this.broadLeases.get(campaign.id);
      if (lease && lease.expiresAt > input.now) continue;
      this.broadLeases.set(campaign.id, {
        owner: input.leaseOwner,
        expiresAt: input.leaseExpiresAt,
      });
      claimed.push(campaign);
    }
    return claimed;
  }

  async releaseBroadCampaignLease(campaignId: string) {
    this.broadLeases.delete(campaignId);
  }

  async tryClaimCampaignRunLease(input: {
    campaignId: string;
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
  }) {
    const lease = this.broadLeases.get(input.campaignId);
    if (lease && lease.expiresAt > input.now) return false;
    this.broadLeases.set(input.campaignId, {
      owner: input.leaseOwner,
      expiresAt: input.leaseExpiresAt,
    });
    return true;
  }

  async getCanonicalSearchByKey(key: string) {
    const id = this.searchesByKey.get(key);
    return id ? (this.searches.get(id) ?? null) : null;
  }

  async getCanonicalSearchById(id: string) {
    return this.searches.get(id) ?? null;
  }

  async upsertCanonicalSearch(search: CanonicalJobSearch) {
    this.searches.set(search.id, search);
    this.searchesByKey.set(search.canonicalKey, search.id);
    return search;
  }

  async claimDueCanonicalSearches(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }) {
    const claimed: CanonicalJobSearch[] = [];
    for (const search of this.searches.values()) {
      if (claimed.length >= input.limit) break;
      if (search.nextDueAt > input.now) continue;
      if (search.leaseExpiresAt && search.leaseExpiresAt > input.now) continue;
      const activeMembers = this.members.filter((member) => {
        if (member.canonicalSearchId !== search.id) return false;
        const campaign = this.campaigns.get(member.campaignId);
        return campaign?.status === "active" && !campaign.archivedAt;
      });
      if (activeMembers.length === 0) continue;
      const next = {
        ...search,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
        lastAttemptedAt: input.now,
      };
      this.searches.set(search.id, next);
      claimed.push(next);
    }
    return claimed;
  }

  async releaseCanonicalSearchLease(searchId: string) {
    const search = this.searches.get(searchId);
    if (!search) return;
    this.searches.set(searchId, {
      ...search,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  }

  async updateCanonicalSearch(
    searchId: string,
    patch: Partial<CanonicalJobSearch>,
  ) {
    const current = this.searches.get(searchId);
    if (!current) throw new Error("canonical search not found");
    const next = { ...current, ...patch };
    this.searches.set(searchId, next);
    return next;
  }

  async replaceMembership(input: {
    campaignId: string;
    userId: string;
    canonicalSearchId: string;
    attachedAt: string;
  }) {
    this.members = this.members.filter(
      (member) => member.campaignId !== input.campaignId,
    );
    this.members.push({
      canonicalSearchId: input.canonicalSearchId,
      campaignId: input.campaignId,
      userId: input.userId,
      attachedAt: input.attachedAt,
    });
  }

  async detachMembership(campaignId: string) {
    this.members = this.members.filter(
      (member) => member.campaignId !== campaignId,
    );
  }

  async listMembers(canonicalSearchId: string) {
    return this.members.filter(
      (member) => member.canonicalSearchId === canonicalSearchId,
    );
  }

  async countActiveMembers(canonicalSearchId: string) {
    const members = await this.listMembers(canonicalSearchId);
    return members.filter((member) => {
      const campaign = this.campaigns.get(member.campaignId);
      return campaign?.status === "active" && !campaign.archivedAt;
    }).length;
  }

  async observeProviderJob(input: ObserveProviderJobInput) {
    const key = `${input.provider}:${input.providerJobId}`;
    const existing = this.sightings.get(key);
    if (existing) {
      const next = { ...existing, lastSeenAt: input.seenAt, isNew: false };
      this.sightings.set(key, next);
      return next;
    }
    this.listingSeq += 1;
    const listingId =
      input.listingId ??
      `44444444-4444-4444-8444-${String(this.listingSeq).padStart(12, "0")}`;
    const created: ProviderJobSighting = {
      id: `sight-${input.providerJobId}`,
      provider: input.provider,
      providerJobId: input.providerJobId,
      listingId,
      jobId: input.jobId ?? listingId,
      title: input.title,
      company: input.company,
      location: input.location,
      publicUrl: input.publicUrl,
      publishedAt: input.publishedAt,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
      fingerprint: input.fingerprint,
      isNew: true,
    };
    this.sightings.set(key, created);
    this.sightingsByFingerprint.set(input.fingerprint, key);
    return created;
  }

  async findSightingByFingerprint(fingerprint: string) {
    const key = this.sightingsByFingerprint.get(fingerprint);
    return key ? (this.sightings.get(key) ?? null) : null;
  }

  async attachUserJob(input: {
    userId: string;
    listingId: string;
    seenAt: string;
  }) {
    this.userJobs.add(`${input.userId}:${input.listingId}`);
    void input.seenAt;
  }

  async setJobDescriptionIfEmpty(input: {
    listingId: string;
    description: string;
  }) {
    if (!this.descriptions.has(input.listingId)) {
      this.descriptions.set(input.listingId, input.description);
    }
  }

  async getListingDescription(listingId: string) {
    return this.descriptions.get(listingId) ?? null;
  }

  async attachCampaignListing(input: {
    campaignId: string;
    listingId: string;
    discoverySource: CampaignListingSighting["discoverySource"];
    seenAt: string;
    originatingRunId: string | null;
  }) {
    const key = `${input.campaignId}:${input.listingId}`;
    const existing = this.campaignListings.get(key);
    if (existing) {
      const next = { ...existing, lastSeenAt: input.seenAt, isNewForCampaign: false };
      this.campaignListings.set(key, next);
      return next;
    }
    const created: CampaignListingSighting = {
      campaignId: input.campaignId,
      listingId: input.listingId,
      discoverySource: input.discoverySource,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
      originatingRunId: input.originatingRunId,
      qualification: "pending",
      isNewForCampaign: true,
    };
    this.campaignListings.set(key, created);
    return created;
  }

  async listCampaignListings(campaignId: string) {
    return [...this.campaignListings.values()].filter(
      (row) => row.campaignId === campaignId,
    );
  }

  async listCampaignListingIdsForUser(userId: string) {
    const ids = new Set<string>();
    for (const row of this.campaignListings.values()) {
      const campaign = this.campaigns.get(row.campaignId);
      if (campaign?.userId === userId) ids.add(row.listingId);
    }
    return [...ids];
  }

  async countNewCampaignListings(campaignId: string) {
    return [...this.campaignListings.values()].filter(
      (row) => row.campaignId === campaignId && row.isNewForCampaign,
    ).length;
  }

  async countQualifyingCampaignListings(campaignId: string) {
    return [...this.campaignListings.values()].filter(
      (row) =>
        row.campaignId === campaignId && row.qualification === "qualifying",
    ).length;
  }

  async updateCampaignListingQualification(input: {
    campaignId: string;
    listingId: string;
    qualification: CampaignListingSighting["qualification"];
  }) {
    const key = `${input.campaignId}:${input.listingId}`;
    const existing = this.campaignListings.get(key);
    if (!existing) return;
    this.campaignListings.set(key, {
      ...existing,
      qualification: input.qualification,
    });
  }

  async createInstantSearchSession(session: InstantSearchSession) {
    this.sessions.set(session.id, session);
    return session;
  }

  async archiveInstantSearchSessions(userId: string) {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.status === "active") {
        this.sessions.set(session.id, { ...session, status: "archived" });
      }
    }
  }

  async getLatestInstantSearchSession(userId: string) {
    return (
      [...this.sessions.values()]
        .filter((session) => session.userId === userId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
    );
  }

  async updateInstantSearchSession(
    sessionId: string,
    patch: Partial<InstantSearchSession>,
  ) {
    const current = this.sessions.get(sessionId);
    if (!current) throw new Error("session not found");
    const next = { ...current, ...patch };
    this.sessions.set(sessionId, next);
    return next;
  }

  async insertCampaignRun(run: JobSearchCampaignRun) {
    this.runs.set(run.id, run);
    return run;
  }

  async updateCampaignRun(
    runId: string,
    patch: Partial<JobSearchCampaignRun>,
  ) {
    const current = this.runs.get(runId);
    if (!current) throw new Error("run not found");
    const next = { ...current, ...patch };
    this.runs.set(runId, next);
    return next;
  }

  async listCampaignRuns(campaignId: string, limit = 10) {
    return [...this.runs.values()]
      .filter((run) => run.campaignId === campaignId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  async getProviderHealth(provider: string) {
    return this.health.get(provider) ?? null;
  }

  async upsertProviderHealth(health: ProviderHealth) {
    this.health.set(health.provider, health);
    return health;
  }
}
