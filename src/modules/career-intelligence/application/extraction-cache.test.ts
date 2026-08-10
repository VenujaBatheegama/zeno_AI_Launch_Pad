import { describe, expect, it, vi } from "vitest";

import type { DiscoveredJob, JobSearchProfile } from "@/modules/job-discovery/domain/job";
import { emptyJobSearchPreferences } from "@/modules/job-discovery/domain/job";

import { analyseAndMatchBatch, analyseJobRequirements } from "./analyse-and-match";
import {
  FakeEvidenceRepository,
  FakeJobDiscoveryRepository,
  InMemoryCareerIntelligenceRepository,
} from "./fakes";
import { assessCareerStageForUser } from "./assess-career-stage";
import { EXTRACTION_POLICY_VERSION } from "../domain/policy";
import { EXTRACTION_SCHEMA_VERSION } from "../domain/strict-extraction-schema";

const USER = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-09T12:00:00.000Z");

function job(listingId: string, description: string): DiscoveredJob {
  return {
    job_id: "00000000-0000-4000-8000-000000000302",
    listing_id: listingId,
    title: "Software Engineer",
    organization_name: "Acme",
    organization_logo_url: null,
    description,
    location: "Colombo",
    city: "Colombo",
    region: null,
    country: "LK",
    employment_type: "full_time",
    work_mode: "hybrid",
    experience_level: "entry",
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at: null,
    closing_at: null,
    publisher: "Acme",
    source_name: "JSearch",
    source_url: null,
    application_url: "https://example.com/apply",
    application_is_direct: true,
    first_seen_at: NOW.toISOString(),
    last_seen_at: NOW.toISOString(),
    user_state: "discovered",
  };
}

