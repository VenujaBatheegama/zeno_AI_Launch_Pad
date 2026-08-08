import { describe, expect, it } from "vitest";

import {
  emptyJobSearchPreferences,
  type DiscoveredJob,
  type JobSearchProfile,
  type NormalizedExternalJob,
  type UserJobState,
} from "../domain/job";
import { buildSearchCriteria, discoverJobs } from "./discover-jobs";
import {
  clearDiscoveredJobsForUser,
  listDiscoveredJobs,
  setUserJobState,
} from "./jobs";
import type {
  JobDiscoveryRepository,
  JobSource,
  JobSourceIdentity,
} from "./ports";
import {
  getJobSearchProfile,
  saveJobSearchPreferences,
} from "./preferences";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PROFILE_ID = "00000000-0000-4000-8000-000000000010";
const NOW = "2026-08-07T00:00:00.000Z";

describe("job discovery application", () => {
  it("creates, updates, and reloads optional search preferences", async () => {
    const repository = new MemoryJobRepository();
    const dependencies = {
      repository,
      createId: () => PROFILE_ID,
      now: () => new Date(NOW),
    };

    await saveJobSearchPreferences(
      {
        userId: USER_ID,
        preferences: {
          ...emptyJobSearchPreferences,
          roles: ["Software Engineer"],
        },
      },
      dependencies,
    );
    await saveJobSearchPreferences(
      {
        userId: USER_ID,
        preferences: {
          ...emptyJobSearchPreferences,
          roles: ["DevOps Engineer"],
          locations: ["Colombo"],
          work_modes: ["remote"],
        },
      },
      dependencies,
    );

    expect(await getJobSearchProfile(USER_ID, repository)).toMatchObject({
      id: PROFILE_ID,
      preferences: {
        roles: ["DevOps Engineer"],
        locations: ["Colombo"],
        work_modes: ["remote"],
        employment_types: [],
      },
    });
  });

  it("builds deterministic bounded requests without role-location fan-out", () => {
    const criteria = buildSearchCriteria(
      {
        ...emptyJobSearchPreferences,
        roles: [
          "Software Engineer",
          "Associate Software Engineer",
          "DevOps Engineer",
          "Platform Engineer",
          "SRE",
        ],
        locations: ["Sri Lanka", "Colombo", "Remote"],
      },
      { maxRequests: 2, pageSize: 10 },
    );

    expect(criteria).toEqual([
      expect.objectContaining({
        role_titles: ["Software Engineer"],
        locations: ["Sri Lanka", "Colombo", "Remote"],
      }),
      expect.objectContaining({
        role_titles: ["Associate Software Engineer"],
        locations: ["Sri Lanka", "Colombo", "Remote"],
      }),
    ]);
  });

  it("returns successful jobs and reports a partial source failure", async () => {
    const repository = await repositoryWithProfile();
    let calls = 0;
    const source: JobSource = {
      identity: { key: "fixture", name: "Fixture Jobs" },
      search: async () => {
        calls += 1;
        if (calls === 2) {
          throw new Error("temporary failure");
        }
        return {
          jobs: [externalJob()],
          nextCursor: "next",
          partialFailure: false,
        };
      },
    };

    const result = await discoverJobs(
      { userId: USER_ID, depth: 1 },
      {
        repository,
        source,
        now: () => new Date(NOW),
        maxRequests: 2,
        maxPages: 2,
        pageSize: 10,
      },
    );

    expect(result).toMatchObject({
      partialFailure: true,
      requestsMade: 2,
      nextCursor: '["next",null]',
    });
    expect(result.jobs[0]).toMatchObject({
      title: "Software Engineer",
      organization_name: "Acme",
      publisher: "LinkedIn",
      application_url: "https://example.com/jobs/abc",
      published_at: "2026-08-01T10:00:00.000Z",
    });
  });

  it("returns an honest empty result when the provider has no jobs", async () => {
    const repository = await repositoryWithProfile(["Software Engineer"]);
    const result = await discoverJobs(
      { userId: USER_ID, depth: 1 },
      {
        repository,
        source: {
          identity: { key: "fixture", name: "Fixture Jobs" },
          search: async () => ({
            jobs: [],
            nextCursor: null,
            partialFailure: false,
          }),
        },
        now: () => new Date(NOW),
        maxRequests: 2,
        maxPages: 2,
        pageSize: 10,
      },
    );

    expect(result.jobs).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("deduplicates rediscovery while preserving first seen time", async () => {
    const repository = await repositoryWithProfile(["Software Engineer"]);
    const source: JobSource = {
      identity: { key: "fixture", name: "Fixture Jobs" },
      search: async () => ({
        jobs: [externalJob()],
        nextCursor: null,
        partialFailure: false,
      }),
    };
    const dependencies = {
      repository,
      source,
      now: () => new Date("2026-08-07T00:00:00.000Z"),
      maxRequests: 1,
      maxPages: 2,
      pageSize: 10,
    };
    const first = await discoverJobs(
      { userId: USER_ID, depth: 1 },
      dependencies,
    );
    const second = await discoverJobs(
      { userId: USER_ID, depth: 1 },
      {
        ...dependencies,
        now: () => new Date("2026-08-08T00:00:00.000Z"),
      },
    );

    expect(await listDiscoveredJobs({ userId: USER_ID }, repository)).toHaveLength(
      1,
    );
    expect(second.jobs[0]).toMatchObject({
      listing_id: first.jobs[0].listing_id,
      first_seen_at: "2026-08-07T00:00:00.000Z",
      last_seen_at: "2026-08-08T00:00:00.000Z",
    });
  });

  it("persists saved and dismissed state across reloads", async () => {
    const repository = await repositoryWithProfile(["Software Engineer"]);
    const [job] = await repository.upsertDiscoveredJobs({
      userId: USER_ID,
      source: { key: "fixture", name: "Fixture Jobs" },
      jobs: [externalJob()],
      seenAt: NOW,
    });

    await setUserJobState(
      { userId: USER_ID, listingId: job.listing_id, state: "saved" },
      { repository, now: () => new Date(NOW) },
    );
    expect(
      await listDiscoveredJobs({ userId: USER_ID }, repository),
    ).toMatchObject([{ user_state: "saved" }]);

    await setUserJobState(
      { userId: USER_ID, listingId: job.listing_id, state: "dismissed" },
      { repository, now: () => new Date(NOW) },
    );
    expect(await listDiscoveredJobs({ userId: USER_ID }, repository)).toEqual(
      [],
    );
    expect(
      await listDiscoveredJobs(
        { userId: USER_ID, includeDismissed: true },
        repository,
      ),
    ).toMatchObject([{ user_state: "dismissed" }]);
  });

  it("clears searched jobs while keeping saved ones", async () => {
    const repository = await repositoryWithProfile(["Software Engineer"]);
    const [discovered, saved] = await repository.upsertDiscoveredJobs({
      userId: USER_ID,
      source: { key: "fixture", name: "Fixture Jobs" },
      jobs: [
        externalJob(),
        { ...externalJob(), external_id: "keep-saved", title: "Backend Engineer" },
      ],
      seenAt: NOW,
    });
    await setUserJobState(
      { userId: USER_ID, listingId: saved.listing_id, state: "saved" },
      { repository, now: () => new Date(NOW) },
    );

    const result = await clearDiscoveredJobsForUser(
      { userId: USER_ID },
      repository,
    );

    expect(result.removed).toBe(1);
    const remaining = await listDiscoveredJobs({ userId: USER_ID }, repository);
    expect(remaining).toMatchObject([
      { listing_id: saved.listing_id, user_state: "saved" },
    ]);
    expect(remaining.some((job) => job.listing_id === discovered.listing_id)).toBe(
      false,
    );
  });

  it("hides previously discovered titles that match current excluded keywords", async () => {
    const repository = await repositoryWithProfile(["Software Engineer"]);
    await repository.upsertDiscoveredJobs({
      userId: USER_ID,
      source: { key: "fixture", name: "Fixture Jobs" },
      jobs: [
        externalJob(),
        {
          ...externalJob(),
          external_id: "senior-1",
          title: "Senior Software Engineer",
        },
      ],
      seenAt: NOW,
    });
    await saveJobSearchPreferences(
      {
        userId: USER_ID,
        preferences: {
          ...emptyJobSearchPreferences,
          roles: ["Software Engineer"],
          excluded_keywords: ["senior"],
        },
      },
      {
        repository,
        createId: () => PROFILE_ID,
        now: () => new Date(NOW),
      },
    );

    expect(
      await listDiscoveredJobs({ userId: USER_ID }, repository),
    ).toMatchObject([{ title: "Software Engineer" }]);
  });
});

async function repositoryWithProfile(
  roles = [
    "Software Engineer",
    "Associate Software Engineer",
    "DevOps Engineer",
  ],
) {
  const repository = new MemoryJobRepository();
  await saveJobSearchPreferences(
    {
      userId: USER_ID,
      preferences: {
        ...emptyJobSearchPreferences,
        roles,
        locations: ["Sri Lanka", "Remote"],
      },
    },
    {
      repository,
      createId: () => PROFILE_ID,
      now: () => new Date(NOW),
    },
  );
  return repository;
}

function externalJob(): NormalizedExternalJob {
  return {
    external_id: "abc",
    title: "Software Engineer",
    organization: {
      name: "Acme",
      logo_url: null,
      website_url: null,
    },
    description: "Build reliable software.",
    location: "Colombo, Sri Lanka",
    city: "Colombo",
    region: null,
    country: "LK",
    employment_type: "full_time",
    work_mode: null,
    experience_level: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at: "2026-08-01T10:00:00.000Z",
    closing_at: null,
    publisher: "LinkedIn",
    source_url: null,
    application_url: "https://example.com/jobs/abc",
    application_is_direct: true,
    raw_payload: { job_id: "abc" },
  };
}

class MemoryJobRepository implements JobDiscoveryRepository {
  private profile: JobSearchProfile | null = null;
  private jobs = new Map<string, DiscoveredJob>();

  async getSearchProfile(userId: string) {
    return this.profile?.userId === userId ? this.profile : null;
  }

  async saveSearchProfile(input: {
    id: string;
    userId: string;
    preferences: JobSearchProfile["preferences"];
    updatedAt: string;
  }) {
    this.profile = {
      ...input,
      createdAt: this.profile?.createdAt ?? input.updatedAt,
    };
    return this.profile;
  }

  async upsertDiscoveredJobs(input: {
    userId: string;
    source: JobSourceIdentity;
    jobs: NormalizedExternalJob[];
    seenAt: string;
  }) {
    return input.jobs.map((job, index) => {
      const key = `${input.source.key}:${job.external_id}`;
      const current = this.jobs.get(key);
      const persisted: DiscoveredJob = {
        job_id:
          current?.job_id ??
          `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
        listing_id:
          current?.listing_id ??
          `00000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
        title: job.title,
        organization_name: job.organization?.name ?? null,
        organization_logo_url: job.organization?.logo_url ?? null,
        description: job.description,
        location: job.location,
        city: job.city,
        region: job.region,
        country: job.country,
        employment_type: job.employment_type,
        work_mode: job.work_mode,
        experience_level: job.experience_level,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
        salary_period: job.salary_period,
        published_at: job.published_at,
        closing_at: job.closing_at,
        publisher: job.publisher,
        source_name: input.source.name,
        source_url: job.source_url,
        application_url: job.application_url,
        application_is_direct: job.application_is_direct,
        first_seen_at: current?.first_seen_at ?? input.seenAt,
        last_seen_at: input.seenAt,
        user_state: current?.user_state ?? "discovered",
      };
      this.jobs.set(key, persisted);
      return persisted;
    });
  }

  async listJobs(input: {
    userId: string;
    includeDismissed: boolean;
    limit: number;
    offset: number;
  }) {
    return [...this.jobs.values()]
      .filter((job) => input.includeDismissed || job.user_state !== "dismissed")
      .slice(input.offset, input.offset + input.limit);
  }

  async setUserJobState(input: {
    userId: string;
    listingId: string;
    state: UserJobState;
    updatedAt: string;
  }) {
    const entry = [...this.jobs.entries()].find(
      ([, job]) => job.listing_id === input.listingId,
    );
    if (!entry) {
      throw new Error("missing job");
    }
    const updated = { ...entry[1], user_state: input.state };
    this.jobs.set(entry[0], updated);
    return updated;
  }

  async clearDiscoveredJobs(input: {
    userId: string;
    includeSaved: boolean;
  }) {
    void input.userId;
    let removed = 0;
    for (const [key, job] of this.jobs) {
      if (!input.includeSaved && job.user_state === "saved") continue;
      this.jobs.delete(key);
      removed += 1;
    }
    return removed;
  }
}
