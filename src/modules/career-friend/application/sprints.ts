import type { GrowthAction } from "@/modules/career-campaign/domain/schemas";
import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";

import { buildSprintPlan } from "../domain/sprint-planning";
import type { CareerFriendRepository } from "./ports";

export async function startCareerSprint(
  input: { userId: string; action: GrowthAction },
  deps: {
    repository: CareerFriendRepository;
    createId: () => string;
    now: () => Date;
  },
) {
  if (input.action.userId !== input.userId || input.action.status !== "active") {
    throw new CareerCampaignError("NOT_FOUND", "Growth signal was not found.");
  }
  const existing = await deps.repository.findOpenSprintForGap(
    input.userId,
    input.action.gapKey,
  );
  if (existing) return { sprint: existing, reused: true };

  const plan = buildSprintPlan(input.action);
  const createdAt = deps.now().toISOString();
  const sprintId = deps.createId();
  const sprint = await deps.repository.createSprint({
    id: sprintId,
    userId: input.userId,
    growthActionId: input.action.id,
    gapKey: input.action.gapKey,
    gapLabel: input.action.gapLabel,
    gapType: plan.gapType,
    title: plan.title,
    objective: plan.objective,
    whyNow: input.action.whyItMatters,
    marketSignal: {
      frequency: input.action.frequency,
      affectedListingIds: input.action.affectedListingIds,
    },
    estimatedHours: plan.estimatedHours,
    status: "active",
    evidenceUrl: null,
    evidenceNote: null,
    evidenceSubmittedAt: null,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
    milestoneRows: plan.milestones.map((title, position) => ({
      id: deps.createId(),
      title,
      position,
    })),
  });
  return { sprint, reused: false };
}

export async function setSprintMilestone(
  input: {
    userId: string;
    sprintId: string;
    milestoneId: string;
    completed: boolean;
  },
  deps: { repository: CareerFriendRepository; now: () => Date },
) {
  const sprint = await deps.repository.getSprint(input.userId, input.sprintId);
  if (!sprint) {
    throw new CareerCampaignError("NOT_FOUND", "Career sprint was not found.");
  }
  if (sprint.status !== "active" && sprint.status !== "paused") {
    throw new CareerCampaignError(
      "INVALID_TRANSITION",
      "This sprint can no longer be edited.",
    );
  }
  if (!sprint.milestones.some((item) => item.id === input.milestoneId)) {
    throw new CareerCampaignError("NOT_FOUND", "Sprint milestone was not found.");
  }
  return deps.repository.updateMilestone({
    ...input,
    completedAt: input.completed ? deps.now().toISOString() : null,
  });
}

export async function submitCareerSprintEvidence(
  input: {
    userId: string;
    sprintId: string;
    evidenceUrl?: string;
    evidenceNote?: string;
  },
  deps: { repository: CareerFriendRepository; now: () => Date },
) {
  const sprint = await deps.repository.getSprint(input.userId, input.sprintId);
  if (!sprint) {
    throw new CareerCampaignError("NOT_FOUND", "Career sprint was not found.");
  }
  if (sprint.status !== "active") {
    throw new CareerCampaignError(
      "INVALID_TRANSITION",
      "Only an active sprint can accept evidence.",
    );
  }
  if (!sprint.milestones.every((item) => item.completed)) {
    throw new CareerCampaignError(
      "INVALID_TRANSITION",
      "Complete every milestone before submitting evidence.",
    );
  }
  return deps.repository.submitEvidence({
    userId: input.userId,
    sprintId: input.sprintId,
    evidenceUrl: input.evidenceUrl ?? null,
    evidenceNote: input.evidenceNote ?? null,
    submittedAt: deps.now().toISOString(),
  });
}
