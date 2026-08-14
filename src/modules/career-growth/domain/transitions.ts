import { CareerGrowthError } from "./errors";
import type { AssessmentDimensionKey } from "./policy";
import type {
  GrowthMilestoneStatus,
  GrowthProjectStatus,
  GrowthRecommendationStatus,
} from "./schemas";

const RECOMMENDATION_TRANSITIONS: Record<
  GrowthRecommendationStatus,
  GrowthRecommendationStatus[]
> = {
  pending: ["opened", "dismissed", "superseded"],
  opened: ["accepted", "dismissed", "superseded"],
  accepted: ["completed"],
  dismissed: [],
  superseded: [],
  completed: [],
};

const PROJECT_TRANSITIONS: Record<GrowthProjectStatus, GrowthProjectStatus[]> = {
  planned: ["in_progress", "abandoned"],
  in_progress: ["paused", "completed", "abandoned"],
  paused: ["in_progress", "abandoned"],
  completed: [],
  abandoned: [],
};

const MILESTONE_TRANSITIONS: Record<
  GrowthMilestoneStatus,
  GrowthMilestoneStatus[]
> = {
  todo: ["in_progress", "completed", "skipped"],
  in_progress: ["completed", "skipped", "todo"],
  completed: [],
  skipped: [],
};

export function assertRecommendationTransition(
  from: GrowthRecommendationStatus,
  to: GrowthRecommendationStatus,
): void {
  assertTransition("recommendation", from, to, RECOMMENDATION_TRANSITIONS[from]);
}

export function assertProjectTransition(
  from: GrowthProjectStatus,
  to: GrowthProjectStatus,
): void {
  assertTransition("project", from, to, PROJECT_TRANSITIONS[from]);
}

export function assertMilestoneTransition(
  from: GrowthMilestoneStatus,
  to: GrowthMilestoneStatus,
): void {
  assertTransition("milestone", from, to, MILESTONE_TRANSITIONS[from]);
}

export function canOpenRecommendation(status: GrowthRecommendationStatus): boolean {
  return status === "pending" || status === "opened";
}

export function canDismissRecommendation(status: GrowthRecommendationStatus): boolean {
  return status === "pending" || status === "opened";
}

export function progressFromMilestones(
  statuses: GrowthMilestoneStatus[],
): number {
  if (statuses.length === 0) return 0;
  const required = statuses.filter((status) => status !== "skipped");
  if (required.length === 0) return 100;
  const completed = required.filter((status) => status === "completed").length;
  return Math.round((completed / required.length) * 100);
}

export function suppressionStillApplies(input: {
  suppressionCriteriaFingerprint: string;
  suppressionEvidenceVersion: string;
  currentCriteriaFingerprint: string;
  currentEvidenceVersion: string;
  suppressionGapKey: AssessmentDimensionKey;
  currentGapKey: AssessmentDimensionKey;
}): boolean {
  return (
    input.suppressionCriteriaFingerprint === input.currentCriteriaFingerprint &&
    input.suppressionEvidenceVersion === input.currentEvidenceVersion &&
    input.suppressionGapKey === input.currentGapKey
  );
}

function assertTransition(
  kind: string,
  from: string,
  to: string,
  allowed: string[],
): void {
  if (from === to) return;
  if (!allowed.includes(to)) {
    throw new CareerGrowthError(
      "INVALID_TRANSITION",
      `Cannot move a Growth ${kind} from ${from} to ${to}.`,
    );
  }
}
