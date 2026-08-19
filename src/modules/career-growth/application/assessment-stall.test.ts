import { describe, expect, it } from "vitest";

import { PRELIMINARY_MARKET_LABEL } from "../domain/policy";
import { requestGrowthAssessment } from "./request-assessment";
import { processGrowthAssessment } from "./process-assessment";
import {
  DEFAULT_GROWTH_CAPS,
  FakeCampaignReader,
  FakeEvidenceReader,
  FakeGrowthAdvisor,
  FakeMarketReader,
  FakeNotifier,
  InMemoryCareerGrowthRepository,
} from "./fakes";
import type { JobSearchCampaign } from "@/modules/career-campaign/domain/job-campaign";
import type { CareerEvidence, CareerEvidenceSet } from "@/modules/career-evidence/domain/evidence";
import type { AnalysedCampaignJob } from "./ports";

const USER = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = "00000000-0000-4000-8000-000000000010";

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
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
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
    projects: [],
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

function makeAnalysedJobs(count: number, statement = "Go experience"): AnalysedCampaignJob[] {
  return Array.from({ length: count }, (_, index) => ({
    listingId: `00000000-0000-4000-8000-${String(index + 40).padStart(12, "0")}`,
    analysisStatus: "ready" as const,
    evidenceFitScore: 72,
    requirements: [
      {
        id: `req-${index}`,
        statement: "Go experience",
        category: "technology" as const,
        importance: "required" as const,
        explicit: true,
        confidence: "high" as const,
        evidence_keys: [],
        quantitative_threshold: null,
        source_quote: statement,
      },
    ],
    matches: [],
  }));
}

describe("market stall fallback in processGrowthAssessment", () => {
  it("skips assessment when market is below threshold and stall threshold (14 days) has not passed", async () => {
    const repository = new InMemoryCareerGrowthRepository();
    const campaigns = new FakeCampaignReader();
    const c = campaign();
    campaigns.campaigns.set(c.id, c);
    const evidence = new FakeEvidenceReader();
    evidence.current = evidenceSet();
    // Only 2 analysed jobs (threshold is 5)
    const market = new FakeMarketReader();
    market.jobs = makeAnalysedJobs(2);
    const advisor = new FakeGrowthAdvisor();
    const notifier = new FakeNotifier();
    const createId = createIdFactory();
    const now = () => new Date("2026-08-05T00:00:00.000Z"); // 4 days after creation (< 14 days)

    const deps = {
      repository,
      campaigns,
      evidence,
      market,
      advisor,
      notifier,
      caps: { ...DEFAULT_GROWTH_CAPS, preliminaryStallDays: 14 },
      createId,
      now,
    };

    const req = await requestGrowthAssessment(
      { userId: USER, campaignId: CAMPAIGN, mode: "market_refined" },
      deps,
    );

    const result = await processGrowthAssessment(
      { requestId: req.id, owner: "cron", userId: USER },
      deps,
    );

    expect(result.requestStatus).toBe("completed");
    expect(result.assessment).toBeNull();
    expect(result.recommendation).toBeNull();
  });

  it("downgrades to preliminary assessment with actual partial job count when stalled >= 14 days", async () => {
    const repository = new InMemoryCareerGrowthRepository();
    const campaigns = new FakeCampaignReader();
    const c = campaign();
    campaigns.campaigns.set(c.id, c);
    const evidence = new FakeEvidenceReader();
    evidence.current = evidenceSet();
    // 3 analysed jobs (threshold is 5)
    const market = new FakeMarketReader();
    market.jobs = makeAnalysedJobs(3);
    const advisor = new FakeGrowthAdvisor();
    const notifier = new FakeNotifier();
    const createId = createIdFactory();

    // Created on Aug 1, processed on Aug 16 (15 days later >= 14 days)
    const reqDate = () => new Date("2026-08-01T00:00:00.000Z");
    const processDate = () => new Date("2026-08-16T00:00:00.000Z");

    const deps = {
      repository,
      campaigns,
      evidence,
      market,
      advisor,
      notifier,
      caps: { ...DEFAULT_GROWTH_CAPS, preliminaryStallDays: 14 },
      createId,
      now: reqDate,
    };

    const req = await requestGrowthAssessment(
      { userId: USER, campaignId: CAMPAIGN, mode: "market_refined" },
      deps,
    );

    const result = await processGrowthAssessment(
      { requestId: req.id, owner: "cron", userId: USER },
      { ...deps, now: processDate },
    );

    expect(result.requestStatus).toBe("completed");
    expect(result.assessment).not.toBeNull();
    expect(result.assessment?.mode).toBe("preliminary");
    // Actual partial job count preserved (3 jobs, not 0)
    expect(result.assessment?.marketSampleSize).toBe(3);
    // Preliminary market label set on the assessment
    expect(result.assessment?.marketEvidenceSummary).toBe(PRELIMINARY_MARKET_LABEL);
    expect(result.recommendation).not.toBeNull();
  });
});
