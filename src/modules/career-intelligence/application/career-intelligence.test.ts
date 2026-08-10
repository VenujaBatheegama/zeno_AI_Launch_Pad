import { describe, expect, it } from "vitest";

import type { CareerEvidenceSet } from "@/modules/career-evidence/domain/evidence";
import {
  emptyJobSearchPreferences,
  type DiscoveredJob,
  type JobSearchProfile,
  type NormalizedExternalJob,
} from "@/modules/job-discovery/domain/job";

import { assessCareerStageForUser } from "./assess-career-stage";
import { analyseAndMatchJob } from "./analyse-and-match";
import {
  FakeEscoOccupationResolver,
  FakeEvidenceRepository,
  FakeExtractor,
  FakeJobDiscoveryRepository,
  FakeJobSource,
  FakeMatcher,
  InMemoryCareerIntelligenceRepository,
} from "./fakes";
import {
  createCareerAwareSearchPlan,
  executeCareerAwareJobSearch,
} from "./search-plan";
import { listRankedJobMatches } from "./list-matches";
import { CareerIntelligenceError } from "../domain/errors";

const USER = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-07T12:00:00.000Z");

describe("career intelligence application", () => {
  it("blocks career-stage assessment without verified evidence", async () => {
    await expect(
      assessCareerStageForUser(
        { userId: USER },
        {
          evidenceRepository: new FakeEvidenceRepository(null),
          jobRepository: new FakeJobDiscoveryRepository(null),
          repository: new InMemoryCareerIntelligenceRepository(),
          createId: () => "00000000-0000-4000-8000-000000000010",
          now: () => NOW,
        },
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
  });

  it("creates a bounded multi-query search plan from one role preference", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const assessment = await assessCareerStageForUser(
      { userId: USER },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    const plan = await createCareerAwareSearchPlan(
      { userId: USER, assessmentId: assessment.id, queryBudget: 4 },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        escoResolver: new FakeEscoOccupationResolver(async (role) => ({
          originalRole: role,
          preferredTitle: "software developer",
          searchTitles: [role, "software developer", "application developer", "web developer"],
          status: "resolved",
        })),
        createId: sequentialIds(100),
        now: () => NOW,
      },
    );

    expect(plan.queries.length).toBeGreaterThan(1);
    expect(plan.queries.length).toBeLessThanOrEqual(4);
    expect(plan.queries.map((item) => item.queryText)).toEqual(
      expect.arrayContaining(["Software Engineer"]),
    );
  });

  it("returns partial success when one query fails", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    await assessCareerStageForUser(
      { userId: USER },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        createId: sequentialIds(),
        now: () => NOW,
      },
    );
    const plan = await createCareerAwareSearchPlan(
      { userId: USER, queryBudget: 2 },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile()),
        repository,
        escoResolver: new FakeEscoOccupationResolver(async (role) => ({
          originalRole: role,
          searchTitles: [role, "software developer"],
          status: "resolved",
        })),
        createId: sequentialIds(50),
        now: () => NOW,
      },
    );

    const jobRepository = new FakeJobDiscoveryRepository(profile());
    const result = await executeCareerAwareJobSearch(
      { userId: USER, planId: plan.id },
      {
        jobRepository,
        source: new FakeJobSource([
          { jobs: [externalJob("Job A")] },
          { jobs: [], fail: true },
        ]),
        repository,
        now: () => NOW,
      },
    );

    expect(result.partialFailure).toBe(true);
    expect(result.jobsFound).toBeGreaterThan(0);
    expect(result.plan.status).toBe("partial");
  });

  it("auto-assesses career stage during analyse when none exists", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingId = "00000000-0000-4000-8000-000000000311";
    const jobId = "00000000-0000-4000-8000-000000000312";
    const job: DiscoveredJob = {
      job_id: jobId,
      listing_id: listingId,
      title: "Associate Software Engineer",
      organization_name: "Acme",
      organization_logo_url: null,
      description:
        "We need Docker and Terraform experience. Communication skills preferred. Build APIs with Node.js and collaborate with the team on delivery. Ideal for early-career engineers with internship experience.",
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

    expect(repository.assessments).toHaveLength(0);

    const { match } = await analyseAndMatchJob(
      { userId: USER, listingId },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile(), [job]),
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
                  source_quote: "Docker and Terraform experience",
                  quantitative_threshold: null,
                },
              ],
              warnings: [],
            };
          },
        },
        matcher: {
          async classify() {
            return [];
          },
        },
        createId: sequentialIds(400),
        now: () => NOW,
      },
    );

    expect(repository.assessments.length).toBeGreaterThan(0);
    expect(repository.assessments[0]?.evidenceFingerprint).not.toBe(
      "preferences-only",
    );
    expect(match).not.toBeNull();
    expect(match?.careerStageAssessmentId).toBe(repository.assessments[0]?.id);
  });

  it("computes deterministic evidence-fit and keeps career level separate", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingId = "00000000-0000-4000-8000-000000000301";
    const jobId = "00000000-0000-4000-8000-000000000302";
    const job: DiscoveredJob = {
      job_id: jobId,
      listing_id: listingId,
      title: "Associate Software Engineer",
      organization_name: "Acme",
      organization_logo_url: null,
      description:
        "We need Docker and Terraform experience. Communication skills preferred. Build APIs with Node.js and collaborate with the team on delivery. Ideal for early-career engineers with internship experience.",
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

    await assessCareerStageForUser(
      { userId: USER },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile(), [job]),
        repository,
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    const { match, analysis } = await analyseAndMatchJob(
      { userId: USER, listingId },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile(), [job]),
        repository,
        extractor: {
          async extract({ requirementIds }) {
            return {
              opportunity_band: "early_career",
              opportunity_confidence: "high",
              opportunity_reasons: [
                "Entry-level wording and internship-friendly scope.",
              ],
              requirements: [
                {
                  id: requirementIds[0]!,
                  statement: "Docker",
                  category: "technology",
                  importance: "required",
                  explicit: true,
                  confidence: "high",
                  source_quote: "Docker and Terraform experience",
                  quantitative_threshold: null,
                },
                {
                  id: requirementIds[1]!,
                  statement: "Terraform",
                  category: "technology",
                  importance: "required",
                  explicit: true,
                  confidence: "high",
                  source_quote: "Docker and Terraform experience",
                  quantitative_threshold: null,
                },
                {
                  id: requirementIds[2]!,
                  statement: "Communication",
                  category: "soft_skill",
                  importance: "preferred",
                  explicit: true,
                  confidence: "medium",
                  source_quote: "Communication skills preferred",
                  quantitative_threshold: null,
                },
              ],
              warnings: [],
            };
          },
        },
        matcher: {
          async classify({ unclassifiedRequirementIds }) {
            return unclassifiedRequirementIds.map((requirementId) => ({
              requirement_id: requirementId,
              status: "unknown" as const,
              evidence_ids: [],
              reason: "Soft skill not clearly evidenced.",
              confidence: "low" as const,
              classifier: "ai_assisted" as const,
            }));
          },
        },
        createId: sequentialIds(200),
        now: () => NOW,
      },
    );

    expect(match).not.toBeNull();
    // Docker mentioned in verified internship bullets = matched (3),
    // Terraform gap (0), Communication unknown (0) => round(100 * 3 / 7) = 43
    expect(match?.evidenceFitScore).toBe(43);
    expect(match?.careerLevel).toBe("aligned");
    expect(match?.scoreBreakdown.policy_version).toBe("scoring-v2");
    const dockerId = analysis.requirements.find(
      (item) => item.statement === "Docker",
    )?.id;
    const terraformId = analysis.requirements.find(
      (item) => item.statement === "Terraform",
    )?.id;
    expect(
      match?.matches.find((item) => item.requirement_id === dockerId)?.status,
    ).toBe("matched");
    expect(
      match?.matches.find((item) => item.requirement_id === terraformId)?.status,
    ).toBe("gap");

    const ranked = await listRankedJobMatches(
      { userId: USER },
      {
        jobRepository: new FakeJobDiscoveryRepository(profile(), [job]),
        repository,
      },
    );
    expect(ranked[0]?.evidenceFitScore).toBe(43);
    expect(ranked[0]?.careerLevel).toBe("aligned");
  });

  it("marks unusable descriptions as not analysable", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const listingId = "00000000-0000-4000-8000-000000000501";
    const job: DiscoveredJob = {
      ...minimalJob(listingId),
      description: "Short",
    };
    await assessCareerStageForUser(
      { userId: USER },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile(), [job]),
        repository,
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    const { analysis, match } = await analyseAndMatchJob(
      { userId: USER, listingId },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository(profile(), [job]),
        repository,
        extractor: new FakeExtractor({
          opportunity_band: "unknown",
          opportunity_confidence: "low",
          opportunity_reasons: [],
          requirements: [],
          warnings: [],
        }),
        matcher: new FakeMatcher(),
        createId: sequentialIds(300),
        now: () => NOW,
      },
    );

    expect(analysis.status).toBe("not_analysable");
    expect(match).toBeNull();
  });

  it("keeps internships eligible when explicitly preferred", async () => {
    const repository = new InMemoryCareerIntelligenceRepository();
    const assessment = await assessCareerStageForUser(
      { userId: USER },
      {
        evidenceRepository: new FakeEvidenceRepository(verifiedEvidence()),
        jobRepository: new FakeJobDiscoveryRepository({
          ...profile(),
          preferences: {
            ...emptyJobSearchPreferences,
            roles: ["Software Engineer Intern"],
            employment_types: ["internship"],
          },
        }),
        repository,
        createId: sequentialIds(),
        now: () => NOW,
      },
    );

    expect(assessment.targetOpportunityBands).toContain("internship_ready");
    expect(assessment.preferenceOverrides[0]?.kind).toBe(
      "explicit_internship_preference",
    );
  });

  it("rejects draft evidence for assessment", async () => {
    const draft = verifiedEvidence();
    draft.status = "draft";
    draft.verifiedAt = null;
    await expect(
      assessCareerStageForUser(
        { userId: USER },
        {
          evidenceRepository: new FakeEvidenceRepository(draft),
          jobRepository: new FakeJobDiscoveryRepository(profile()),
          repository: new InMemoryCareerIntelligenceRepository(),
          createId: sequentialIds(),
          now: () => NOW,
        },
      ),
    ).rejects.toBeInstanceOf(CareerIntelligenceError);
  });
});