function profile(): JobSearchProfile {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    userId: USER,
    preferences: {
      ...emptyJobSearchPreferences,
      roles: ["Software Engineer"],
      locations: ["Colombo"],
    },
    preferenceRevision: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function verifiedEvidence() {
  return {
    id: "00000000-0000-4000-8000-000000000201",
    userId: USER,
    sourceDocumentId: "00000000-0000-4000-8000-000000000202",
    status: "verified" as const,
    evidence: {
      schema_version: 1 as const,
      profile: {
        full_name: "Ada",
        email: null,
        phone: null,
        location: null,
        summary: null,
        linkedin_url: null,
        github_url: null,
        portfolio_url: null,
      },
      work_experience: [
        {
          id: "00000000-0000-4000-8000-000000000203",
          origin: "extracted" as const,
          employer: "Acme",
          role: "Intern",
          start_date: "2024-01",
          end_date: "2024-06",
          is_current: false,
          location: null,
          bullets: ["Built APIs with Docker"],
          source_quote: "Built APIs with Docker",
        },
      ],
      projects: [],
      education: [],
      skills: [
        {
          id: "00000000-0000-4000-8000-000000000204",
          origin: "extracted" as const,
          name: "Docker",
          category: null,
          source_quote: "Docker",
        },
      ],
      certifications: [],
      achievements: [],
      references: [],
      warnings: [],
    },
    extractionModel: "test",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    verifiedAt: NOW.toISOString(),
  };
}

describe("extraction cache + batch isolation", () => {
  it("assigns fresh requirement ids when the same cached extraction is applied to two listings", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingA = "00000000-0000-4000-8000-000000000351";
    const listingB = "00000000-0000-4000-8000-000000000352";
    const description =
      "We need Docker and TypeScript experience. Build APIs with Node.js for early-career engineers.";
    const extract = vi.fn(async ({ requirementIds }: { requirementIds: string[] }) => ({
      opportunity_band: "early_career" as const,
      opportunity_confidence: "high" as const,
      opportunity_reasons: ["Entry-level wording."],
      requirements: [
        {
          id: requirementIds[0]!,
          statement: "Docker",
          category: "technology" as const,
          importance: "required" as const,
          explicit: true,
          confidence: "high" as const,
          source_quote: "Docker and TypeScript experience",
          quantitative_threshold: null,
        },
      ],
      warnings: [],
    }));
    const deps = {
      jobRepository: new FakeJobDiscoveryRepository(profile(), [
        job(listingA, description),
        {
          ...job(listingB, description),
          job_id: "00000000-0000-4000-8000-000000000305",
        },
      ]),
      repository,
      extractor: { extract },
      createId: sequentialIds(1400),
      now: () => NOW,
    };

    const a = await analyseJobRequirements({ userId: USER, listingId: listingA }, deps);
    const b = await analyseJobRequirements({ userId: USER, listingId: listingB }, deps);

    expect(extract).toHaveBeenCalledTimes(1);
    expect(a.requirements[0]?.id).toBeTruthy();
    expect(b.requirements[0]?.id).toBeTruthy();
    expect(a.requirements[0]?.id).not.toBe(b.requirements[0]?.id);
    expect(a.requirements[0]?.statement).toBe(b.requirements[0]?.statement);
  });

  it("reuses cached extraction with zero provider calls on second analyse", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingId = "00000000-0000-4000-8000-000000000301";
    const description =
      "We need Docker and TypeScript experience. Build APIs with Node.js for early-career engineers.";
    const extract = vi.fn(async ({ requirementIds }: { requirementIds: string[] }) => ({
      opportunity_band: "early_career" as const,
      opportunity_confidence: "high" as const,
      opportunity_reasons: ["Entry-level wording."],
      requirements: [
        {
          id: requirementIds[0]!,
          statement: "Docker",
          category: "technology" as const,
          importance: "required" as const,
          explicit: true,
          confidence: "high" as const,
          source_quote: "Docker and TypeScript experience",
          quantitative_threshold: null,
        },
      ],
      warnings: [],
    }));

    const deps = {
      jobRepository: new FakeJobDiscoveryRepository(profile(), [
        job(listingId, description),
      ]),
      repository,
      extractor: { extract },
      createId: sequentialIds(),
      now: () => NOW,
    };

    await analyseJobRequirements({ userId: USER, listingId }, deps);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(repository.extractions.size).toBe(1);

    await analyseJobRequirements({ userId: USER, listingId }, deps);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("one failed extraction does not block a successful sibling listing", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const okListing = "00000000-0000-4000-8000-000000000311";
    const badListing = "00000000-0000-4000-8000-000000000312";
    const okDesc =
      "We need Docker experience. Build APIs with Node.js. Early-career software engineer role.";
    const badDesc = "Unique failing description about obscure widgets and florb.";

    await assessCareerStageForUser(
      { userId: USER },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        createId: sequentialIds(500),
        now: () => NOW,
      },
    );

    let calls = 0;
    const extract = vi.fn(async ({ description, requirementIds }: { description: string; requirementIds: string[] }) => {
      calls += 1;
      if (description.includes("florb")) {
        throw new Error("Failed to parse tool call arguments as JSON");
      }
      return {
        opportunity_band: "early_career" as const,
        opportunity_confidence: "high" as const,
        opportunity_reasons: ["Entry-level wording."],
        requirements: [
          {
            id: requirementIds[0]!,
            statement: "Docker",
            category: "technology" as const,
            importance: "required" as const,
            explicit: true,
            confidence: "high" as const,
            source_quote: "Docker experience",
            quantitative_threshold: null,
          },
        ],
        warnings: [],
      };
    });

    const results = await analyseAndMatchBatch(
      { userId: USER, listingIds: [okListing, badListing], force: false },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile(), [
          job(okListing, okDesc),
          {
            ...job(badListing, badDesc),
            job_id: "00000000-0000-4000-8000-000000000303",
          },
        ]),
        repository,
        extractor: { extract },
        matcher: { async classify() { return []; } },
        createId: sequentialIds(700),
        now: () => NOW,
        extractionConcurrency: 2,
      },
    );

    expect(calls).toBe(2);
    expect(results.find((item) => item.listingId === okListing)?.match).not.toBeNull();
    expect(results.find((item) => item.listingId === badListing)?.errorCategory).toBeTruthy();
    expect(results.find((item) => item.listingId === badListing)?.match).toBeNull();
  });

  it("negative-caches thin descriptions with zero provider calls", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingId = "00000000-0000-4000-8000-000000000331";
    const extract = vi.fn();
    const analysis = await analyseJobRequirements(
      { userId: USER, listingId },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile(), [
          job(listingId, "short"),
        ]),
        repository,
        extractor: { extract },
        createId: sequentialIds(1100),
        now: () => NOW,
      },
    );
    expect(extract).not.toHaveBeenCalled();
    expect(analysis.status).toBe("not_analysable");
    expect([...repository.extractions.values()][0]?.status).toBe(
      "insufficient_description",
    );
  });

  it("dedupes concurrent extractions for the same description hash", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingA = "00000000-0000-4000-8000-000000000341";
    const listingB = "00000000-0000-4000-8000-000000000342";
    const description =
      "We need Docker and TypeScript. Build APIs with Node.js for early-career engineers.";
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const extract = vi.fn(async ({ requirementIds }: { requirementIds: string[] }) => {
      started += 1;
      await gate;
      return {
        opportunity_band: "early_career" as const,
        opportunity_confidence: "high" as const,
        opportunity_reasons: ["Entry-level wording."],
        requirements: [
          {
            id: requirementIds[0]!,
            statement: "Docker",
            category: "technology" as const,
            importance: "required" as const,
            explicit: true,
            confidence: "high" as const,
            source_quote: "Docker and TypeScript",
            quantitative_threshold: null,
          },
        ],
        warnings: [],
      };
    });
    const deps = {
      jobRepository: new FakeJobDiscoveryRepository(profile(), [
        job(listingA, description),
        {
          ...job(listingB, description),
          job_id: "00000000-0000-4000-8000-000000000304",
        },
      ]),
      repository,
      extractor: { extract },
      createId: sequentialIds(1200),
      now: () => NOW,
    };

    const p1 = analyseJobRequirements({ userId: USER, listingId: listingA }, deps);
    const p2 = analyseJobRequirements({ userId: USER, listingId: listingB }, deps);
    await vi.waitFor(() => expect(started).toBe(1));
    // Second request should join the in-flight promise, not start another call.
    await Promise.resolve();
    expect(started).toBe(1);
    release();
    await Promise.all([p1, p2]);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("stores cache under schema + policy versions", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingId = "00000000-0000-4000-8000-000000000321";
    const description =
      "We need Docker experience. Build APIs with Node.js for early-career engineers.";
    await analyseJobRequirements(
      { userId: USER, listingId },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile(), [
          job(listingId, description),
        ]),
        repository,
        extractor: {
          async extract({ requirementIds }) {
            return {
              opportunity_band: "early_career",
              opportunity_confidence: "high",
              opportunity_reasons: ["Entry-level wording."],
              requirements: [
                {
                  id: requirementIds[0]!,
                  statement: "Docker",
                  category: "technology",
                  importance: "required",
                  explicit: true,
                  confidence: "high",
                  source_quote: "Docker experience",
                  quantitative_threshold: null,
                },
              ],
              warnings: [],
            };
          },
        },
        createId: sequentialIds(900),
        now: () => NOW,
      },
    );
    const cached = [...repository.extractions.values()][0]!;
    expect(cached.schemaVersion).toBe(EXTRACTION_SCHEMA_VERSION);
    expect(cached.extractionPolicyVersion).toBe(EXTRACTION_POLICY_VERSION);
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
