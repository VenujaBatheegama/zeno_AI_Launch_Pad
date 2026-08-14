import { describe, expect, it } from "vitest";

import type { GrowthAction } from "@/modules/career-campaign/domain/schemas";
import { buildSprintPlan, classifyGap } from "./sprint-planning";

function action(gapLabel: string): GrowthAction {
  return {
    id: "action-1",
    userId: "user-1",
    gapKey: gapLabel.toLocaleLowerCase(),
    gapLabel,
    frequency: 3,
    affectedListingIds: ["job-1", "job-2", "job-3"],
    whyItMatters: `${gapLabel} appeared in 3 strong matches.`,
    suggestedAction: "Build evidence.",
    evidenceArtifact: "A real artifact.",
    coverageImpact: "Future matches can use it after verification.",
    status: "active",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

describe("career sprint planning", () => {
  it.each([
    ["AWS certification", "qualification"],
    ["LinkedIn thought leadership", "visibility"],
    ["Production experience with Kubernetes", "evidence"],
    ["Kubernetes", "skill"],
  ] as const)("classifies %s as %s", (label, expected) => {
    expect(classifyGap(label)).toBe(expected);
  });

  it("creates a small deterministic plan grounded in the market signal", () => {
    const plan = buildSprintPlan(action("Kubernetes"));
    expect(plan.gapType).toBe("skill");
    expect(plan.milestones).toHaveLength(3);
    expect(plan.title).toContain("Kubernetes");
    expect(plan.estimatedHours).toBeLessThanOrEqual(8);
  });

  it("validates expensive qualifications before prescribing them", () => {
    const plan = buildSprintPlan(action("AWS certification"));
    expect(plan.gapType).toBe("qualification");
    expect(plan.objective).toMatch(/necessary/i);
    expect(plan.milestones.join(" ")).toMatch(/cost/i);
  });
});
