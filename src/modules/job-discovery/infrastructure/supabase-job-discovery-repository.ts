import type { SupabaseClient } from "@supabase/supabase-js";

import type { JobDiscoveryRepository } from "../application/ports";
import {
  discoveredJobSchema,
  jobSearchPreferencesSchema,
  type DiscoveredJob,
  type JobSearchProfile,
} from "../domain/job";
import { JobDiscoveryError } from "../domain/errors";

type ProfileRow = {
  id: string;
  user_id: string;
  preferences: unknown;
  preference_revision?: number | null;
  created_at: string;
  updated_at: string;
};

type UserJobViewRow = {
  state: string;
  job_listings: {
    id: string;
    publisher: string | null;
    source_url: string | null;
    application_url: string | null;
    application_is_direct: boolean | null;
    published_at: string | null;
    first_seen_at: string;
    last_seen_at: string;
    job_sources: { name: string };
    jobs: {
      id: string;
      title: string;
      description: string | null;
      location: string | null;
      city: string | null;
      region: string | null;
      country: string | null;
      employment_type: string | null;
      work_mode: string | null;
      experience_level: string | null;
      salary_min: number | null;
      salary_max: number | null;
      salary_currency: string | null;
      salary_period: string | null;
      closing_at: string | null;
      organizations: {
        name: string;
        logo_url: string | null;
      } | null;
    };
  };
};

const USER_JOB_VIEW = `
  state,
  job_listings!inner(
    id,
    publisher,
    source_url,
    application_url,
    application_is_direct,
    published_at,
    first_seen_at,
    last_seen_at,
    job_sources!inner(name),
    jobs!inner(
      id,
      title,
      description,
      location,
      city,
      region,
      country,
      employment_type,
      work_mode,
      experience_level,
      salary_min,
      salary_max,
      salary_currency,
      salary_period,
      closing_at,
      organizations(name, logo_url)
    )
  )
`;