function profile(): JobSearchProfile {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    userId: USER,
    preferences: {
      ...emptyJobSearchPreferences,
      roles: ["Software Engineer"],
      locations: ["Colombo"],
      excluded_keywords: ["senior"],
    },
    preferenceRevision: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function verifiedEvidence(): CareerEvidenceSet {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    userId: USER,
    sourceDocumentId: "00000000-0000-4000-8000-000000000004",
    status: "verified",
    extractionModel: "test",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    verifiedAt: NOW.toISOString(),
    evidence: {
      schema_version: 1,
      profile: {
        full_name: "Ada",
        email: null,
        phone: null,
        location: null,
        summary: null,
      },
      work_experience: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          origin: "extracted",
          source_quote: "Software Developer Intern",
          employer: "Acme",
          role: "Software Developer Intern",
          location: null,
          start_date: "2025-01",
          end_date: "2025-08",
          is_current: false,
          bullets: ["Built APIs with Docker"],
        },
      ],
      education: [
        {
          id: "00000000-0000-4000-8000-000000000202",
          origin: "extracted",
          source_quote: "BSc Computer Science",
          institution: "IIT",
          qualification: "BSc",
          field_of_study: "Computer Science",
          start_date: "2024-01",
          end_date: null,
        },
      ],
      skills: [
        {
          id: "00000000-0000-4000-8000-000000000203",
          origin: "extracted",
          source_quote: "Docker",
          name: "Docker",
        },
      ],
      projects: [
        {
          id: "00000000-0000-4000-8000-000000000204",
          origin: "extracted",
          source_quote: "Campus project",
          name: "Campus Deploy",
          role: "Developer",
          start_date: "2024-06",
          end_date: "2024-09",
          bullets: ["Deployed on AWS"],
          technologies: ["AWS", "Docker"],
        },
      ],
      certifications: [],
      achievements: [],
      references: [],
      warnings: [],
    },
  };
}

function externalJob(title: string): NormalizedExternalJob {
  return {
    external_id: title,
    title,
    organization: { name: "Acme", logo_url: null, website_url: null },
    description:
      "A detailed software engineering role description with enough text to analyse later if needed for matching workflows and career intelligence.",
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
    source_url: null,
    application_url: "https://example.com/apply",
    application_is_direct: true,
    raw_payload: {},
  };
}

function minimalJob(listingId: string): DiscoveredJob {
  return {
    job_id: "00000000-0000-4000-8000-000000000601",
    listing_id: listingId,
    title: "Software Engineer",
    organization_name: "Acme",
    organization_logo_url: null,
    description: null,
    location: null,
    city: null,
    region: null,
    country: null,
    employment_type: null,
    work_mode: null,
    experience_level: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at: null,
    closing_at: null,
    publisher: null,
    source_name: "JSearch",
    source_url: null,
    application_url: null,
    application_is_direct: null,
    first_seen_at: NOW.toISOString(),
    last_seen_at: NOW.toISOString(),
    user_state: "discovered",
  };
}

function sequentialIds(start = 1) {
  let n = start;
  return () => {
    const value = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    n += 1;
    return value;
  };
}
