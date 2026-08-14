import { describe, expect, it } from "vitest";

import type { CareerEvidence, CareerEvidenceSet } from "@/modules/career-evidence/domain/evidence";
import type { JobSearchCampaign } from "@/modules/career-campaign/domain/job-campaign";

import { requestGrowthAssessment } from "./request-assessment";
import { processGrowthAssessment } from "./process-assessment";
import {
  dismissGrowthRecommendation,
  getGrowthRecommendation,
  sendGrowthChatMessage,
} from "./recommendations";
import {
  acceptGrowthRecommendation,
  exportGrowthProjectCalendar,
  updateGrowthMilestone,
} from "./projects";
import { listGrowthInboxItems, mergeInboxItems, toJobInboxItem } from "./inbox";
import {
  DEFAULT_GROWTH_CAPS,
  FakeCampaignReader,
  FakeEvidenceReader,
  FakeGrowthAdvisor,
  FakeMarketReader,
  FakeNotifier,
  InMemoryCareerGrowthRepository,
} from "./fakes";
import { CareerGrowthError } from "../domain/errors";
import type { JobRecommendation } from "@/modules/career-campaign/domain/schemas";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "11111111-1111-4111-8111-111111111112";
const CAMPAIGN = "00000000-0000-4000-8000-000000000010";
const CAMPAIGN_B = "00000000-0000-4000-8000-000000000011";

function createIdFactory() {
  let n = 100;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  };
}

