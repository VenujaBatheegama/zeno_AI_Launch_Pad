import {
  DEFAULT_WEEKLY_HOURS,
  WORKLOAD_SLACK_HOURS,
  type AssessmentDimensionKey,
  type WeeklyHoursAvailable,
} from "./policy";
import type {
  CampaignIntent,
  GrowthProject,
  WorkloadSnapshot,
} from "./schemas";

const ACTIVE_PROJECT_STATUSES = new Set(["planned", "in_progress"]);

export function calculateWorkload(input: {
  intent: CampaignIntent;
  projects: GrowthProject[];
  gapKey: AssessmentDimensionKey;
}): WorkloadSnapshot {
  const active = input.projects.filter((project) =>
    ACTIVE_PROJECT_STATUSES.has(project.status),
  );
  const available = (input.intent.weeklyHoursAvailable ??
    DEFAULT_WEEKLY_HOURS) as WeeklyHoursAvailable;
  const totalEstimatedWeeklyHours = active.reduce(
    (sum, project) => sum + project.estimatedHoursPerWeek,
    0,
  );
  const remainingMilestones = active.reduce((sum, project) => {
    const remaining = Math.max(0, 100 - project.progress);
    return sum + (remaining > 0 ? 1 : 0);
  }, 0);
  const covering = active.find((project) =>
    projectCoversGap(project, input.gapKey, input.intent),
  );
  const remainingCapacityHours = Math.max(
    0,
    available - totalEstimatedWeeklyHours,
  );
  return {
    activeProjectCount: active.length,
    totalEstimatedWeeklyHours,
    remainingMilestones,
    availableWeeklyHours: available,
    remainingCapacityHours,
    overcommitted: totalEstimatedWeeklyHours >= available + WORKLOAD_SLACK_HOURS,
    coveringProjectId: covering?.id ?? null,
    coveringProjectTitle: covering?.title ?? null,
    campaignOverlapIds: covering?.supportingCampaignIds ?? [],
  };
}

export function projectCoversGap(
  project: GrowthProject,
  gapKey: AssessmentDimensionKey,
  intent: CampaignIntent,
): boolean {
  const haystack = `${project.title} ${project.objective} ${project.expectedEvidence.join(" ")}`.toLocaleLowerCase();
  const stack = intent.preferredTechnologies.map((item) => item.toLocaleLowerCase());
  if (stack.some((tech) => haystack.includes(tech))) return true;
  const gapTerms: Record<AssessmentDimensionKey, string[]> = {
    role_alignment: [intent.primaryRole.toLocaleLowerCase()],
    technical_relevance: stack,
    technical_depth: ["architecture", "performance", "scale"],
    project_complexity: ["api", "authentication", "integration"],
    production_readiness: ["deploy", "production", "monitoring"],
    testing_practices: ["test", "ci"],
    deployment_ops: ["deploy", "docker", "ci"],
    collaboration: ["team", "review"],
    public_portfolio: ["github", "portfolio"],
    communication_docs: ["document", "readme"],
    professional_evidence: ["user", "production"],
    stack_specific: stack,
  };
  return (gapTerms[gapKey] ?? []).some((term) => term && haystack.includes(term));
}

export function recommendActionType(input: {
  gapKey: AssessmentDimensionKey;
  workload: WorkloadSnapshot;
}): "new_project" | "extend_existing_project" | "improve_portfolio" | "document_existing_work" | "learning_artifact" {
  if (input.workload.coveringProjectId) return "extend_existing_project";
  if (input.workload.overcommitted || input.workload.remainingCapacityHours < 3) {
    if (input.gapKey === "public_portfolio") return "improve_portfolio";
    return "document_existing_work";
  }
  if (input.gapKey === "public_portfolio") return "improve_portfolio";
  if (input.gapKey === "communication_docs") return "document_existing_work";
  if (input.gapKey === "testing_practices" || input.gapKey === "deployment_ops") {
    return input.workload.activeProjectCount > 0
      ? "extend_existing_project"
      : "new_project";
  }
  return "new_project";
}

export function estimateEffort(input: {
  type: ReturnType<typeof recommendActionType>;
  availableWeeklyHours: WeeklyHoursAvailable;
  overcommitted: boolean;
}): { weeks: number; hoursPerWeek: number } {
  if (input.overcommitted || input.type === "document_existing_work" || input.type === "improve_portfolio") {
    return { weeks: 1, hoursPerWeek: Math.min(2, input.availableWeeklyHours) };
  }
  if (input.type === "extend_existing_project") {
    return { weeks: 2, hoursPerWeek: Math.min(3, input.availableWeeklyHours) };
  }
  return {
    weeks: input.availableWeeklyHours <= 2 ? 4 : 3,
    hoursPerWeek: Math.min(5, input.availableWeeklyHours),
  };
}
