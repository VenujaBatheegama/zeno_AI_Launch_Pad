import { describe, expect, it } from "vitest";

import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";
import type { NormalizedExternalJob } from "@/modules/job-discovery/domain/job";

import { InMemoryCareerCampaignRepository } from "./fakes";
import { InMemoryFreshWatchRepository } from "./fresh-watch-fakes";
import type { FreshWatchCaps } from "./fresh-watch-ports";
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

  it("keeps one primary fresh role per user and moves membership on change", async () => {
    const repository = new InMemoryFreshWatchRepository();
    const now = () => new Date("2026-08-13T10:00:00.000Z");
    const ids = createIdFactory();
    const first = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Backend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    const second = await enableFreshJobWatch(
      {
        userId: USER_A,
        primaryRole: "Frontend Developer",
        location: "Sri Lanka",
        workMode: "remote",
      },
      { repository, createId: ids, now, caps: caps() },
    );
    expect(second.id).toBe(first.id);
    expect(second.primaryRole).toBe("Frontend Developer");
    expect(repository.watches.size).toBe(1);
    expect(await repository.countActiveMembers(first.canonicalSearchId)).toBe(0);
    expect(await repository.countActiveMembers(second.canonicalSearchId)).toBe(1);
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
    await repository.updateWatch(watch.id, {
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
});
