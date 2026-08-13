import type {
  CanonicalJobSearch,
  CanonicalSearchMember,
  FreshJobWatch,
  ProviderHealth,
  ProviderJobSighting,
} from "../domain/fresh-watch";
import type {
  FreshWatchRepository,
  ObserveProviderJobInput,
} from "./fresh-watch-ports";

export class InMemoryFreshWatchRepository implements FreshWatchRepository {
  watches = new Map<string, FreshJobWatch>();
  watchesByUser = new Map<string, string>();
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

  async getWatchByUserId(userId: string) {
    const id = this.watchesByUser.get(userId);
    return id ? (this.watches.get(id) ?? null) : null;
  }

  async upsertWatch(watch: FreshJobWatch) {
    this.watches.set(watch.id, watch);
    this.watchesByUser.set(watch.userId, watch.id);
    return watch;
  }

  async listActiveWatches() {
    return [...this.watches.values()].filter((watch) => watch.status === "active");
  }

  async claimDueBroadWatches(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }) {
    const claimed: FreshJobWatch[] = [];
    for (const watch of this.watches.values()) {
      if (claimed.length >= input.limit) break;
      if (watch.status !== "active") continue;
      if (!watch.nextBroadSearchAt || watch.nextBroadSearchAt > input.now) continue;
      const lease = this.broadLeases.get(watch.id);
      if (lease && lease.expiresAt > input.now) continue;
      this.broadLeases.set(watch.id, {
        owner: input.leaseOwner,
        expiresAt: input.leaseExpiresAt,
      });
      claimed.push(watch);
    }
    return claimed;
  }

  async releaseBroadWatchLease(watchId: string) {
    this.broadLeases.delete(watchId);
  }

  async updateWatch(
    watchId: string,
    patch: Partial<FreshJobWatch>,
  ) {
    const current = this.watches.get(watchId);
    if (!current) throw new Error("watch not found");
    const next = { ...current, ...patch, updatedAt: patch.updatedAt ?? current.updatedAt };
    this.watches.set(watchId, next);
    return next;
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
        const watch = this.watches.get(member.watchId);
        return watch?.status === "active";
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
    watchId: string;
    userId: string;
    canonicalSearchId: string;
    attachedAt: string;
  }) {
    this.members = this.members.filter((member) => member.watchId !== input.watchId);
    this.members.push({
      canonicalSearchId: input.canonicalSearchId,
      watchId: input.watchId,
      userId: input.userId,
      attachedAt: input.attachedAt,
    });
  }

  async listMembers(canonicalSearchId: string) {
    return this.members.filter(
      (member) => member.canonicalSearchId === canonicalSearchId,
    );
  }

  async countActiveMembers(canonicalSearchId: string) {
    const members = await this.listMembers(canonicalSearchId);
    return members.filter((member) => {
      const watch = this.watches.get(member.watchId);
      return watch?.status === "active";
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

  async getProviderHealth(provider: string) {
    return this.health.get(provider) ?? null;
  }

  async upsertProviderHealth(health: ProviderHealth) {
    this.health.set(health.provider, health);
    return health;
  }
}
