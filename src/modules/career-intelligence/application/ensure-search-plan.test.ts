import { describe, expect, it } from "vitest";

import {
  emptyJobSearchPreferences,
  type JobSearchProfile,
} from "@/modules/job-discovery/domain/job";

import { ensureJobSearchPlan } from "./search-plan";
import {
  FakeEvidenceRepository,
  FakeJobDiscoveryRepository,
  InMemoryCareerIntelligenceRepository,
} from "./fakes";

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
      smart_skill_analyser_enabled: false,
      ...overrides,
    },
    preferenceRevision: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe("ensureJobSearchPlan", () => {
  it("creates a preference-only plan with a lightweight assessment anchor", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const result = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        evidenceRepository: new FakeEvidenceRepository(null),
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    expect(result.regenerated).toBe(true);
    expect(result.plan.smartSkillAnalyserEnabled).toBe(false);
    // Anchor exists so pre-0007 DBs (NOT NULL assessment id) can still save.
    expect(result.plan.careerStageAssessmentId).toBeTruthy();
    expect(repository.assessments[0]?.evidenceFingerprint).toBe(
      "preferences-only",
    );
    expect(result.plan.queries.length).toBeGreaterThan(0);
    expect(result.plan.queries.some((q) => q.queryText.includes("Software"))).toBe(
      true,
    );
  });

  it("keeps preference-only plans null when no evidence repository is available", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const result = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    expect(result.plan.careerStageAssessmentId).toBeNull();
  });

  it("reuses a current plan instead of creating duplicates", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const deps = {
      jobRepository: new FakeJobDiscoveryRepository(profile()),
      repository,
      createId: sequentialIds(),
      now: () => NOW,
    };
    const first = await ensureJobSearchPlan({ userId: USER, queryBudget: 3 }, deps);
    const second = await ensureJobSearchPlan({ userId: USER, queryBudget: 3 }, deps);
    expect(second.regenerated).toBe(false);
    expect(second.plan.id).toBe(first.plan.id);
  });

  it("regenerates when Smart Skill Analyser is toggled", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const jobRepository = new FakeJobDiscoveryRepository(profile());
    const first = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository,
        repository,
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    await jobRepository.saveSearchProfile({
      id: profile().id,
      userId: USER,
      preferences: {
        ...profile().preferences,
        smart_skill_analyser_enabled: true,
      },
      preferenceRevision: 2,
      updatedAt: NOW.toISOString(),
    });

    const second = await ensureJobSearchPlan(
      { userId: USER, queryBudget: 3 },
      {
        jobRepository,
        repository,
        evidenceRepository: new FakeEvidenceRepository(null),
        createId: sequentialIds(50),
        now: () => NOW,
      },
    );

    expect(second.regenerated).toBe(true);
    expect(second.plan.id).not.toBe(first.plan.id);
    expect(second.plan.smartSkillAnalyserEnabled).toBe(true);
    expect(second.softNotice).toMatch(/career information/i);
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