function campaign(overrides: Partial<JobSearchCampaign> = {}): JobSearchCampaign {
  return {
    id: CAMPAIGN,
    userId: USER,
    name: "Backend Engineer — Remote",
    status: "active",
    primaryRole: "Backend Engineer",
    location: "Remote",
    workMode: "remote",
    employmentTypes: [],
    experienceLevels: [],
    minimumScore: 55,
    preferredTechnologies: [],
    targetReadyDate: null,
    weeklyHoursAvailable: 5,
    criteriaVersion: 1,
    canonicalSearchId: "00000000-0000-4000-8000-000000000099",
    lastLinkedInSearchAt: null,
    nextLinkedInSearchAt: null,
    lastBroadSearchAt: null,
    nextBroadSearchAt: null,
    lastDiscoveryAt: null,
    lastError: null,
    initialAlertsRemaining: 3,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function item<T extends Record<string, unknown>>(id: string, extra: T) {
  return {
    id,
    origin: "extracted" as const,
    source_quote: "cv",
    ...extra,
  };
}

function evidenceSet(overrides: Partial<CareerEvidence> = {}): CareerEvidenceSet {
  const evidence: CareerEvidence = {
    schema_version: 1,
    profile: {
      full_name: "Ada",
      email: null,
      phone: null,
      location: null,
      summary: null,
    },
    work_experience: [],
    education: [],
    skills: [
      item("00000000-0000-4000-8000-000000000021", { name: "Java" }),
    ],
    projects: [
      item("00000000-0000-4000-8000-000000000022", {
        name: "Campus library",
        role: "Developer",
        start_date: "2024",
        end_date: "2024",
        bullets: ["Built a coursework CRUD application"],
        technologies: ["Java"],
      }),
    ],
    certifications: [],
    achievements: [],
    references: [],
    warnings: [],
    ...overrides,
  };
  return {
    id: "00000000-0000-4000-8000-000000000020",
    userId: USER,
    sourceDocumentId: "00000000-0000-4000-8000-000000000019",
    status: "verified",
    evidence,
    extractionModel: "test",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    verifiedAt: "2026-08-01T00:00:00.000Z",
  };
}

function analysedJobs(count: number, statement = "Spring Boot") {
  return Array.from({ length: count }, (_, index) => ({
    listingId: `00000000-0000-4000-8000-${String(index + 40).padStart(12, "0")}`,
    analysisStatus: "ready" as const,
    evidenceFitScore: 72,
    requirements: [
      {
        id: `req-${index}`,
        statement,
        category: "technology" as const,
        importance: "required" as const,
        explicit: true,
        confidence: "high" as const,
        source_quote: statement,
        quantitative_threshold: null,
      },
    ],
    matches: [
      {
        requirement_id: `req-${index}`,
        status: "gap" as const,
        evidence_ids: [],
        reason: "Not demonstrated",
        confidence: "high" as const,
        classifier: "deterministic" as const,
      },
    ],
  }));
}

function setup(overrides?: {
  campaign?: JobSearchCampaign;
  evidence?: CareerEvidenceSet | null;
  jobs?: ReturnType<typeof analysedJobs>;
  advisor?: FakeGrowthAdvisor;
}) {
  const repository = new InMemoryCareerGrowthRepository();
  const campaigns = new FakeCampaignReader();
  campaigns.campaigns.set(CAMPAIGN, overrides?.campaign ?? campaign());
  const evidence = new FakeEvidenceReader();
  evidence.current = overrides?.evidence === undefined ? evidenceSet() : overrides.evidence;
  const market = new FakeMarketReader();
  market.jobs = overrides?.jobs ?? [];
  const advisor = overrides?.advisor ?? new FakeGrowthAdvisor();
  const notifier = new FakeNotifier();
  const createId = createIdFactory();
  const now = () => new Date("2026-08-13T12:00:00.000Z");
  const deps = {
    repository,
    campaigns,
    evidence,
    market,
    advisor,
    notifier,
    caps: DEFAULT_GROWTH_CAPS,
    createId,
    now,
    log: () => undefined,
  };
  return { ...deps, USER };
}

async function runPreliminary(deps: ReturnType<typeof setup>, campaignId = CAMPAIGN) {
  const request = await requestGrowthAssessment(
    { userId: USER, campaignId, mode: "preliminary" },
    deps,
  );
  return processGrowthAssessment({ requestId: request.id, owner: "test" }, deps);
}

describe("growth assessment workflow", () => {
  it("does not create a second pending recommendation for the same campaign", async () => {
    const deps = setup();
    const first = await runPreliminary(deps);
    const second = await runPreliminary(deps);
    const pending = await deps.repository.listRecommendations({
      userId: USER,
      campaignId: CAMPAIGN,
      statuses: ["pending", "opened"],
    });
    expect(pending).toHaveLength(1);
    expect(first.recommendation?.id).toBe(pending[0]?.id);
    expect(second.recommendation?.id).toBe(pending[0]?.id);
  });

  it("does not call the model again for an unchanged fingerprint", async () => {
    const advisor = new FakeGrowthAdvisor();
    const deps = setup({ advisor });
    await runPreliminary(deps);
    const assessmentCalls = advisor.calls.assessment;
    const recCalls = advisor.calls.recommendation;
    await runPreliminary(deps);
    expect(advisor.calls.assessment).toBe(assessmentCalls);
    expect(advisor.calls.recommendation).toBe(recCalls);
    expect(advisor.calls.assessment).toBeGreaterThan(0);
  });

  it("skips market refinement below the configured job threshold", async () => {
    const deps = setup({ jobs: analysedJobs(3) });
    const request = await requestGrowthAssessment(
      { userId: USER, campaignId: CAMPAIGN, mode: "market_refined" },
      deps,
    );
    const result = await processGrowthAssessment({ requestId: request.id }, deps);
    expect(result.recommendation).toBeNull();
    expect(result.requestStatus).toBe("completed");
    expect(deps.advisor.calls.assessment).toBe(0);
  });

  it("uses aggregated stored requirements for a market-refined assessment", async () => {
    const deps = setup({
      campaign: campaign({ preferredTechnologies: ["Java", "Spring Boot"] }),
      jobs: analysedJobs(8, "Spring Boot"),
    });
    const request = await requestGrowthAssessment(
      { userId: USER, campaignId: CAMPAIGN, mode: "market_refined" },
      deps,
    );
    const result = await processGrowthAssessment({ requestId: request.id }, deps);
    expect(result.assessment?.mode).toBe("market_refined");
    expect(result.assessment?.marketSampleSize).toBe(8);
    expect(result.recommendation?.marketEvidenceSummary).toMatch(/Spring Boot/);
  });

  it("lets existing active projects shape the new recommendation", async () => {
    const deps = setup({
      campaign: campaign({ preferredTechnologies: ["Spring Boot"] }),
    });
    await deps.repository.insertProject({
      id: "00000000-0000-4000-8000-000000000070",
      userId: USER,
      sourceRecommendationId: "00000000-0000-4000-8000-000000000071",
      title: "API deployment with monitoring",
      objective: "Deploy a Spring Boot API",
      status: "in_progress",
      startDate: "2026-08-01",
      targetDate: "2026-08-22",
      estimatedHoursPerWeek: 5,
      progress: 40,
      expectedEvidence: ["Deployed API"],
      supportingCampaignIds: [CAMPAIGN_B],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      completedAt: null,
    });
    const result = await runPreliminary(deps);
    expect(result.recommendation?.type).toBe("extend_existing_project");
    expect(result.recommendation?.rationale).toMatch(/API deployment/i);
  });

  it("recommends a smaller action when weekly capacity is already used", async () => {
    const deps = setup({
      campaign: campaign({ weeklyHoursAvailable: 2 }),
    });
    await deps.repository.insertProject({
      id: "00000000-0000-4000-8000-000000000072",
      userId: USER,
      sourceRecommendationId: "00000000-0000-4000-8000-000000000073",
      title: "Unrelated portfolio rewrite",
      objective: "Rewrite a marketing site",
      status: "in_progress",
      startDate: "2026-08-01",
      targetDate: "2026-09-01",
      estimatedHoursPerWeek: 8,
      progress: 10,
      expectedEvidence: ["Live site"],
      supportingCampaignIds: [CAMPAIGN_B],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      completedAt: null,
    });
    const result = await runPreliminary(deps);
    expect(result.recommendation?.type).toBe("document_existing_work");
    expect(result.recommendation?.estimatedWeeks).toBe(1);
  });

  it("dismisses a recommendation, suppresses inbox replay, and blocks regeneration", async () => {
    const deps = setup();
    const created = await runPreliminary(deps);
    const id = created.recommendation!.id;
    await dismissGrowthRecommendation(
      { userId: USER, recommendationId: id },
      deps,
    );
    await expect(
      getGrowthRecommendation({ userId: USER, recommendationId: id }, deps),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(deps.notifier.suppressed).toContain(id);
    const again = await runPreliminary(deps);
    expect(again.recommendation).toBeNull();
    expect(await deps.repository.listSuppressions({ userId: USER, campaignId: CAMPAIGN })).toHaveLength(1);
  });

  it("allows a new recommendation after the campaign criteria change", async () => {
    const deps = setup();
    const created = await runPreliminary(deps);
    await dismissGrowthRecommendation(
      { userId: USER, recommendationId: created.recommendation!.id },
      deps,
    );
    deps.campaigns.campaigns.set(
      CAMPAIGN,
      campaign({
        preferredTechnologies: ["Go", "Kubernetes"],
        criteriaVersion: 2,
        primaryRole: "Platform Engineer",
        name: "Platform Engineer — Remote",
      }),
    );
    const again = await runPreliminary(deps);
    expect(again.recommendation).not.toBeNull();
    expect(again.recommendation?.id).not.toBe(created.recommendation?.id);
  });

  it("accepts a recommendation once and stays idempotent on repeat", async () => {
    const deps = setup();
    const created = await runPreliminary(deps);
    const first = await acceptGrowthRecommendation(
      {
        userId: USER,
        recommendationId: created.recommendation!.id,
        startDate: "2026-08-14",
        targetDate: "2026-09-04",
        weeklyHours: 5,
      },
      deps,
    );
    const second = await acceptGrowthRecommendation(
      {
        userId: USER,
        recommendationId: created.recommendation!.id,
        startDate: "2026-08-14",
        targetDate: "2026-09-04",
        weeklyHours: 5,
      },
      deps,
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    const projects = await deps.repository.listProjects({ userId: USER });
    expect(projects).toHaveLength(1);
    expect(first.milestones?.length).toBeGreaterThan(1);
  });

  it("updates progress when a milestone is completed", async () => {
    const deps = setup();
    const created = await runPreliminary(deps);
    const accepted = await acceptGrowthRecommendation(
      {
        userId: USER,
        recommendationId: created.recommendation!.id,
        startDate: "2026-08-14",
        targetDate: "2026-09-04",
        weeklyHours: 5,
      },
      deps,
    );
    const firstMilestone = accepted.milestones![0]!;
    const updated = await updateGrowthMilestone(
      { userId: USER, milestoneId: firstMilestone.id, status: "completed" },
      deps,
    );
    expect(updated.progress).toBeGreaterThan(0);
    const project = await deps.repository.getProject(accepted.project.id);
    expect(project?.progress).toBe(updated.progress);
  });

  it("retries malformed model output once and then falls back", async () => {
    const advisor = new FakeGrowthAdvisor();
    advisor.failAssessment = "once-malformed";
    const deps = setup({ advisor });
    const result = await runPreliminary(deps);
    expect(result.recommendation).not.toBeNull();
    expect(advisor.calls.assessment).toBeGreaterThanOrEqual(2);
  });

  it("leaves a cooldown as retryable without failing campaign creation", async () => {
    const advisor = new FakeGrowthAdvisor();
    advisor.failAssessment = "cooldown";
    const deps = setup({ advisor });
    const request = await requestGrowthAssessment(
      { userId: USER, campaignId: CAMPAIGN, mode: "preliminary" },
      deps,
    );
    expect(request.status).toBe("pending");
    const result = await processGrowthAssessment({ requestId: request.id }, deps);
    expect(result.requestStatus).toBe("failed_retryable");
    expect(result.retryAfter).toBeTruthy();
  });

  it("does not let the model invent unsupported experience", async () => {
    const advisor = new FakeGrowthAdvisor();
    advisor.generateRecommendation = async () => ({
      type: "new_project",
      gapKey: "production_readiness",
      title: "Scale a Kubernetes platform you already run",
      summary: "You already demonstrate Kubernetes in production. Add another cluster.",
      rationale: "You have Kubernetes experience.",
      evidenceGap: "Need more clusters.",
      expectedEvidence: ["Cluster"],
      estimatedWeeks: 3,
      estimatedHoursPerWeek: 5,
      proposedMilestones: [
        { title: "Plan", description: "Plan the work", estimatedHours: 4 },
        { title: "Build", description: "Build the work", estimatedHours: 8 },
      ],
      supportingCampaignIds: [CAMPAIGN],
      marketEvidenceSummary: null,
    });
    const deps = setup({ advisor });
    const result = await runPreliminary(deps);
    expect(result.recommendation?.title).not.toMatch(/Kubernetes platform you already run/i);
  });

  it("presents job and growth items together in the inbox", async () => {
    const deps = setup();
    await runPreliminary(deps);
    const growth = await listGrowthInboxItems({ userId: USER }, deps);
    const job = toJobInboxItem({
      id: "00000000-0000-4000-8000-000000000080",
      userId: USER,
      listingId: "00000000-0000-4000-8000-000000000081",
      jobId: "00000000-0000-4000-8000-000000000082",
      matchAnalysisId: "00000000-0000-4000-8000-000000000083",
      campaignRunId: null,
      status: "pending_review",
      scoreSnapshot: { evidenceFitScore: 80, careerLevel: "aligned" },
      fitSummarySnapshot: {
        title: "Backend Engineer",
        organizationName: "Acme",
        location: "Remote",
        workMode: "remote",
        explanation: "Strong evidence fit.",
        topMatched: ["Java"],
        primaryGaps: [],
      },
      createdAt: "2026-08-13T11:00:00.000Z",
      updatedAt: "2026-08-13T11:00:00.000Z",
    } as unknown as JobRecommendation);
    const inbox = mergeInboxItems({ jobs: [job], growth });
    expect(inbox.some((item) => item.kind === "growth")).toBe(true);
    expect(inbox.some((item) => item.kind === "job")).toBe(true);
  });

  it("blocks access to another user's recommendation and project", async () => {
    const deps = setup();
    const created = await runPreliminary(deps);
    await expect(
      getGrowthRecommendation(
        { userId: OTHER, recommendationId: created.recommendation!.id },
        deps,
      ),
    ).rejects.toBeInstanceOf(CareerGrowthError);
    const accepted = await acceptGrowthRecommendation(
      {
        userId: USER,
        recommendationId: created.recommendation!.id,
        startDate: "2026-08-14",
        targetDate: "2026-09-04",
        weeklyHours: 5,
      },
      deps,
    );
    await expect(
      exportGrowthProjectCalendar(
        { userId: OTHER, projectId: accepted.project.id },
        deps,
      ),
    ).rejects.toBeInstanceOf(CareerGrowthError);
  });

  it("blocks another user from processing an assessment request", async () => {
    const deps = setup();
    const request = await requestGrowthAssessment(
      { userId: USER, campaignId: CAMPAIGN, mode: "preliminary" },
      deps,
    );
    await expect(
      processGrowthAssessment(
        { requestId: request.id, owner: "other", userId: OTHER },
        deps,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exports a valid ICS calendar for an accepted project", async () => {
    const deps = setup();
    const created = await runPreliminary(deps);
    const accepted = await acceptGrowthRecommendation(
      {
        userId: USER,
        recommendationId: created.recommendation!.id,
        startDate: "2026-08-14",
        targetDate: "2026-09-04",
        weeklyHours: 5,
      },
      deps,
    );
    const exported = await exportGrowthProjectCalendar(
      { userId: USER, projectId: accepted.project.id },
      deps,
    );
    expect(exported.filename).toMatch(/\.ics$/);
    expect(exported.ics).toContain("BEGIN:VCALENDAR");
    expect(exported.ics).toContain("BEGIN:VEVENT");
    expect(exported.ics).toContain(accepted.project.title.split(" ")[0]!);
  });

  it("returns a structured revision from chat without silently mutating project state", async () => {
    const advisor = new FakeGrowthAdvisor();
    advisor.chatRevision = {
      type: "new_project",
      gapKey: "production_readiness",
      title: "Two-week order API",
      summary: "Build a smaller two-week order processing API with tests and a deploy note.",
      rationale: "The user asked to shorten the plan.",
      evidenceGap: "Production evidence is still missing.",
      expectedEvidence: ["Repo", "Tests"],
      estimatedWeeks: 2,
      estimatedHoursPerWeek: 4,
      proposedMilestones: [
        { title: "Scope", description: "Write the smallest useful API contract.", estimatedHours: 4 },
        { title: "Ship", description: "Implement, test, and deploy a thin slice.", estimatedHours: 8 },
      ],
      supportingCampaignIds: [CAMPAIGN],
      marketEvidenceSummary: null,
    };
    const deps = setup({ advisor });
    const created = await runPreliminary(deps);
    const chat = await sendGrowthChatMessage(
      {
        userId: USER,
        recommendationId: created.recommendation!.id,
        message: "Make it a two-week project.",
      },
      deps,
    );
    expect(chat.proposalRevision?.estimatedWeeks).toBe(2);
    const loaded = await getGrowthRecommendation(
      { userId: USER, recommendationId: created.recommendation!.id },
      deps,
    );
    expect(loaded.recommendation.currentProposal?.estimatedWeeks).toBe(2);
    expect(loaded.project).toBeNull();
  });
});
