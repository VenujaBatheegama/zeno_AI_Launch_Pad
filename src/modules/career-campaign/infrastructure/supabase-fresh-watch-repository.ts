import type { SupabaseClient } from "@supabase/supabase-js";

import { CareerCampaignError } from "../domain/errors";
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
} from "../application/fresh-watch-ports";

type WatchRow = {
  id: string;
  user_id: string;
  status: FreshJobWatch["status"];
  primary_role: string;
  location: string;
  work_mode: FreshJobWatch["workMode"];
  min_score: number | null;
  canonical_search_id: string;
  last_broad_search_at: string | null;
  next_broad_search_at: string | null;
  last_discovery_at: string | null;
  last_error: string | null;
  initial_alerts_remaining: number;
  created_at: string;
  updated_at: string;
};

type SearchRow = {
  id: string;
  canonical_key: string;
  provider: string;
  primary_role: string;
  location: string;
  work_mode: FreshJobWatch["workMode"];
  employment_type: string | null;
  recency_strategy: string;
  next_due_at: string;
  last_attempted_at: string | null;
  last_succeeded_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  last_result_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export class SupabaseFreshWatchRepository implements FreshWatchRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getWatchByUserId(userId: string) {
    const { data, error } = await this.client
      .from("fresh_job_watches")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw persistenceError("Fresh Job Watch could not be loaded.", error);
    return data ? mapWatch(data as WatchRow) : null;
  }

  async upsertWatch(watch: FreshJobWatch) {
    const { data, error } = await this.client
      .from("fresh_job_watches")
      .upsert(toWatchRow(watch), { onConflict: "user_id" })
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Fresh Job Watch could not be saved.", error);
    }
    return mapWatch(data as WatchRow);
  }

  async listActiveWatches() {
    const { data, error } = await this.client
      .from("fresh_job_watches")
      .select("*")
      .eq("status", "active");
    if (error) throw persistenceError("Fresh Job Watch list failed.", error);
    return ((data ?? []) as WatchRow[]).map(mapWatch);
  }

  async claimDueBroadWatches(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }) {
    const { data, error } = await this.client.rpc("claim_due_broad_watches", {
      p_now: input.now,
      p_lease_owner: input.leaseOwner,
      p_lease_expires_at: input.leaseExpiresAt,
      p_limit: input.limit,
    });
    if (error) throw persistenceError("Due broad watches could not be claimed.", error);
    return ((data ?? []) as WatchRow[]).map(mapWatch);
  }

  async releaseBroadWatchLease(watchId: string) {
    const { error } = await this.client
      .from("fresh_job_watches")
      .update({ broad_lease_owner: null, broad_lease_expires_at: null })
      .eq("id", watchId);
    if (error) throw persistenceError("Broad watch lease could not be released.", error);
  }

  async updateWatch(watchId: string, patch: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("fresh_job_watches")
      .update(toWatchPatch(patch))
      .eq("id", watchId)
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Fresh Job Watch could not be updated.", error);
    }
    return mapWatch(data as WatchRow);
  }

  async getCanonicalSearchByKey(key: string) {
    const { data, error } = await this.client
      .from("canonical_job_searches")
      .select("*")
      .eq("canonical_key", key)
      .maybeSingle();
    if (error) throw persistenceError("Canonical search could not be loaded.", error);
    return data ? mapSearch(data as SearchRow) : null;
  }

  async getCanonicalSearchById(id: string) {
    const { data, error } = await this.client
      .from("canonical_job_searches")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistenceError("Canonical search could not be loaded.", error);
    return data ? mapSearch(data as SearchRow) : null;
  }

  async upsertCanonicalSearch(search: CanonicalJobSearch) {
    const { data, error } = await this.client
      .from("canonical_job_searches")
      .upsert(toSearchRow(search), { onConflict: "canonical_key" })
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Canonical search could not be saved.", error);
    }
    return mapSearch(data as SearchRow);
  }

  async claimDueCanonicalSearches(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }) {
    const { data, error } = await this.client.rpc("claim_due_canonical_searches", {
      p_now: input.now,
      p_lease_owner: input.leaseOwner,
      p_lease_expires_at: input.leaseExpiresAt,
      p_limit: input.limit,
    });
    if (error) {
      throw persistenceError("Due LinkedIn searches could not be claimed.", error);
    }
    return ((data ?? []) as SearchRow[]).map(mapSearch);
  }

  async releaseCanonicalSearchLease(searchId: string) {
    const { error } = await this.client
      .from("canonical_job_searches")
      .update({ lease_owner: null, lease_expires_at: null })
      .eq("id", searchId);
    if (error) throw persistenceError("Search lease could not be released.", error);
  }

  async updateCanonicalSearch(searchId: string, patch: Record<string, unknown>) {
    const { data, error } = await this.client
      .from("canonical_job_searches")
      .update(toSearchPatch(patch))
      .eq("id", searchId)
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Canonical search could not be updated.", error);
    }
    return mapSearch(data as SearchRow);
  }

  async replaceMembership(input: {
    watchId: string;
    userId: string;
    canonicalSearchId: string;
    attachedAt: string;
  }) {
    const { error: delError } = await this.client
      .from("canonical_search_members")
      .delete()
      .eq("watch_id", input.watchId);
    if (delError) throw persistenceError("Watch membership could not be moved.", delError);
    const { error } = await this.client.from("canonical_search_members").insert({
      canonical_search_id: input.canonicalSearchId,
      watch_id: input.watchId,
      user_id: input.userId,
      attached_at: input.attachedAt,
    });
    if (error) throw persistenceError("Watch membership could not be saved.", error);
  }

  async listMembers(canonicalSearchId: string): Promise<CanonicalSearchMember[]> {
    const { data, error } = await this.client
      .from("canonical_search_members")
      .select("*")
      .eq("canonical_search_id", canonicalSearchId);
    if (error) throw persistenceError("Search members could not be listed.", error);
    return ((data ?? []) as Array<{
      canonical_search_id: string;
      watch_id: string;
      user_id: string;
      attached_at: string;
    }>).map((row) => ({
      canonicalSearchId: row.canonical_search_id,
      watchId: row.watch_id,
      userId: row.user_id,
      attachedAt: row.attached_at,
    }));
  }

  async countActiveMembers(canonicalSearchId: string) {
    const members = await this.listMembers(canonicalSearchId);
    if (members.length === 0) return 0;
    const { data, error } = await this.client
      .from("fresh_job_watches")
      .select("id")
      .eq("status", "active")
      .in(
        "id",
        members.map((member) => member.watchId),
      );
    if (error) throw persistenceError("Active members could not be counted.", error);
    return (data ?? []).length;
  }

  async observeProviderJob(input: ObserveProviderJobInput) {
    const { data, error } = await this.client.rpc("observe_provider_job", {
      p_source_key: input.provider,
      p_source_name: input.provider,
      p_external_job_id: input.providerJobId,
      p_organization_name: input.company,
      p_organization_logo_url: null,
      p_organization_website_url: null,
      p_title: input.title,
      p_location: input.location,
      p_city: null,
      p_region: null,
      p_country: null,
      p_work_mode: null,
      p_publisher: input.provider,
      p_source_url: input.publicUrl,
      p_application_url: input.publicUrl,
      p_published_at: input.publishedAt,
      p_raw_payload: {},
      p_fingerprint: input.fingerprint,
      p_seen_at: input.seenAt,
    });
    if (error) {
      throw persistenceError(
        `Provider job could not be observed. ${error.message}`,
        error,
      );
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw persistenceError("Provider job observation returned nothing.", error);
    const mapped: ProviderJobSighting = {
      id: `${input.provider}:${input.providerJobId}`,
      provider: input.provider,
      providerJobId: input.providerJobId,
      listingId: row.listing_id,
      jobId: row.job_id,
      title: input.title,
      company: input.company,
      location: input.location,
      publicUrl: input.publicUrl,
      publishedAt: row.published_at ?? input.publishedAt,
      firstSeenAt: row.first_seen_at ?? input.seenAt,
      lastSeenAt: input.seenAt,
      fingerprint: input.fingerprint,
      isNew: Boolean(row.is_new),
    };
    return mapped;
  }

  async findSightingByFingerprint(fingerprint: string) {
    const { data, error } = await this.client
      .from("provider_job_sightings")
      .select("*")
      .eq("fingerprint", fingerprint)
      .limit(1)
      .maybeSingle();
    if (error) throw persistenceError("Job fingerprint lookup failed.", error);
    if (!data) return null;
    const row = data as {
      id: string;
      provider: string;
      provider_job_id: string;
      listing_id: string | null;
      job_id: string | null;
      title: string;
      company: string | null;
      location: string | null;
      public_url: string | null;
      published_at: string | null;
      first_seen_at: string;
      last_seen_at: string;
      fingerprint: string;
    };
    return {
      id: row.id,
      provider: row.provider,
      providerJobId: row.provider_job_id,
      listingId: row.listing_id,
      jobId: row.job_id,
      title: row.title,
      company: row.company,
      location: row.location,
      publicUrl: row.public_url,
      publishedAt: row.published_at,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      fingerprint: row.fingerprint,
      isNew: false,
    };
  }

  async attachUserJob(input: {
    userId: string;
    listingId: string;
    seenAt: string;
  }) {
    const { error } = await this.client.rpc("attach_user_job", {
      p_user_id: input.userId,
      p_listing_id: input.listingId,
      p_seen_at: input.seenAt,
    });
    if (error) throw persistenceError("Job could not be attached to the user.", error);
  }

  async setJobDescriptionIfEmpty(input: {
    listingId: string;
    description: string;
  }) {
    const { error } = await this.client.rpc("set_job_description_if_empty", {
      p_listing_id: input.listingId,
      p_description: input.description,
    });
    if (error) throw persistenceError("Job description could not be saved.", error);
  }

  async getListingDescription(listingId: string) {
    const { data, error } = await this.client
      .from("job_listings")
      .select("jobs(description)")
      .eq("id", listingId)
      .maybeSingle();
    if (error) throw persistenceError("Job description could not be loaded.", error);
    const jobs = (data as { jobs?: { description?: string | null } | null } | null)?.jobs;
    return jobs?.description ?? null;
  }

  async getProviderHealth(provider: string) {
    const { data, error } = await this.client
      .from("provider_health")
      .select("*")
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw persistenceError("Provider health could not be loaded.", error);
    if (!data) return null;
    const row = data as {
      provider: string;
      status: ProviderHealth["status"];
      cooldown_until: string | null;
      last_status_code: number | null;
      last_error: string | null;
      consecutive_failures: number;
      updated_at: string;
    };
    return {
      provider: row.provider,
      status: row.status,
      cooldownUntil: row.cooldown_until,
      lastStatusCode: row.last_status_code,
      lastError: row.last_error,
      consecutiveFailures: row.consecutive_failures,
      updatedAt: row.updated_at,
    };
  }

  async upsertProviderHealth(health: ProviderHealth) {
    const { data, error } = await this.client
      .from("provider_health")
      .upsert({
        provider: health.provider,
        status: health.status,
        cooldown_until: health.cooldownUntil,
        last_status_code: health.lastStatusCode,
        last_error: health.lastError,
        consecutive_failures: health.consecutiveFailures,
        updated_at: health.updatedAt,
      })
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Provider health could not be saved.", error);
    }
    return health;
  }
}

