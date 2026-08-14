import { describe, expect, it } from "vitest";

import type { GrowthAction } from "@/modules/career-campaign/domain/schemas";
import type { CareerFriendRepository } from "./ports";
import type { CareerSprint } from "../domain/schemas";
import {
  setSprintMilestone,
  startCareerSprint,
  submitCareerSprintEvidence,
} from "./sprints";

class SprintRepository {
  sprints: CareerSprint[] = [];

  async createSprint(input: Parameters<CareerFriendRepository["createSprint"]>[0]) {
    const sprint: CareerSprint = {
      ...input,
      milestones: input.milestoneRows.map((item) => ({
        ...item,
        sprintId: input.id,
        completed: false,
        completedAt: null,
      })),
    };
    this.sprints.push(sprint);
    return sprint;
  }

  async findOpenSprintForGap(userId: string, gapKey: string) {
    return this.sprints.find((item) => item.userId === userId && item.gapKey === gapKey) ?? null;
  }

  async getSprint(userId: string, sprintId: string) {
    return this.sprints.find((item) => item.userId === userId && item.id === sprintId) ?? null;
  }

  async updateMilestone(input: Parameters<CareerFriendRepository["updateMilestone"]>[0]) {
    const sprint = (await this.getSprint(input.userId, input.sprintId))!;
    sprint.milestones = sprint.milestones.map((item) =>
      item.id === input.milestoneId
        ? { ...item, completed: input.completed, completedAt: input.completedAt }
        : item,
    );
    return sprint;
  }

  async submitEvidence(input: Parameters<CareerFriendRepository["submitEvidence"]>[0]) {
    const sprint = (await this.getSprint(input.userId, input.sprintId))!;
    Object.assign(sprint, {
      status: "evidence_submitted" as const,
      evidenceUrl: input.evidenceUrl,
      evidenceNote: input.evidenceNote,
      evidenceSubmittedAt: input.submittedAt,
    });
    return sprint;
  }
}

const growthAction: GrowthAction = {
  id: "10000000-0000-4000-8000-000000000001",
  userId: "user-1",
  gapKey: "kubernetes",
  gapLabel: "Kubernetes",
  frequency: 3,
  affectedListingIds: ["job-1", "job-2"],
  whyItMatters: "Repeated in strong matches.",
  suggestedAction: "Build a project.",
  evidenceArtifact: "Repository.",
  coverageImpact: "Supports later matches.",
  status: "active",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

describe("career sprint lifecycle", () => {
  it("reuses the open sprint for the same market gap", async () => {
    const repository = new SprintRepository();
    let sequence = 0;
    const deps = {
      repository: repository as unknown as CareerFriendRepository,
      createId: () => `id-${++sequence}`,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    };
    const first = await startCareerSprint({ userId: "user-1", action: growthAction }, deps);
    const second = await startCareerSprint({ userId: "user-1", action: growthAction }, deps);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(repository.sprints).toHaveLength(1);
  });

  it("requires every milestone before evidence submission", async () => {
    const repository = new SprintRepository();
    let sequence = 0;
    const shared = {
      repository: repository as unknown as CareerFriendRepository,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    };
    const { sprint } = await startCareerSprint(
      { userId: "user-1", action: growthAction },
      { ...shared, createId: () => `id-${++sequence}` },
    );
    await expect(
      submitCareerSprintEvidence(
        { userId: "user-1", sprintId: sprint.id, evidenceNote: "Built it." },
        shared,
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    for (const milestone of sprint.milestones) {
      await setSprintMilestone(
        { userId: "user-1", sprintId: sprint.id, milestoneId: milestone.id, completed: true },
        shared,
      );
    }
    const submitted = await submitCareerSprintEvidence(
      { userId: "user-1", sprintId: sprint.id, evidenceUrl: "https://example.com/proof" },
      shared,
    );
    expect(submitted.status).toBe("evidence_submitted");
  });
});
