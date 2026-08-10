import { describe, expect, it } from "vitest";

import {
  emptyJobSearchPreferences,
  type JobSearchProfile,
} from "@/modules/job-discovery/domain/job";

import { ensureJobSearchPlan } from "./search-plan";
import {
  FakeEscoOccupationResolver,
  FakeEvidenceRepository,
  FakeJobDiscoveryRepository,
  InMemoryCareerIntelligenceRepository,
} from "./fakes";
import { escoPolicyFingerprint } from "../domain/policy";

const USER = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-09T12:00:00.000Z");

function profile(overrides?: Partial<JobSearchProfile["preferences"]>): JobSearchProfile {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    userId: USER,
    preferences: {
      ...emptyJobSearchPreferences,
      roles: ["Software Engineer"],
      locations: ["Colombo"],
      ...overrides,
    },
    preferenceRevision: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe("ensureJobSearchPlan", () => {
  it("creates a preference + ESCO plan with exact role first", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const result = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        evidenceRepository: new FakeEvidenceRepository(null),
        escoResolver: new FakeEscoOccupationResolver(async (role) => ({
          originalRole: role,
          occupationId: "http://data.europa.eu/esco/occupation/example",
          preferredTitle: "software developer",
          searchTitles: [role, "software developer", "application developer"],
          status: "resolved",
        })),
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    expect(result.regenerated).toBe(true);
    expect(result.plan.evidenceFingerprint).toBe(escoPolicyFingerprint());
    expect(result.plan.careerStageAssessmentId).toBeTruthy();
    expect(result.plan.queries[0]?.queryText).toBe("Software Engineer");
    expect(result.plan.queries[0]?.source).toBe("exact_role");
    expect(result.alsoSearchFor.length).toBeGreaterThan(0);
    expect(result.plan.queries.every((q) =>
      ["exact_role", "esco_preferred", "esco_alternative"].includes(q.source),
    )).toBe(true);
  });

  it("falls back to exact role when ESCO is unresolved", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const result = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        createId: sequentialIds(),
        escoResolver: new FakeEscoOccupationResolver(),
        now: () => NOW,
      },
    );

    expect(result.plan.queries).toHaveLength(1);
    expect(result.plan.queries[0]?.source).toBe("exact_role");
    expect(result.softNotice).toMatch(/exact title only/i);
  });

  it("reuses a current plan instead of creating duplicates", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const deps = {
      jobRepository: new FakeJobDiscoveryRepository(profile()),
      repository,
      escoResolver: new FakeEscoOccupationResolver(),
      createId: sequentialIds(),
      now: () => NOW,
    };
    const first = await ensureJobSearchPlan({ userId: USER, queryBudget: 3 }, deps);
    const second = await ensureJobSearchPlan({ userId: USER, queryBudget: 3 }, deps);
    expect(second.regenerated).toBe(false);
    expect(second.plan.id).toBe(first.plan.id);
  });

  it("regenerates when preference revision changes", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const jobRepository = new FakeJobDiscoveryRepository(profile());
    const first = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository,
        repository,
        escoResolver: new FakeEscoOccupationResolver(),
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    await jobRepository.saveSearchProfile({
      id: profile().id,
      userId: USER,
      preferences: {
        ...profile().preferences,
        roles: ["Backend Developer"],
      },
      preferenceRevision: 2,
      updatedAt: NOW.toISOString(),
    });

    const second = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository,
        repository,
        escoResolver: new FakeEscoOccupationResolver(),
        createId: sequentialIds(50),
        now: () => NOW,
      },
    );

    expect(second.regenerated).toBe(true);
    expect(second.plan.id).not.toBe(first.plan.id);
    expect(second.plan.queries[0]?.queryText).toBe("Backend Developer");
  });

  it("rejects older plan writes after a newer preference revision", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const newer = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 2, force: true },
      {
        jobRepository: new FakeJobDiscoveryRepository({
          ...profile(),
          preferenceRevision: 5,
        }),
        repository,
        escoResolver: new FakeEscoOccupationResolver(),
        createId: sequentialIds(10),
        now: () => NOW,
      },
    );

    const rejected = await repository.saveSearchPlan({
      plan: {
        ...newer.plan,
        id: "00000000-0000-4000-8000-000000000099",
        preferenceRevision: 1,
        planRevision: 1,
        profileRevision: 0,
      },
      queries: newer.plan.queries.map((query) => ({
        ...query,
        id: "00000000-0000-4000-8000-000000000098",
      })),
    });

    expect(rejected.id).toBe(newer.plan.id);
  });
});

function sequentialIds(start = 1) {
  let current = start;
  return () => {
    const value = current;
    current += 1;
    return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  };
}