export class SupabaseJobDiscoveryRepository
  implements JobDiscoveryRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async getSearchProfile(userId: string): Promise<JobSearchProfile | null> {
    const { data, error } = await this.client
      .from("job_search_profiles")
      .select()
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw persistenceError("Job preferences could not be loaded.", error);
    return data ? mapProfile(data as ProfileRow) : null;
  }

  async saveSearchProfile(
    input: Parameters<JobDiscoveryRepository["saveSearchProfile"]>[0],
  ): Promise<JobSearchProfile> {
    const payload = {
      id: input.id,
      user_id: input.userId,
      preferences: input.preferences,
      preference_revision: input.preferenceRevision,
      updated_at: input.updatedAt,
    };
    let { data, error } = await this.client
      .from("job_search_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    // Migration 0007 may not be applied yet — fall back without the column.
    if (error && /preference_revision/i.test(error.message)) {
      const fallback = await this.client
        .from("job_search_profiles")
        .upsert(
          {
            id: input.id,
            user_id: input.userId,
            preferences: input.preferences,
            updated_at: input.updatedAt,
          },
          { onConflict: "user_id" },
        )
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw persistenceError("Job preferences could not be saved.", error);
    const mapped = mapProfile(data as ProfileRow);
    return {
      ...mapped,
      preferenceRevision: input.preferenceRevision || mapped.preferenceRevision,
    };
  }

  async upsertDiscoveredJobs(
    input: Parameters<JobDiscoveryRepository["upsertDiscoveredJobs"]>[0],
  ): Promise<DiscoveredJob[]> {
    const discovered: DiscoveredJob[] = [];

    for (const job of input.jobs) {
      const { data: listingId, error } = await this.client.rpc(
        "upsert_discovered_job",
        {
          p_user_id: input.userId,
          p_source_key: input.source.key,
          p_source_name: input.source.name,
          p_external_job_id: job.external_id,
          p_organization_name: job.organization?.name ?? null,
          p_organization_logo_url: job.organization?.logo_url ?? null,
          p_organization_website_url: job.organization?.website_url ?? null,
          p_title: job.title,
          p_description: job.description,
          p_location: job.location,
          p_city: job.city,
          p_region: job.region,
          p_country: job.country,
          p_employment_type: job.employment_type,
          p_work_mode: job.work_mode,
          p_experience_level: job.experience_level,
          p_salary_min: job.salary_min,
          p_salary_max: job.salary_max,
          p_salary_currency: job.salary_currency,
          p_salary_period: job.salary_period,
          p_closing_at: job.closing_at,
          p_publisher: job.publisher,
          p_source_url: job.source_url,
          p_application_url: job.application_url,
          p_application_is_direct: job.application_is_direct,
          p_published_at: job.published_at,
          p_raw_payload: job.raw_payload,
          p_seen_at: input.seenAt,
        },
      );
      if (error || typeof listingId !== "string") {
        throw persistenceError("The discovered job could not be saved.", error);
      }
      discovered.push(await this.getUserJob(input.userId, listingId));
    }

    return discovered;
  }

  async listJobs(
    input: Parameters<JobDiscoveryRepository["listJobs"]>[0],
  ): Promise<DiscoveredJob[]> {
    let query = this.client
      .from("user_jobs")
      .select(USER_JOB_VIEW)
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);
    if (!input.includeDismissed) {
      query = query.neq("state", "dismissed");
    }
    const { data, error } = await query;
    if (error) throw persistenceError("Discovered jobs could not be loaded.", error);
    return (data as unknown as UserJobViewRow[]).map(mapUserJob);
  }

  async setUserJobState(
    input: Parameters<JobDiscoveryRepository["setUserJobState"]>[0],
  ): Promise<DiscoveredJob> {
    const { data, error } = await this.client
      .from("user_jobs")
      .update({ state: input.state, updated_at: input.updatedAt })
      .eq("user_id", input.userId)
      .eq("job_listing_id", input.listingId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw persistenceError("The job state could not be updated.", error);
    }
    if (!data) {
      throw new JobDiscoveryError(
        "NOT_FOUND",
        "That discovered job could not be found.",
      );
    }
    return this.getUserJob(input.userId, input.listingId);
  }

  async clearDiscoveredJobs(input: {
    userId: string;
    includeSaved: boolean;
  }): Promise<number> {
    let query = this.client
      .from("user_jobs")
      .delete({ count: "exact" })
      .eq("user_id", input.userId);
    if (!input.includeSaved) {
      query = query.neq("state", "saved");
    }
    const { error, count } = await query;
    if (error) {
      throw persistenceError("Searched jobs could not be cleared.", error);
    }
    return count ?? 0;
  }

  private async getUserJob(userId: string, listingId: string) {
    const { data, error } = await this.client
      .from("user_jobs")
      .select(USER_JOB_VIEW)
      .eq("user_id", userId)
      .eq("job_listing_id", listingId)
      .single();
    if (error) throw persistenceError("The discovered job could not be loaded.", error);
    return mapUserJob(data as unknown as UserJobViewRow);
  }
}

function mapProfile(row: ProfileRow): JobSearchProfile {
  return {
    id: row.id,
    userId: row.user_id,
    preferences: jobSearchPreferencesSchema.parse(row.preferences),
    preferenceRevision: row.preference_revision ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUserJob(row: UserJobViewRow): DiscoveredJob {
  const listing = row.job_listings;
  const job = listing.jobs;
  return discoveredJobSchema.parse({
    job_id: job.id,
    listing_id: listing.id,
    title: job.title,
    organization_name: job.organizations?.name ?? null,
    organization_logo_url: job.organizations?.logo_url ?? null,
    description: job.description,
    location: job.location,
    city: job.city,
    region: job.region,
    country: job.country,
    employment_type: job.employment_type,
    work_mode: job.work_mode,
    experience_level: job.experience_level,
    salary_min: job.salary_min === null ? null : Number(job.salary_min),
    salary_max: job.salary_max === null ? null : Number(job.salary_max),
    salary_currency: job.salary_currency,
    salary_period: job.salary_period,
    published_at: listing.published_at,
    closing_at: job.closing_at,
    publisher: listing.publisher,
    source_name: listing.job_sources.name,
    source_url: listing.source_url,
    application_url: listing.application_url,
    application_is_direct: listing.application_is_direct,
    first_seen_at: listing.first_seen_at,
    last_seen_at: listing.last_seen_at,
    user_state: row.state,
  });
}

function persistenceError(message: string, cause: unknown) {
  return new JobDiscoveryError("PERSISTENCE_FAILED", message, { cause });
}
