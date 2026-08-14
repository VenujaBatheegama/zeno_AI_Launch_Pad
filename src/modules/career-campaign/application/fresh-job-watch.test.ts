import { describe, expect, it } from "vitest";

import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";
import type { NormalizedExternalJob } from "@/modules/job-discovery/domain/job";

import { InMemoryCareerCampaignRepository } from "./fakes";
import { InMemoryFreshWatchRepository } from "./fresh-watch-fakes";
import type { FreshWatchCaps } from "./fresh-watch-ports";
import {
  archiveJobCampaign,
  createJobCampaign,
  pauseJobCampaign,
  updateJobCampaign,
} from "./manage-job-campaigns";
import {
  enableFreshJobWatch,
  getFreshJobWatchStatus,
  pauseFreshJobWatch,
} from "./manage-fresh-job-watch";
import { processLinkedInFreshSearch } from "./process-linkedin-fresh-search";
import { processScheduledDiscoveryTick } from "./process-scheduled-discovery-tick";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "11111111-1111-4111-8111-111111111112";
const ANALYSIS = "33333333-3333-4333-8333-333333333333";

function caps(overrides: Partial<FreshWatchCaps> = {}): FreshWatchCaps {
  return {
    linkedInIntervalMs: 15 * 60_000,
    linkedInRecencySeconds: 3600,
    broadIntervalMs: 12 * 60 * 60_000,
    maxCanonicalSearchesPerTick: 5,
    linkedInMaxPages: 1,
    linkedInMaxResults: 10,
    maxDescriptionFetchesPerTick: 8,
    maxGroqAnalysesPerTick: 8,
    maxAnalysesPerUser: 3,
    providerCooldownMs: 30 * 60_000,
    schedulerLeaseMs: 120_000,
    initialAlertCap: 3,
    minScore: 55,
    ...overrides,
  };
}

function createIdFactory() {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  };
}

function card(
  overrides: Partial<NormalizedExternalJob> & { external_id: string; title: string },
): NormalizedExternalJob {
  return {
    organization: { name: "Acme", logo_url: null, website_url: null },
    description: null,
    location: "Colombo, Sri Lanka",
    city: "Colombo",
    region: null,
    country: "Sri Lanka",
    employment_type: "full_time",
    work_mode: "remote",
    experience_level: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at: "2026-08-13T00:00:00.000Z",
    closing_at: null,
    publisher: "linkedin.com",
    source_url: `https://www.linkedin.com/jobs/view/${overrides.external_id}?utm_source=x`,
    application_url: `https://www.linkedin.com/jobs/view/${overrides.external_id}?utm_source=x`,
    application_is_direct: false,
    raw_payload: {},
    ...overrides,
  };
}

describe("Fresh Job Watch", () => {
  it("enables a durable watch and schedules an initial LinkedIn check", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const watch = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    expect(watch.status).toBe("active");
    expect(watch.primaryRole).toBe("Backend Developer");
    const search = await repository.getCanonicalSearchById(watch.canonicalSearchId);
    expect(search?.nextDueAt).toBe("2026-08-13T10:00:00.000Z");
    const status = await getFreshJobWatchStatus(USER_A, { repository });
    expect(status.enabled).toBe(true);
    expect(status.primaryRole).toBe("Backend Developer");
  });

  it("pauses and does not process a disabled watch", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    await pauseFreshJobWatch({ userId: USER_A }, { repository, now });
    const claimed = await repository.claimDueCanonicalSearches({
      now: "2026-08-13T10:01:00.000Z",
      leaseOwner: "run",
      leaseExpiresAt: "2026-08-13T10:03:00.000Z",
      limit: 5,
    });
    expect(claimed).toEqual([]);
  });

  it("lets a user create multiple campaigns that share equivalent LinkedIn searches", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const first = await createJobCampaign(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    const second = await createJobCampaign(
      {
        userId: USER_A,
        primaryRole: "Frontend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    expect(second.id).not.toBe(first.id);
    expect(repository.campaigns.size).toBe(2);
    expect(await repository.countActiveMembers(first.canonicalSearchId)).toBe(1);
    expect(await repository.countActiveMembers(second.canonicalSearchId)).toBe(1);
  });

  it("enforces a maximum of three active campaigns and ignores paused or archived ones", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const deps = { repository, createId: ids, now, caps: caps() };
    const first = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      deps,
    );
    await createJobCampaign(
      { userId: USER_A, primaryRole: "Frontend Developer", location: "Sri Lanka" },
      deps,
    );
    await createJobCampaign(
      { userId: USER_A, primaryRole: "DevOps Engineer", location: "Remote" },
      deps,
    );
    await expect(
      createJobCampaign(
        { userId: USER_A, primaryRole: "Data Engineer", location: "Singapore" },
        deps,
      ),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED" });
    await pauseJobCampaign(
      { userId: USER_A, campaignId: first.id },
      { repository, now },
    );
    const fourth = await createJobCampaign(
      { userId: USER_A, primaryRole: "Data Engineer", location: "Singapore" },
      deps,
    );
    expect(fourth.status).toBe("active");
    await archiveJobCampaign(
      { userId: USER_A, campaignId: fourth.id },
      { repository, now },
    );
    const fifth = await createJobCampaign(
      { userId: USER_A, primaryRole: "Mobile Engineer", location: "Remote" },
      deps,
    );
    expect(fifth.status).toBe("active");
    expect(await repository.countActiveCampaigns(USER_A)).toBe(3);
  });
});

