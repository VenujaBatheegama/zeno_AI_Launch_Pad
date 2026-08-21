import { CareerGrowthError } from "../domain/errors";
import { progressFromMilestones } from "../domain/transitions";
import {
  assertMilestoneTransition,
  assertProjectTransition,
  assertRecommendationTransition,
} from "../domain/transitions";
import { buildGrowthCalendarIcs } from "../domain/calendar-ics";
import type {
  GrowthMilestone,
  GrowthProject,
} from "../domain/schemas";
import type {
  CareerGrowthRepository,
  Clock,
  GrowthCaps,
  GrowthNotifier,
  IdGenerator,
} from "./ports";
import { requireOwnedRecommendation } from "./recommendations";

export async function acceptGrowthRecommendation(
  input: {
    userId: string;
    recommendationId: string;
    startDate: string;
    targetDate: string;
    weeklyHours: number;
  },
  deps: {
    repository: CareerGrowthRepository;
    notifier: GrowthNotifier;
    createId: IdGenerator;
    now: Clock;
  },
) {
  let recommendation = await requireOwnedRecommendation(input, deps.repository);
  const existing = await deps.repository.getProjectBySourceRecommendation(
    recommendation.id,
  );
  if (existing) return { project: existing, created: false };

  if (recommendation.status !== "pending" && recommendation.status !== "opened") {
    throw new CareerGrowthError(
      "INVALID_TRANSITION",
      "Only an open Growth recommendation can be started as a project.",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) {
    throw new CareerGrowthError("INVALID_INPUT", "Start and target dates must be YYYY-MM-DD.");
  }
  if (input.targetDate < input.startDate) {
    throw new CareerGrowthError("INVALID_INPUT", "The target date must be on or after the start date.");
  }
  if (input.weeklyHours < 1 || input.weeklyHours > 20) {
    throw new CareerGrowthError("INVALID_INPUT", "Weekly hours must be between 1 and 20.");
  }

  const now = deps.now().toISOString();
  if (recommendation.status === "pending") {
    assertRecommendationTransition(recommendation.status, "opened");
    await deps.repository.updateRecommendation(recommendation.id, {
      status: "opened",
      openedAt: now,
      updatedAt: now,
    });
    recommendation = {
      ...recommendation,
      status: "opened",
      openedAt: now,
      updatedAt: now,
    };
  }
  assertRecommendationTransition(recommendation.status, "accepted");
  const proposal = recommendation.currentProposal;
  const project: GrowthProject = {
    id: deps.createId(),
    userId: input.userId,
    sourceRecommendationId: recommendation.id,
    title: recommendation.title,
    objective: recommendation.summary,
    status: "planned",
    startDate: input.startDate,
    targetDate: input.targetDate,
    estimatedHoursPerWeek: input.weeklyHours,
    progress: 0,
    expectedEvidence: recommendation.expectedEvidence,
    supportingCampaignIds: recommendation.supportingCampaignIds,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await deps.repository.insertProject(project);
  const milestones = (proposal?.proposedMilestones ?? recommendation.proposedMilestones).map(
    (item, index, all) => ({
      id: deps.createId(),
      projectId: project.id,
      userId: input.userId,
      position: index,
      title: item.title,
      description: item.description,
      estimatedHours: item.estimatedHours,
      targetDate: milestoneDate(input.startDate, input.targetDate, index, all.length),
      status: "todo" as const,
      completedAt: null,
    }),
  );
  await deps.repository.replaceMilestones(project.id, milestones);
  await deps.repository.updateRecommendation(recommendation.id, {
    status: "accepted",
    acceptedAt: now,
    updatedAt: now,
  });
  const conversation = await deps.repository.getConversationByRecommendation(
    recommendation.id,
  );
  if (conversation) {
    await deps.repository.updateConversation(conversation.id, {
      projectId: project.id,
      updatedAt: now,
    });
  }
  await deps.notifier.suppressNotificationsForEntity({
    userId: input.userId,
    relatedEntityType: "growth_recommendation",
    relatedEntityId: recommendation.id,
  });
  return { project, milestones, created: true };
}

export async function getGrowthDashboard(
  input: { userId: string },
  deps: { repository: CareerGrowthRepository; campaigns: { listCampaigns(userId: string): Promise<Array<{ id: string; name: string }>> } },
) {
  const [projects, campaigns] = await Promise.all([
    deps.repository.listProjects({ userId: input.userId }),
    deps.campaigns.listCampaigns(input.userId),
  ]);
  const names = new Map(campaigns.map((item) => [item.id, item.name]));
  const active = projects.filter(
    (item) => item.status === "planned" || item.status === "in_progress" || item.status === "paused",
  );
  const completed = projects.filter((item) => item.status === "completed");
  const current = [...active].sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0] ?? null;
  const currentMilestones = current
    ? await deps.repository.listMilestones(current.id)
    : [];
  const weeklyHours = active.reduce((sum, item) => sum + item.estimatedHoursPerWeek, 0);
  return {
    weeklyHours,
    activeCount: active.length,
    current: current
      ? {
          project: withCampaignNames(current, names),
          milestones: currentMilestones,
          nextMilestone:
            currentMilestones.find((item) => item.status === "in_progress") ??
            currentMilestones.find((item) => item.status === "todo") ??
            null,
        }
      : null,
    otherActive: active
      .filter((item) => item.id !== current?.id)
      .map((item) => withCampaignNames(item, names)),
    completed: completed.map((item) => withCampaignNames(item, names)),
  };
}

export async function getGrowthProject(
  input: { userId: string; projectId: string },
  deps: {
    repository: CareerGrowthRepository;
    campaigns?: {
      listCampaigns(userId: string): Promise<Array<{ id: string; name: string }>>;
    };
  },
) {
  const project = await requireOwnedProject(input, deps.repository);
  const milestones = await deps.repository.listMilestones(project.id);
  const recommendation = await deps.repository.getRecommendation(
    project.sourceRecommendationId,
  );
  const conversation = recommendation
    ? await deps.repository.getConversationByRecommendation(recommendation.id)
    : null;
  const messages = conversation
    ? await deps.repository.listMessages(conversation.id)
    : [];
  const names = deps.campaigns
    ? new Map(
        (await deps.campaigns.listCampaigns(input.userId)).map((item) => [
          item.id,
          item.name,
        ]),
      )
    : new Map<string, string>();
  return {
    project: withCampaignNames(project, names),
    milestones,
    recommendation,
    conversation,
    messages,
  };
}

export async function updateGrowthProject(
  input: {
    userId: string;
    projectId: string;
    status?: GrowthProject["status"];
    targetDate?: string;
    estimatedHoursPerWeek?: number;
  },
  deps: { repository: CareerGrowthRepository; now: Clock },
) {
  const project = await requireOwnedProject(input, deps.repository);
  const now = deps.now().toISOString();
  if (input.status && input.status !== project.status) {
    assertProjectTransition(project.status, input.status);
  }
  const patch: Partial<GrowthProject> = { updatedAt: now };
  if (input.status) patch.status = input.status;
  if (input.targetDate) patch.targetDate = input.targetDate;
  if (input.estimatedHoursPerWeek) {
    patch.estimatedHoursPerWeek = input.estimatedHoursPerWeek;
  }
  if (input.status === "completed") {
    patch.completedAt = now;
    patch.progress = 100;
    await deps.repository.updateRecommendation(project.sourceRecommendationId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
  }
  return deps.repository.updateProject(project.id, patch);
}

export async function updateGrowthMilestone(
  input: {
    userId: string;
    milestoneId: string;
    status: GrowthMilestone["status"];
  },
  deps: { repository: CareerGrowthRepository; now: Clock },
) {
  const milestone = await deps.repository.getMilestone(input.milestoneId);
  if (!milestone || milestone.userId !== input.userId) {
    throw new CareerGrowthError("NOT_FOUND", "Milestone was not found.");
  }
  assertMilestoneTransition(milestone.status, input.status);
  const now = deps.now().toISOString();
  const updated = await deps.repository.updateMilestone(milestone.id, {
    status: input.status,
    completedAt: input.status === "completed" ? now : null,
  });
  const milestones = await deps.repository.listMilestones(milestone.projectId);
  const progress = progressFromMilestones(milestones.map((item) => item.status));
  const project = await deps.repository.getProject(milestone.projectId);
  if (project) {
    const nextStatus =
      project.status === "planned" && input.status === "in_progress"
        ? "in_progress"
        : project.status;
    if (nextStatus !== project.status) {
      assertProjectTransition(project.status, nextStatus);
    }
    await deps.repository.updateProject(project.id, {
      progress,
      status: nextStatus,
      updatedAt: now,
    });
  }
  return { milestone: updated, progress };
}

export async function exportGrowthProjectCalendar(
  input: { userId: string; projectId: string },
  deps: { repository: CareerGrowthRepository; caps: GrowthCaps },
) {
  const project = await requireOwnedProject(input, deps.repository);
  const milestones = await deps.repository.listMilestones(project.id);
  const ics = buildGrowthCalendarIcs({
    calendarName: project.title,
    events: [
      {
        uid: `${project.id}@zeno-growth`,
        title: project.title,
        description: project.objective,
        start: project.startDate,
        end: project.targetDate,
        url: `${deps.caps.publicAppBaseUrl}/app/growth/projects/${project.id}`,
      },
      ...milestones.map((item) => ({
        uid: `${item.id}@zeno-growth`,
        title: `${project.title}: ${item.title}`,
        description: item.description,
        start: item.targetDate ?? project.targetDate,
        url: `${deps.caps.publicAppBaseUrl}/app/growth/projects/${project.id}`,
      })),
    ],
  });
  return { filename: `${slug(project.title)}.ics`, ics };
}

async function requireOwnedProject(
  input: { userId: string; projectId: string },
  repository: CareerGrowthRepository,
) {
  const project = await repository.getProject(input.projectId);
  if (!project || project.userId !== input.userId) {
    throw new CareerGrowthError("NOT_FOUND", "Growth project was not found.");
  }
  return project;
}

function withCampaignNames(
  project: GrowthProject,
  names: Map<string, string>,
) {
  return {
    ...project,
    campaignNames: project.supportingCampaignIds.map(
      (id) => names.get(id) ?? "Campaign",
    ),
  };
}

function milestoneDate(
  start: string,
  target: string,
  index: number,
  count: number,
): string {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const targetMs = Date.parse(`${target}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(targetMs) || count <= 1) {
    return target;
  }
  const t = (index + 1) / count;
  return new Date(startMs + (targetMs - startMs) * t).toISOString().slice(0, 10);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "growth-plan";
}
