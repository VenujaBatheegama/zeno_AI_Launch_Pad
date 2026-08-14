import { describe, expect, it } from "vitest";

import { buildGrowthCalendarIcs, escapeIcsText } from "./calendar-ics";
import {
  aggregateMarketRequirements,
  shouldRefineFromMarket,
} from "./market-requirements";
import { DEFAULT_MARKET_MIN_ANALYSED_JOBS } from "./policy";
import {
  assertProjectTransition,
  assertRecommendationTransition,
  progressFromMilestones,
} from "./transitions";
import { CareerGrowthError } from "./errors";
import { calculateWorkload, recommendActionType } from "./workload";
import type { CampaignIntent, GrowthProject } from "./schemas";

const USER = "11111111-1111-4111-8111-111111111111";

function intent(overrides: Partial<CampaignIntent> = {}): CampaignIntent {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    userId: USER,
    name: "Backend Engineer",
    status: "active",
    primaryRole: "Backend Engineer",
    location: "Remote",
    workMode: "remote",
    employmentTypes: [],
    experienceLevels: [],
    preferredTechnologies: ["Java", "Spring Boot"],
    targetReadyDate: null,
    weeklyHoursAvailable: 5,
    criteriaVersion: 1,
    priority: 1,
    ...overrides,
  };
}

function project(overrides: Partial<GrowthProject> = {}): GrowthProject {
  return {
    id: "00000000-0000-4000-8000-000000000030",
    userId: USER,
    sourceRecommendationId: "00000000-0000-4000-8000-000000000031",
    title: "API deployment with monitoring",
    objective: "Deploy a Spring Boot API and document the process",
    status: "in_progress",
    startDate: "2026-08-01",
    targetDate: "2026-08-22",
    estimatedHoursPerWeek: 5,
    progress: 40,
    expectedEvidence: ["Deployed API", "Tests"],
    supportingCampaignIds: ["00000000-0000-4000-8000-000000000010"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("workload", () => {
  it("reuses an existing project when it already covers the gap", () => {
    const snapshot = calculateWorkload({
      intent: intent(),
      projects: [project()],
      gapKey: "deployment_ops",
    });
    expect(snapshot.coveringProjectId).toBe(project().id);
    expect(recommendActionType({ gapKey: "deployment_ops", workload: snapshot })).toBe(
      "extend_existing_project",
    );
  });

  it("recommends a smaller action when the user is overcommitted", () => {
    const snapshot = calculateWorkload({
      intent: intent({ weeklyHoursAvailable: 2 }),
      projects: [
        project({
          title: "Unrelated marketing rewrite",
          objective: "Rewrite a brochure site",
          expectedEvidence: ["Live brochure"],
          estimatedHoursPerWeek: 8,
        }),
      ],
      gapKey: "project_complexity",
    });
    expect(snapshot.overcommitted).toBe(true);
    expect(snapshot.coveringProjectId).toBeNull();
    expect(recommendActionType({ gapKey: "project_complexity", workload: snapshot })).toBe(
      "document_existing_work",
    );
  });
});

describe("market aggregation", () => {
  it("aggregates stored requirements without sending job text", () => {
    const jobs = Array.from({ length: 8 }, (_, index) => ({
      listingId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      analysisStatus: "ready" as const,
      evidenceFitScore: 70,
      requirements: [
        {
          id: `req-${index}-spring`,
          statement: "Spring Boot",
          category: "technology" as const,
          importance: "required" as const,
          explicit: true,
          confidence: "high" as const,
          source_quote: "Spring Boot",
          quantitative_threshold: null,
        },
      ],
      matches: [
        {
          requirement_id: `req-${index}-spring`,
          status: "gap" as const,
          evidence_ids: [],
          reason: "Not demonstrated",
          confidence: "high" as const,
          classifier: "deterministic" as const,
        },
      ],
    }));
    const signals = aggregateMarketRequirements(jobs);
    expect(signals.relevantJobCount).toBe(8);
    expect(signals.requirements[0]?.label).toBe("Spring Boot");
    expect(signals.requirements[0]?.frequency).toBe(8);
    expect(shouldRefineFromMarket(signals, DEFAULT_MARKET_MIN_ANALYSED_JOBS)).toBe(true);
  });

  it("does not refine below the configured minimum analysed jobs", () => {
    const jobs = Array.from({ length: 3 }, (_, index) => ({
      listingId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      analysisStatus: "ready" as const,
      evidenceFitScore: 70,
      requirements: [
        {
          id: `req-${index}`,
          statement: "Kubernetes",
          category: "technology" as const,
          importance: "required" as const,
          explicit: true,
          confidence: "high" as const,
          source_quote: "Kubernetes",
          quantitative_threshold: null,
        },
      ],
      matches: [],
    }));
    expect(shouldRefineFromMarket(aggregateMarketRequirements(jobs), 5)).toBe(false);
  });
});

describe("state transitions", () => {
  it("rejects invalid recommendation and project transitions", () => {
    expect(() => assertRecommendationTransition("accepted", "pending")).toThrow(
      CareerGrowthError,
    );
    expect(() => assertProjectTransition("completed", "in_progress")).toThrow(
      CareerGrowthError,
    );
    expect(() => assertRecommendationTransition("pending", "opened")).not.toThrow();
    expect(() => assertProjectTransition("planned", "in_progress")).not.toThrow();
  });

  it("calculates progress from milestone completion", () => {
    expect(progressFromMilestones(["completed", "todo", "todo", "skipped"])).toBe(33);
    expect(progressFromMilestones(["completed", "completed", "skipped"])).toBe(100);
  });
});

describe("calendar export", () => {
  it("produces a valid ICS document with escaped content", () => {
    const ics = buildGrowthCalendarIcs({
      calendarName: "Growth, plan",
      events: [
        {
          uid: "proj-1@zeno-growth",
          title: "Deploy API; tests",
          description: "Line 1\nLine 2",
          start: "2026-08-20",
          end: "2026-09-10",
          url: "https://zeno.example/app/growth/projects/1",
        },
      ],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Deploy API\\; tests");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2");
    expect(ics).toContain(escapeIcsText("Growth, plan"));
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});