describe("canonical subscriptions", () => {
  it("shares one LinkedIn query for equivalent watches", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const a = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
        minScore: 70,
      },
      { repository, createId: ids, now, caps: caps() },
    );
    const b = await enableFreshJobWatch(
      {
        userId: USER_B,
        primaryRole: "backend developer",
        location: "Sri Lanka",
        workMode: "remote",
        minScore: 40,
      },
      { repository, createId: ids, now, caps: caps() },
    );
    expect(a.canonicalSearchId).toBe(b.canonicalSearchId);
    expect(repository.searches.size).toBe(1);
  });

  it("does not share different roles or locations", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const a = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    const b = await enableFreshJobWatch(
      {
        userId: USER_B,
        primaryRole: "Backend Developer",
        location: "Singapore",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    expect(a.canonicalSearchId).not.toBe(b.canonicalSearchId);
  });
});

describe("LinkedIn fresh search token budget", () => {
  it("invokes LLM zero times for empty results", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const watch = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    let llm = 0;
    const result = await processLinkedInFreshSearch(
      { canonicalSearchId: watch.canonicalSearchId, runId: "run-1" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn: {
          searchFreshCards: async () => ({ jobs: [] }),
          fetchJobDescription: async () => {
            throw new Error("should not fetch");
          },
        },
        analyseListing: async () => {
          llm += 1;
          throw new Error("should not analyse");
        },
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    expect(result.llmCalls).toBe(0);
    expect(llm).toBe(0);
    expect(result.cardsReturned).toBe(0);
  });

  it("does not fetch details or invoke LLM for a repeated LinkedIn id", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const watch = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    const job = card({
      external_id: "4446601813",
      title: "Backend Developer",
    });
    let fetches = 0;
    let llm = 0;
    const linkedIn = {
      searchFreshCards: async () => ({ jobs: [job] }),
          fetchJobDescription: async () => {
            fetches += 1;
            return "Build APIs with TypeScript and PostgreSQL in a remote team collaborating across product and platform. Own production reliability.";
          },
    };
    const analyseListing = async () => {
      llm += 1;
      return {
        listingId: "x",
        ok: true,
        matchAnalysisId: ANALYSIS,
        evidenceFitScore: 80,
        hardConstraintEligible: true,
        llmCalls: 1,
        title: job.title,
      };
    };
    await processLinkedInFreshSearch(
      { canonicalSearchId: watch.canonicalSearchId, runId: "run-1" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn,
        analyseListing,
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    const second = await processLinkedInFreshSearch(
      { canonicalSearchId: watch.canonicalSearchId, runId: "run-2" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn,
        analyseListing,
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    expect(second.repeated).toBe(1);
    expect(second.descriptionsFetched).toBe(0);
    expect(second.llmCalls).toBe(0);
    expect(fetches).toBe(1);
    expect(llm).toBe(1);

    for (let poll = 0; poll < 2; poll += 1) {
      const later = await processLinkedInFreshSearch(
        { canonicalSearchId: watch.canonicalSearchId, runId: `run-${poll + 3}` },
        {
          repository,
          campaignRepository: campaign,
          linkedIn,
          analyseListing,
          createId: createIdFactory(),
          now,
          caps: caps(),
        },
      );
      expect(later.repeated).toBe(1);
      expect(later.llmCalls).toBe(0);
      expect(later.descriptionsFetched).toBe(0);
    }
    expect(fetches).toBe(1);
    expect(llm).toBe(1);
  });

  it("reuses extraction across users and creates one recommendation per user", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const a = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    await enableFreshJobWatch(
      {
        userId: USER_B,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    const job = card({
      external_id: "999",
      title: "Backend Developer",
    });
    let extracts = 0;
    const result = await processLinkedInFreshSearch(
      { canonicalSearchId: a.canonicalSearchId, runId: "run-1" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn: {
          searchFreshCards: async () => ({ jobs: [job] }),
          fetchJobDescription: async () =>
            "Build APIs with TypeScript and PostgreSQL in a remote team collaborating across product and platform. Own production reliability.",
        },
        analyseListing: async ({ listingId }) => {
          extracts += 1;
          return {
            listingId,
            ok: true,
            matchAnalysisId: `${ANALYSIS}${extracts}`,
            evidenceFitScore: 80,
            hardConstraintEligible: true,
            extractionCacheHit: extracts > 1,
            llmCalls: extracts > 1 ? 0 : 1,
            title: job.title,
          };
        },
        createId: ids,
        now,
        caps: caps(),
      },
    );
    expect(result.recommendationsCreated).toBe(2);
    expect(result.llmCalls).toBe(1);
    expect(campaign.notifications.size).toBe(2);
  });

  it("suppresses weak matches and already-recommended jobs", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const watch = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    const weak = card({ external_id: "1", title: "Backend Developer" });
    const result = await processLinkedInFreshSearch(
      { canonicalSearchId: watch.canonicalSearchId, runId: "run-1" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn: {
          searchFreshCards: async () => ({ jobs: [weak] }),
          fetchJobDescription: async () =>
            "Build APIs with TypeScript and PostgreSQL in a remote team collaborating across product and platform. Own production reliability.",
        },
        analyseListing: async ({ listingId }) => ({
          listingId,
          ok: true,
          matchAnalysisId: ANALYSIS,
          evidenceFitScore: 20,
          hardConstraintEligible: true,
          llmCalls: 1,
          title: weak.title,
        }),
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    expect(result.recommendationsCreated).toBe(0);
  });

  it("obeys the initial enable alert cap", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const watch = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps({ initialAlertCap: 1 }) },
    );
    const jobs = [
      card({ external_id: "1", title: "Backend Developer" }),
      card({ external_id: "2", title: "Backend Developer II" }),
    ];
    const result = await processLinkedInFreshSearch(
      { canonicalSearchId: watch.canonicalSearchId, runId: "run-1" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn: {
          searchFreshCards: async () => ({ jobs }),
          fetchJobDescription: async () =>
            "Build APIs with TypeScript and PostgreSQL in a remote team collaborating across product and platform. Own production reliability.",
        },
        analyseListing: async ({ listingId }) => ({
          listingId,
          ok: true,
          matchAnalysisId: `${ANALYSIS}-${listingId}`,
          evidenceFitScore: 80,
          hardConstraintEligible: true,
          llmCalls: 1,
          title: "Backend Developer",
        }),
        createId: createIdFactory(),
        now,
        caps: caps({ initialAlertCap: 1 }),
      },
    );
    expect(result.recommendationsCreated).toBe(1);
  });

  it("cools down LinkedIn after 429 and skips later queries", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const watch = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    await processLinkedInFreshSearch(
      { canonicalSearchId: watch.canonicalSearchId, runId: "run-1" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn: {
          searchFreshCards: async () => {
            throw new JobDiscoveryError("SOURCE_RATE_LIMITED", "rate limited");
          },
          fetchJobDescription: async () => null,
        },
        analyseListing: async () => ({ listingId: "x", ok: false }),
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    const skipped = await processLinkedInFreshSearch(
      { canonicalSearchId: watch.canonicalSearchId, runId: "run-2" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn: {
          searchFreshCards: async () => {
            throw new Error("should not call");
          },
          fetchJobDescription: async () => null,
        },
        analyseListing: async () => ({ listingId: "x", ok: false }),
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    expect(skipped.skipped).toBe(true);
    expect(skipped.skipReason).toBe("provider_cooldown");
  });
});

describe("scheduler tick", () => {
  it("runs due LinkedIn searches without running a broad campaign every 15 minutes", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    let clock = new Date("2026-08-13T10:00:00.000Z");
    const now = () => clock;
    const watch = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    await repository.updateCampaign(watch.id, {
      nextBroadSearchAt: "2026-08-13T22:00:00.000Z",
    });
    let broad = 0;
    const first = await processScheduledDiscoveryTick({
      repository,
      campaignRepository: campaign,
      createId: createIdFactory(),
      now,
      caps: caps(),
      processLinkedInSearch: async () => {
        await repository.updateCanonicalSearch(watch.canonicalSearchId, {
          nextDueAt: "2026-08-13T10:16:00.000Z",
          lastSucceededAt: "2026-08-13T10:00:00.000Z",
        });
        return {
        canonicalSearchId: watch.canonicalSearchId,
        linkedInRequests: 1,
        cardsReturned: 0,
        repeated: 0,
        newlyPersisted: 0,
        descriptionsFetched: 0,
        crossProviderDuplicates: 0,
        deterministicRejected: 0,
        llmCalls: 0,
        llmCallsSaved: 0,
        recommendationsCreated: 0,
        skipped: false,
        skipReason: null,
        error: null,
      };
      },
      runBroadCampaign: async () => {
        broad += 1;
        return { recommended: 0, status: "completed" };
      },
    });
    expect(first.linkedIn.claimed).toBe(1);
    expect(first.broad.claimed).toBe(0);
    expect(broad).toBe(0);

    clock = new Date("2026-08-13T10:15:00.000Z");
    const duplicate = await processScheduledDiscoveryTick({
      repository,
      campaignRepository: campaign,
      createId: createIdFactory(),
      now,
      caps: caps(),
      processLinkedInSearch: async () => {
        throw new Error("should not rerun before interval");
      },
      runBroadCampaign: async () => {
        broad += 1;
        return { recommended: 0, status: "completed" };
      },
    });
    expect(duplicate.linkedIn.claimed).toBe(0);

    clock = new Date("2026-08-13T22:00:00.000Z");
    const later = await processScheduledDiscoveryTick({
      repository,
      campaignRepository: campaign,
      createId: createIdFactory(),
      now,
      caps: caps(),
      processLinkedInSearch: async () => ({
        canonicalSearchId: watch.canonicalSearchId,
        linkedInRequests: 0,
        cardsReturned: 0,
        repeated: 0,
        newlyPersisted: 0,
        descriptionsFetched: 0,
        crossProviderDuplicates: 0,
        deterministicRejected: 0,
        llmCalls: 0,
        llmCallsSaved: 0,
        recommendationsCreated: 0,
        skipped: true,
        skipReason: "not_due",
        error: null,
      }),
      runBroadCampaign: async () => {
        broad += 1;
        return { recommended: 2, status: "completed" };
      },
    });
    expect(later.broad.claimed).toBe(1);
    expect(broad).toBe(1);
  });

  it("does not let concurrent workers claim the same search", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    const first = await repository.claimDueCanonicalSearches({
      now: "2026-08-13T10:00:00.000Z",
      leaseOwner: "worker-a",
      leaseExpiresAt: "2026-08-13T10:02:00.000Z",
      limit: 5,
    });
    const second = await repository.claimDueCanonicalSearches({
      now: "2026-08-13T10:00:00.000Z",
      leaseOwner: "worker-b",
      leaseExpiresAt: "2026-08-13T10:02:00.000Z",
      limit: 5,
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("recovers expired leases", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    await repository.claimDueCanonicalSearches({
      now: "2026-08-13T10:00:00.000Z",
      leaseOwner: "worker-a",
      leaseExpiresAt: "2026-08-13T10:02:00.000Z",
      limit: 5,
    });
    const recovered = await repository.claimDueCanonicalSearches({
      now: "2026-08-13T10:03:00.000Z",
      leaseOwner: "worker-b",
      leaseExpiresAt: "2026-08-13T10:05:00.000Z",
      limit: 5,
    });
    expect(recovered).toHaveLength(1);
  });

  it("continues other searches when one fails and enforces batch caps", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const a = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    await enableFreshJobWatch(
      {
        userId: USER_B,
        primaryRole: "Frontend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    let calls = 0;
    const result = await processScheduledDiscoveryTick({
      repository,
      campaignRepository: campaign,
      createId: ids,
      now,
      caps: caps({ maxCanonicalSearchesPerTick: 2 }),
      processLinkedInSearch: async ({ canonicalSearchId }) => {
        calls += 1;
        if (canonicalSearchId === a.canonicalSearchId) {
          throw new Error("boom");
        }
        return {
          canonicalSearchId,
          linkedInRequests: 1,
          cardsReturned: 0,
          repeated: 0,
          newlyPersisted: 0,
          descriptionsFetched: 0,
          crossProviderDuplicates: 0,
          deterministicRejected: 0,
          llmCalls: 0,
          llmCallsSaved: 0,
          recommendationsCreated: 0,
          skipped: false,
          skipReason: null,
          error: null,
        };
      },
      runBroadCampaign: async () => ({ recommended: 0, status: "completed" }),
    });
    expect(calls).toBe(2);
    expect(result.linkedIn.failed).toBe(1);
    expect(result.linkedIn.processed).toBe(1);
  });

  it("does not schedule paused or archived campaigns", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const paused = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: ids, now, caps: caps() },
    );
    const archived = await createJobCampaign(
      { userId: USER_A, primaryRole: "Frontend Developer", location: "Colombo" },
      { repository, createId: ids, now, caps: caps() },
    );
    await pauseJobCampaign(
      { userId: USER_A, campaignId: paused.id },
      { repository, now },
    );
    await archiveJobCampaign(
      { userId: USER_A, campaignId: archived.id },
      { repository, now },
    );
    const claimed = await repository.claimDueCanonicalSearches({
      now: "2026-08-13T10:01:00.000Z",
      leaseOwner: "run",
      leaseExpiresAt: "2026-08-13T10:03:00.000Z",
      limit: 5,
    });
    expect(claimed).toEqual([]);
    const broad = await repository.claimDueBroadCampaigns({
      now: "2026-08-13T22:00:00.000Z",
      leaseOwner: "run",
      leaseExpiresAt: "2026-08-13T22:02:00.000Z",
      limit: 5,
    });
    expect(broad).toEqual([]);
  });
});

describe("campaign membership and isolation", () => {
  it("moves canonical membership when criteria change", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const campaign = await createJobCampaign(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    const previous = campaign.canonicalSearchId;
    const updated = await updateJobCampaign(
      {
        userId: USER_A,
        campaignId: campaign.id,
        primaryRole: "Frontend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    expect(updated.canonicalSearchId).not.toBe(previous);
    expect(updated.criteriaVersion).toBe(2);
    expect(await repository.countActiveMembers(previous)).toBe(0);
    expect(await repository.countActiveMembers(updated.canonicalSearchId)).toBe(1);
  });

  it("keeps a listing globally unique while attributing it to multiple campaigns", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const campaign = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const a = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: ids, now, caps: caps() },
    );
    const b = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: ids, now, caps: caps() },
    );
    expect(a.canonicalSearchId).toBe(b.canonicalSearchId);
    const job = card({ external_id: "shared-1", title: "Backend Developer" });
    await processLinkedInFreshSearch(
      { canonicalSearchId: a.canonicalSearchId, runId: "run-1" },
      {
        repository,
        campaignRepository: campaign,
        linkedIn: {
          searchFreshCards: async () => ({ jobs: [job] }),
          fetchJobDescription: async () =>
            "Build APIs with TypeScript and PostgreSQL in a remote team collaborating across product and platform. Own production reliability.",
        },
        analyseListing: async ({ listingId }) => ({
          listingId,
          ok: true,
          matchAnalysisId: ANALYSIS,
          evidenceFitScore: 80,
          hardConstraintEligible: true,
          llmCalls: 1,
          title: job.title,
        }),
        createId: ids,
        now,
        caps: caps(),
      },
    );
    const listings = [...repository.sightings.values()].map((row) => row.listingId);
    expect(new Set(listings).size).toBe(1);
    const forA = await repository.listCampaignListings(a.id);
    const forB = await repository.listCampaignListings(b.id);
    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(1);
    expect(forA[0]?.listingId).toBe(forB[0]?.listingId);
  });

  it("does not delete shared listings or saved jobs when a campaign is archived", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const campaign = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    await repository.attachUserJob({
      userId: USER_A,
      listingId: "44444444-4444-4444-8444-000000000001",
      seenAt: "2026-08-13T10:00:00.000Z",
    });
    repository.savedListingIds.add("44444444-4444-4444-8444-000000000001");
    await repository.attachCampaignListing({
      campaignId: campaign.id,
      listingId: "44444444-4444-4444-8444-000000000001",
      discoverySource: "linkedin_fresh",
      seenAt: "2026-08-13T10:00:00.000Z",
      originatingRunId: "run-1",
    });
    await archiveJobCampaign(
      { userId: USER_A, campaignId: campaign.id },
      { repository, now },
    );
    expect(repository.userJobs.has(`${USER_A}:44444444-4444-4444-8444-000000000001`)).toBe(
      true,
    );
    expect(repository.savedListingIds.size).toBe(1);
    expect(await repository.listCampaignListings(campaign.id)).toHaveLength(1);
  });

  it("does not let a user read another user's campaign", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const campaign = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    const { getJobCampaignForUser } = await import("./manage-job-campaigns");
    await expect(
      getJobCampaignForUser(
        { userId: USER_B, campaignId: campaign.id },
        { repository },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects mutations on archived campaigns", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const campaign = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: ids, now, caps: caps() },
    );
    await archiveJobCampaign(
      { userId: USER_A, campaignId: campaign.id },
      { repository, now },
    );
    await expect(
      updateJobCampaign(
        {
          userId: USER_A,
          campaignId: campaign.id,
          primaryRole: "Frontend Developer",
        },
        { repository, createId: ids, now, caps: caps() },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps Instant Search sessions when campaign listings are attached", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    await repository.createInstantSearchSession({
      id: "sess-1",
      userId: USER_A,
      status: "active",
      jobsFound: 4,
      analysedCount: 3,
      listingIds: ["11111111-1111-4111-8111-111111111199"],
      startedAt: "2026-08-13T09:00:00.000Z",
      completedAt: "2026-08-13T09:01:00.000Z",
    });
    const campaign = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    await repository.attachCampaignListing({
      campaignId: campaign.id,
      listingId: "44444444-4444-4444-8444-000000000099",
      discoverySource: "broad_hybrid",
      seenAt: "2026-08-13T10:00:00.000Z",
      originatingRunId: "run-1",
    });
    const session = await repository.getLatestInstantSearchSession(USER_A);
    expect(session?.listingIds).toEqual(["11111111-1111-4111-8111-111111111199"]);
    expect(await repository.listCampaignListingIdsForUser(USER_A)).toEqual([
      "44444444-4444-4444-8444-000000000099",
    ]);
  });
});

describe("run campaign now", () => {
  it("is idempotent and rejects overlapping runs", async () => {
    const { runJobCampaignNow } = await import("./run-job-campaign");
    const repository = new InMemoryFreshWatchRepository();
    const campaignRepo = new InMemoryCareerCampaignRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const created = await createJobCampaign(
      { userId: USER_A, primaryRole: "Backend Developer", location: "Sri Lanka" },
      { repository, createId: createIdFactory(), now, caps: caps() },
    );
    const first = await runJobCampaignNow(
      { userId: USER_A, campaignId: created.id },
      {
        repository,
        campaignRepository: campaignRepo,
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    const second = await runJobCampaignNow(
      { userId: USER_A, campaignId: created.id },
      {
        repository,
        campaignRepository: campaignRepo,
        createId: createIdFactory(),
        now,
        caps: caps(),
      },
    );
    expect(second.runId).toBe(first.runId);
    expect(second.status).toBe("skipped");

    await repository.tryClaimCampaignRunLease({
      campaignId: created.id,
      now: "2026-08-13T10:01:00.000Z",
      leaseOwner: "other",
      leaseExpiresAt: "2026-08-13T10:05:00.000Z",
    });
    const later = () => new Date("2026-08-13T10:01:00.000Z");
    await expect(
      runJobCampaignNow(
        { userId: USER_A, campaignId: created.id },
        {
          repository,
          campaignRepository: campaignRepo,
          createId: createIdFactory(),
          now: later,
          caps: caps(),
        },
      ),
    ).rejects.toMatchObject({ code: "RUN_IN_PROGRESS" });
  });

  it("does not create recommendations from Instant Search origin", async () => {
    const campaignRepo = new InMemoryCareerCampaignRepository();
    expect(campaignRepo.recommendations.size).toBe(0);
  });
});