function mapWatch(row: WatchRow): FreshJobWatch {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    primaryRole: row.primary_role,
    location: row.location,
    workMode: row.work_mode,
    minScore: row.min_score,
    canonicalSearchId: row.canonical_search_id,
    lastBroadSearchAt: row.last_broad_search_at,
    nextBroadSearchAt: row.next_broad_search_at,
    lastDiscoveryAt: row.last_discovery_at,
    lastError: row.last_error,
    initialAlertsRemaining: row.initial_alerts_remaining,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWatchRow(watch: FreshJobWatch) {
  return {
    id: watch.id,
    user_id: watch.userId,
    status: watch.status,
    primary_role: watch.primaryRole,
    location: watch.location,
    work_mode: watch.workMode,
    min_score: watch.minScore,
    canonical_search_id: watch.canonicalSearchId,
    last_broad_search_at: watch.lastBroadSearchAt,
    next_broad_search_at: watch.nextBroadSearchAt,
    last_discovery_at: watch.lastDiscoveryAt,
    last_error: watch.lastError,
    initial_alerts_remaining: watch.initialAlertsRemaining,
    created_at: watch.createdAt,
    updated_at: watch.updatedAt,
  };
}

function toWatchPatch(patch: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};
  if ("status" in patch) mapped.status = patch.status;
  if ("primaryRole" in patch) mapped.primary_role = patch.primaryRole;
  if ("location" in patch) mapped.location = patch.location;
  if ("workMode" in patch) mapped.work_mode = patch.workMode;
  if ("minScore" in patch) mapped.min_score = patch.minScore;
  if ("canonicalSearchId" in patch) mapped.canonical_search_id = patch.canonicalSearchId;
  if ("lastBroadSearchAt" in patch) mapped.last_broad_search_at = patch.lastBroadSearchAt;
  if ("nextBroadSearchAt" in patch) mapped.next_broad_search_at = patch.nextBroadSearchAt;
  if ("lastDiscoveryAt" in patch) mapped.last_discovery_at = patch.lastDiscoveryAt;
  if ("lastError" in patch) mapped.last_error = patch.lastError;
  if ("initialAlertsRemaining" in patch) {
    mapped.initial_alerts_remaining = patch.initialAlertsRemaining;
  }
  return mapped;
}

