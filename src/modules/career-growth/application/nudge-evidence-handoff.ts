import {
  DEFAULT_NUDGE_DELAY_DAYS,
  DEFAULT_NUDGE_MAX_REMINDERS,
} from "../domain/policy";
import type {
  CareerGrowthRepository,
  Clock,
  GrowthEvidenceReader,
  GrowthNotifier,
  IdGenerator,
} from "./ports";

export type NudgeEvidenceHandoffResult = {
  unconfirmedCount: number;
  nudgesEnqueued: number;
};

/**
 * Checks for completed growth projects whose evidence has not yet been
 * confirmed / added into the user's verified career evidence profile.
 *
 * Cadence:
 * Sends a reminder after `delayDays` (default 7), repeating every `delayDays`
 * up to `maxReminders` (default 3) times.
 */
export async function nudgeUnconfirmedHandoffs(
  input: { userId: string },
  deps: {
    repository: CareerGrowthRepository;
    evidence: GrowthEvidenceReader;
    notifier: GrowthNotifier;
    createId: IdGenerator;
    now: Clock;
    delayDays?: number;
    maxReminders?: number;
  },
): Promise<NudgeEvidenceHandoffResult> {
  const delayDays = deps.delayDays ?? DEFAULT_NUDGE_DELAY_DAYS;
  const maxReminders = deps.maxReminders ?? DEFAULT_NUDGE_MAX_REMINDERS;
  const now = deps.now();

  const [completedProjects, currentEvidence] = await Promise.all([
    deps.repository.listProjects({
      userId: input.userId,
      statuses: ["completed"],
    }),
    deps.evidence.getCurrent(input.userId),
  ]);

  const verifiedNames = new Set(
    (currentEvidence?.evidence?.projects ?? []).map((project) =>
      project.name.trim().toLowerCase(),
    ),
  );

  let unconfirmedCount = 0;
  let nudgesEnqueued = 0;

  for (const project of completedProjects) {
    if (verifiedNames.has(project.title.trim().toLowerCase())) {
      // Evidence already handed off and verified
      continue;
    }
    if (!project.completedAt) {
      continue;
    }

    unconfirmedCount += 1;
    const completedAt = new Date(project.completedAt);
    const daysSinceCompletion =
      (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24);

    const eligibleReminders = Math.min(
      Math.floor(daysSinceCompletion / delayDays),
      maxReminders,
    );

    for (let r = 1; r <= eligibleReminders; r++) {
      const idempotencyKey = `growth-nudge:${project.id}:${r}`;
      const { created } = await deps.notifier.enqueueNotification({
        id: deps.createId(),
        userId: input.userId,
        eventType: "growth_handoff_nudge",
        channel: "in_app",
        relatedEntityType: "growth_project",
        relatedEntityId: project.id,
        payload: {
          projectId: project.id,
          projectTitle: project.title,
          reminderNumber: r,
          maxReminders,
          actionPath: `/app/career-profile?fromGrowth=${project.id}`,
        },
        idempotencyKey,
        scheduledAt: now.toISOString(),
      });
      if (created) {
        nudgesEnqueued += 1;
      }
    }
  }

  return { unconfirmedCount, nudgesEnqueued };
}
