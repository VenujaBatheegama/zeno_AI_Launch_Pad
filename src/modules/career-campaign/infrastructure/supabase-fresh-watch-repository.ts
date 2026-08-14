import type { SupabaseClient } from "@supabase/supabase-js";

import { CareerCampaignError } from "../domain/errors";
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
} from "../application/fresh-watch-ports";

type CampaignRow = {
  id: string;
  user_id: string;
  name: string;
  status: JobSearchCampaign["status"];
  primary_role: string;
  location: string;
  work_mode: JobSearchCampaign["workMode"];
  employment_types: string[] | null;
  experience_levels: string[] | null;
  minimum_score: number;
  preferred_technologies: string[] | null;
  target_ready_date: string | null;
  weekly_hours_available: number | null;
  criteria_version: number;
  canonical_search_id: string;
  last_linkedin_search_at: string | null;
  next_linkedin_search_at: string | null;
  last_broad_search_at: string | null;
  next_broad_search_at: string | null;
  last_discovery_at: string | null;
  last_error: string | null;
  initial_alerts_remaining: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type SearchRow = {
  id: string;
  canonical_key: string;
  provider: string;
  primary_role: string;
  location: string;
  work_mode: JobSearchCampaign["workMode"];
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

  async listCampaignsByUserId(userId: string) {
    const { data, error } = await this.client
      .from("job_search_campaigns")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) throw persistenceError("Job campaigns could not be loaded.", error);
    return ((data ?? []) as CampaignRow[]).map(mapCampaign);
  }

  async getCampaignById(campaignId: string) {
    const { data, error } = await this.client
      .from("job_search_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();
    if (error) throw persistenceError("Job campaign could not be loaded.", error);
    return data ? mapCampaign(data as CampaignRow) : null;
  }

  async countActiveCampaigns(userId: string) {
    const { count, error } = await this.client
      .from("job_search_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw persistenceError("Active campaigns could not be counted.", error);
    return count ?? 0;
  }

  async insertCampaign(campaign: JobSearchCampaign) {
    const { data, error } = await this.client
      .from("job_search_campaigns")
      .insert(toCampaignRow(campaign))
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Job campaign could not be saved.", error);
    }
    await this.client.from("job_search_campaign_criteria").insert({
      campaign_id: campaign.id,
      version: campaign.criteriaVersion,
      primary_role: campaign.primaryRole,
      location: campaign.location,
      work_mode: campaign.workMode,
      employment_types: campaign.employmentTypes,
      experience_levels: campaign.experienceLevels,
      minimum_score: campaign.minimumScore,
      preferred_technologies: campaign.preferredTechnologies,
      target_ready_date: campaign.targetReadyDate,
      weekly_hours_available: campaign.weeklyHoursAvailable,
      created_at: campaign.createdAt,
    });
    return mapCampaign(data as CampaignRow);
  }

  async updateCampaign(campaignId: string, patch: CampaignPatch) {
    const { data, error } = await this.client
      .from("job_search_campaigns")
      .update(toCampaignPatch(patch))
      .eq("id", campaignId)
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Job campaign could not be updated.", error);
    }
    const mapped = mapCampaign(data as CampaignRow);
    if (patch.criteriaVersion && patch.primaryRole && patch.location) {
      await this.client.from("job_search_campaign_criteria").upsert({
        campaign_id: campaignId,
        version: mapped.criteriaVersion,
        primary_role: mapped.primaryRole,
        location: mapped.location,
        work_mode: mapped.workMode,
        employment_types: mapped.employmentTypes,
        experience_levels: mapped.experienceLevels,
        minimum_score: mapped.minimumScore,
        preferred_technologies: mapped.preferredTechnologies,
        target_ready_date: mapped.targetReadyDate,
        weekly_hours_available: mapped.weeklyHoursAvailable,
        created_at: mapped.updatedAt,
      });
    }
    return mapped;
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
    const { data, error } = await this.client.rpc("claim_due_broad_campaigns", {
      p_now: input.now,
      p_lease_owner: input.leaseOwner,
      p_lease_expires_at: input.leaseExpiresAt,
      p_limit: input.limit,
    });
    if (error) throw persistenceError("Due campaigns could not be claimed.", error);
    return ((data ?? []) as CampaignRow[]).map(mapCampaign);
  }

  async releaseBroadCampaignLease(campaignId: string) {
    const { error } = await this.client
      .from("job_search_campaigns")
      .update({ broad_lease_owner: null, broad_lease_expires_at: null })
      .eq("id", campaignId);
    if (error) throw persistenceError("Campaign lease could not be released.", error);
  }

  async tryClaimCampaignRunLease(input: {
    campaignId: string;
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
  }) {
    const { data, error } = await this.client.rpc("try_claim_campaign_run_lease", {
      p_campaign_id: input.campaignId,
      p_now: input.now,
      p_lease_owner: input.leaseOwner,
      p_lease_expires_at: input.leaseExpiresAt,
    });
    if (error) throw persistenceError("Campaign run lease could not be claimed.", error);
    return Boolean(data);
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
    campaignId: string;
    userId: string;
    canonicalSearchId: string;
    attachedAt: string;
  }) {
    const { error: delError } = await this.client
      .from("canonical_search_members")
      .delete()
      .eq("campaign_id", input.campaignId);
    if (delError) throw persistenceError("Campaign membership could not be moved.", delError);
    const { error } = await this.client.from("canonical_search_members").insert({
      canonical_search_id: input.canonicalSearchId,
      campaign_id: input.campaignId,
      user_id: input.userId,
      attached_at: input.attachedAt,
    });
    if (error) throw persistenceError("Campaign membership could not be saved.", error);
  }

  async detachMembership(campaignId: string) {
    const { error } = await this.client
      .from("canonical_search_members")
      .delete()
      .eq("campaign_id", campaignId);
    if (error) throw persistenceError("Campaign membership could not be removed.", error);
  }

  async listMembers(canonicalSearchId: string): Promise<CanonicalSearchMember[]> {
    const { data, error } = await this.client
      .from("canonical_search_members")
      .select("*")
      .eq("canonical_search_id", canonicalSearchId);
    if (error) throw persistenceError("Search members could not be listed.", error);
    return ((data ?? []) as Array<{
      canonical_search_id: string;
      campaign_id: string;
      user_id: string;
      attached_at: string;
    }>).map((row) => ({
      canonicalSearchId: row.canonical_search_id,
      campaignId: row.campaign_id,
      userId: row.user_id,
      attachedAt: row.attached_at,
    }));
  }

  async countActiveMembers(canonicalSearchId: string) {
    const members = await this.listMembers(canonicalSearchId);
    if (members.length === 0) return 0;
    const { data, error } = await this.client
      .from("job_search_campaigns")
      .select("id")
      .eq("status", "active")
      .is("archived_at", null)
      .in(
        "id",
        members.map((member) => member.campaignId),
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

  async attachCampaignListing(input: {
    campaignId: string;
    listingId: string;
    discoverySource: CampaignListingSighting["discoverySource"];
    seenAt: string;
    originatingRunId: string | null;
  }) {
    const { data: existing, error: readError } = await this.client
      .from("campaign_listing_sightings")
      .select("*")
      .eq("campaign_id", input.campaignId)
      .eq("listing_id", input.listingId)
      .maybeSingle();
    if (readError) {
      throw persistenceError("Campaign listing could not be loaded.", readError);
    }
    if (existing) {
      const { data, error } = await this.client
        .from("campaign_listing_sightings")
        .update({ last_seen_at: input.seenAt })
        .eq("campaign_id", input.campaignId)
        .eq("listing_id", input.listingId)
        .select()
        .single();
      if (error || !data) {
        throw persistenceError("Campaign listing could not be updated.", error);
      }
      return mapCampaignListing(data as CampaignListingRow, false);
    }
    const { data, error } = await this.client
      .from("campaign_listing_sightings")
      .insert({
        campaign_id: input.campaignId,
        listing_id: input.listingId,
        discovery_source: input.discoverySource,
        first_seen_at: input.seenAt,
        last_seen_at: input.seenAt,
        originating_run_id: input.originatingRunId,
        qualification: "pending",
      })
      .select()
      .single();
    if (error || !data) {
      throw persistenceError("Campaign listing could not be saved.", error);
    }
    return mapCampaignListing(data as CampaignListingRow, true);
  }

  async listCampaignListings(campaignId: string) {
    const { data, error } = await this.client
      .from("campaign_listing_sightings")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("last_seen_at", { ascending: false });
    if (error) throw persistenceError("Campaign listings could not be loaded.", error);
    return ((data ?? []) as CampaignListingRow[]).map((row) =>
      mapCampaignListing(row, false),
    );
  }

  async listCampaignListingIdsForUser(userId: string) {
    const { data, error } = await this.client
      .from("campaign_listing_sightings")
      .select("listing_id, job_search_campaigns!inner(user_id)")
      .eq("job_search_campaigns.user_id", userId);
    if (error) throw persistenceError("Campaign listings could not be listed.", error);
    return [
      ...new Set(
        ((data ?? []) as Array<{ listing_id: string }>).map((row) => row.listing_id),
      ),
    ];
  }

  async countNewCampaignListings(campaignId: string) {
    const { count, error } = await this.client
      .from("campaign_listing_sightings")
      .select("listing_id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("qualification", "pending");
    if (error) throw persistenceError("New campaign listings could not be counted.", error);
    return count ?? 0;
  }

  async countQualifyingCampaignListings(campaignId: string) {
    const { count, error } = await this.client
      .from("campaign_listing_sightings")
      .select("listing_id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("qualification", "qualifying");
    if (error) {
      throw persistenceError("Qualifying listings could not be counted.", error);
    }
    return count ?? 0;
  }

  async updateCampaignListingQualification(input: {
    campaignId: string;
    listingId: string;
    qualification: CampaignListingSighting["qualification"];
  }) {
    const { error } = await this.client
      .from("campaign_listing_sightings")
      .update({ qualification: input.qualification })
      .eq("campaign_id", input.campaignId)
      .eq("listing_id", input.listingId);
    if (error) {
      throw persistenceError("Campaign listing qualification could not be saved.", error);
    }
  }

  async createInstantSearchSession(session: InstantSearchSession) {
    const { error } = await this.client.from("job_search_sessions").insert({
      id: session.id,
      user_id: session.userId,
      status: session.status,
      jobs_found: session.jobsFound,
      analysed_count: session.analysedCount,
      started_at: session.startedAt,
      completed_at: session.completedAt,
    });
    if (error) throw persistenceError("Instant Search session could not be saved.", error);
    if (session.listingIds.length > 0) {
      const { error: listError } = await this.client
        .from("job_search_session_listings")
        .insert(
          session.listingIds.map((listingId) => ({
            session_id: session.id,
            listing_id: listingId,
          })),
        );
      if (listError) {
        throw persistenceError("Instant Search results could not be saved.", listError);
      }
    }
    return session;
  }

  async archiveInstantSearchSessions(userId: string) {
    const { error } = await this.client
      .from("job_search_sessions")
      .update({ status: "archived" })
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw persistenceError("Instant Search sessions could not be archived.", error);
  }

  async getLatestInstantSearchSession(userId: string) {
    const { data, error } = await this.client
      .from("job_search_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw persistenceError("Instant Search session could not be loaded.", error);
    if (!data) return null;
    const row = data as SessionRow;
    const { data: listings, error: listError } = await this.client
      .from("job_search_session_listings")
      .select("listing_id")
      .eq("session_id", row.id);
    if (listError) {
      throw persistenceError("Instant Search listings could not be loaded.", listError);
    }
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      jobsFound: row.jobs_found,
      analysedCount: row.analysed_count,
      listingIds: ((listings ?? []) as Array<{ listing_id: string }>).map(
        (item) => item.listing_id,
      ),
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  async updateInstantSearchSession(
    sessionId: string,
    patch: Partial<InstantSearchSession>,
  ) {
    const mapped: Record<string, unknown> = {};
    if (patch.jobsFound !== undefined) mapped.jobs_found = patch.jobsFound;
    if (patch.analysedCount !== undefined) mapped.analysed_count = patch.analysedCount;
    if (patch.completedAt !== undefined) mapped.completed_at = patch.completedAt;
    if (patch.status !== undefined) mapped.status = patch.status;
    if (Object.keys(mapped).length > 0) {
      const { error } = await this.client
        .from("job_search_sessions")
        .update(mapped)
        .eq("id", sessionId);
      if (error) throw persistenceError("Instant Search session could not be updated.", error);
    }
    if (patch.listingIds) {
      await this.client
        .from("job_search_session_listings")
        .delete()
        .eq("session_id", sessionId);
      if (patch.listingIds.length > 0) {
        const { error } = await this.client.from("job_search_session_listings").insert(
          patch.listingIds.map((listingId) => ({
            session_id: sessionId,
            listing_id: listingId,
          })),
        );
        if (error) {
          throw persistenceError("Instant Search listings could not be updated.", error);
        }
      }
    }
    const session = await this.getLatestInstantSearchSessionById(sessionId);
    if (!session) throw persistenceError("Instant Search session could not be reloaded.", null);
    return session;
  }

  private async getLatestInstantSearchSessionById(sessionId: string) {
    const { data, error } = await this.client
      .from("job_search_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as SessionRow;
    const { data: listings } = await this.client
      .from("job_search_session_listings")
      .select("listing_id")
      .eq("session_id", sessionId);
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      jobsFound: row.jobs_found,
      analysedCount: row.analysed_count,
      listingIds: ((listings ?? []) as Array<{ listing_id: string }>).map(
        (item) => item.listing_id,
      ),
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  async insertCampaignRun(run: JobSearchCampaignRun) {
    const { error } = await this.client.from("job_search_campaign_runs").insert({
      id: run.id,
      campaign_id: run.campaignId,
      origin: run.origin,
      status: run.status,
      discovered: run.discovered,
      analysed: run.analysed,
      qualifying: run.qualifying,
      started_at: run.startedAt,
      completed_at: run.completedAt,
      error: run.error,
    });
    if (error) throw persistenceError("Campaign run could not be saved.", error);
    return run;
  }

  async updateCampaignRun(
    runId: string,
    patch: Partial<JobSearchCampaignRun>,
  ) {
    const mapped: Record<string, unknown> = {};
    if (patch.status !== undefined) mapped.status = patch.status;
    if (patch.discovered !== undefined) mapped.discovered = patch.discovered;
    if (patch.analysed !== undefined) mapped.analysed = patch.analysed;
    if (patch.qualifying !== undefined) mapped.qualifying = patch.qualifying;
    if (patch.completedAt !== undefined) mapped.completed_at = patch.completedAt;
    if (patch.error !== undefined) mapped.error = patch.error;
    const { data, error } = await this.client
      .from("job_search_campaign_runs")
      .update(mapped)
      .eq("id", runId)
      .select()
      .single();
    if (error || !data) throw persistenceError("Campaign run could not be updated.", error);
    const row = data as CampaignRunRow;
    return {
      id: row.id,
      campaignId: row.campaign_id,
      origin: row.origin,
      status: row.status,
      discovered: row.discovered,
      analysed: row.analysed,
      qualifying: row.qualifying,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
    };
  }

  async listCampaignRuns(campaignId: string, limit = 10) {
    const { data, error } = await this.client
      .from("job_search_campaign_runs")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw persistenceError("Campaign runs could not be loaded.", error);
    return ((data ?? []) as CampaignRunRow[]).map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      origin: row.origin,
      status: row.status,
      discovered: row.discovered,
      analysed: row.analysed,
      qualifying: row.qualifying,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
    }));
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

type CampaignListingRow = {
  campaign_id: string;
  listing_id: string;
  discovery_source: CampaignListingSighting["discoverySource"];
  first_seen_at: string;
  last_seen_at: string;
  originating_run_id: string | null;
  qualification: CampaignListingSighting["qualification"];
};

type SessionRow = {
  id: string;
  user_id: string;
  status: InstantSearchSession["status"];
  jobs_found: number;
  analysed_count: number;
  started_at: string;
  completed_at: string | null;
};

type CampaignRunRow = {
  id: string;
  campaign_id: string;
  origin: JobSearchCampaignRun["origin"];
  status: JobSearchCampaignRun["status"];
  discovered: number;
  analysed: number;
  qualifying: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
};

function mapCampaign(row: CampaignRow): JobSearchCampaign {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    primaryRole: row.primary_role,
    location: row.location,
    workMode: row.work_mode,
    employmentTypes: (row.employment_types ?? []) as JobSearchCampaign["employmentTypes"],
    experienceLevels: (row.experience_levels ?? []) as JobSearchCampaign["experienceLevels"],
    minimumScore: Number(row.minimum_score),
    preferredTechnologies: row.preferred_technologies ?? [],
    targetReadyDate: row.target_ready_date ?? null,
    weeklyHoursAvailable: (row.weekly_hours_available as JobSearchCampaign["weeklyHoursAvailable"]) ?? null,
    criteriaVersion: row.criteria_version,
    canonicalSearchId: row.canonical_search_id,
    lastLinkedInSearchAt: row.last_linkedin_search_at,
    nextLinkedInSearchAt: row.next_linkedin_search_at,
    lastBroadSearchAt: row.last_broad_search_at,
    nextBroadSearchAt: row.next_broad_search_at,
    lastDiscoveryAt: row.last_discovery_at,
    lastError: row.last_error,
    initialAlertsRemaining: row.initial_alerts_remaining,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function toCampaignRow(campaign: JobSearchCampaign) {
  return {
    id: campaign.id,
    user_id: campaign.userId,
    name: campaign.name,
    status: campaign.status,
    primary_role: campaign.primaryRole,
    location: campaign.location,
    work_mode: campaign.workMode,
    employment_types: campaign.employmentTypes,
    experience_levels: campaign.experienceLevels,
    minimum_score: campaign.minimumScore,
    preferred_technologies: campaign.preferredTechnologies,
    target_ready_date: campaign.targetReadyDate,
    weekly_hours_available: campaign.weeklyHoursAvailable,
    criteria_version: campaign.criteriaVersion,
    canonical_search_id: campaign.canonicalSearchId,
    last_linkedin_search_at: campaign.lastLinkedInSearchAt,
    next_linkedin_search_at: campaign.nextLinkedInSearchAt,
    last_broad_search_at: campaign.lastBroadSearchAt,
    next_broad_search_at: campaign.nextBroadSearchAt,
    last_discovery_at: campaign.lastDiscoveryAt,
    last_error: campaign.lastError,
    initial_alerts_remaining: campaign.initialAlertsRemaining,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
    archived_at: campaign.archivedAt,
  };
}

function toCampaignPatch(patch: CampaignPatch) {
  const mapped: Record<string, unknown> = {};
  if ("name" in patch) mapped.name = patch.name;
  if ("status" in patch) mapped.status = patch.status;
  if ("primaryRole" in patch) mapped.primary_role = patch.primaryRole;
  if ("location" in patch) mapped.location = patch.location;
  if ("workMode" in patch) mapped.work_mode = patch.workMode;
  if ("employmentTypes" in patch) mapped.employment_types = patch.employmentTypes;
  if ("experienceLevels" in patch) mapped.experience_levels = patch.experienceLevels;
  if ("minimumScore" in patch) mapped.minimum_score = patch.minimumScore;
  if ("preferredTechnologies" in patch) {
    mapped.preferred_technologies = patch.preferredTechnologies;
  }
  if ("targetReadyDate" in patch) mapped.target_ready_date = patch.targetReadyDate;
  if ("weeklyHoursAvailable" in patch) {
    mapped.weekly_hours_available = patch.weeklyHoursAvailable;
  }
  if ("criteriaVersion" in patch) mapped.criteria_version = patch.criteriaVersion;
  if ("canonicalSearchId" in patch) mapped.canonical_search_id = patch.canonicalSearchId;
  if ("lastLinkedInSearchAt" in patch) mapped.last_linkedin_search_at = patch.lastLinkedInSearchAt;
  if ("nextLinkedInSearchAt" in patch) mapped.next_linkedin_search_at = patch.nextLinkedInSearchAt;
  if ("lastBroadSearchAt" in patch) mapped.last_broad_search_at = patch.lastBroadSearchAt;
  if ("nextBroadSearchAt" in patch) mapped.next_broad_search_at = patch.nextBroadSearchAt;
  if ("lastDiscoveryAt" in patch) mapped.last_discovery_at = patch.lastDiscoveryAt;
  if ("lastError" in patch) mapped.last_error = patch.lastError;
  if ("initialAlertsRemaining" in patch) {
    mapped.initial_alerts_remaining = patch.initialAlertsRemaining;
  }
  if ("archivedAt" in patch) mapped.archived_at = patch.archivedAt;
  return mapped;
}

function mapCampaignListing(
  row: CampaignListingRow,
  isNewForCampaign: boolean,
): CampaignListingSighting {
  return {
    campaignId: row.campaign_id,
    listingId: row.listing_id,
    discoverySource: row.discovery_source,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    originatingRunId: row.originating_run_id,
    qualification: row.qualification,
    isNewForCampaign,
  };
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