function mapSearch(row: SearchRow): CanonicalJobSearch {
  return {
    id: row.id,
    canonicalKey: row.canonical_key,
    provider: row.provider,
    primaryRole: row.primary_role,
    location: row.location,
    workMode: row.work_mode,
    employmentType: row.employment_type,
    recencyStrategy: row.recency_strategy,
    nextDueAt: row.next_due_at,
    lastAttemptedAt: row.last_attempted_at,
    lastSucceededAt: row.last_succeeded_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    lastResultSummary: row.last_result_summary ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSearchRow(search: CanonicalJobSearch) {
  return {
    id: search.id,
    canonical_key: search.canonicalKey,
    provider: search.provider,
    primary_role: search.primaryRole,
    location: search.location,
    work_mode: search.workMode,
    employment_type: search.employmentType,
    recency_strategy: search.recencyStrategy,
    next_due_at: search.nextDueAt,
    last_attempted_at: search.lastAttemptedAt,
    last_succeeded_at: search.lastSucceededAt,
    lease_owner: search.leaseOwner,
    lease_expires_at: search.leaseExpiresAt,
    last_error: search.lastError,
    last_result_summary: search.lastResultSummary,
    created_at: search.createdAt,
    updated_at: search.updatedAt,
  };
}

function toSearchPatch(patch: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};
  if ("nextDueAt" in patch) mapped.next_due_at = patch.nextDueAt;
  if ("lastAttemptedAt" in patch) mapped.last_attempted_at = patch.lastAttemptedAt;
  if ("lastSucceededAt" in patch) mapped.last_succeeded_at = patch.lastSucceededAt;
  if ("leaseOwner" in patch) mapped.lease_owner = patch.leaseOwner;
  if ("leaseExpiresAt" in patch) mapped.lease_expires_at = patch.leaseExpiresAt;
  if ("lastError" in patch) mapped.last_error = patch.lastError;
  if ("lastResultSummary" in patch) mapped.last_result_summary = patch.lastResultSummary;
  return mapped;
}

function persistenceError(message: string, cause: unknown) {
  return new CareerCampaignError("PERSISTENCE_FAILED", message, { cause });
}
