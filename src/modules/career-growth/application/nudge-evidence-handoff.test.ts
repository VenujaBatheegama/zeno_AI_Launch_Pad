import { describe, expect, it } from "vitest";

import { InMemoryCareerGrowthRepository } from "./fakes";
import { nudgeUnconfirmedHandoffs } from "./nudge-evidence-handoff";
import type { GrowthProject } from "../domain/schemas";
import type { NotificationOutboxItem } from "@/modules/career-campaign/domain/schemas";

function makeFakeNotifier() {
  const enqueued: NotificationOutboxItem[] = [];
  const seenKeys = new Set<string>();

  return {
    enqueued,
    notifier: {
      async enqueueNotification(input: any) {
        if (seenKeys.has(input.idempotencyKey)) {
          return { item: input, created: false };
        }
        seenKeys.add(input.idempotencyKey);
        enqueued.push(input);
        return { item: input, created: true };
      },
      async suppressNotificationsForEntity() {
        return 0;
      },
    },
  };
}

describe("nudgeUnconfirmedHandoffs", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const now = new Date("2026-08-20T12:00:00Z");

  it("does nothing when there are no completed projects", async () => {
    const repository = new InMemoryCareerGrowthRepository();
    const { notifier, enqueued } = makeFakeNotifier();
    const evidence = {
      getCurrent: async () => null,
    };

    const result = await nudgeUnconfirmedHandoffs(
      { userId },
      {
        repository,
        evidence,
        notifier,
        createId: () => "id-1",
        now: () => now,
        delayDays: 7,
        maxReminders: 3,
      },
    );

    expect(result.unconfirmedCount).toBe(0);
    expect(result.nudgesEnqueued).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it("does not nudge if project was already added to verified evidence profile", async () => {
    const repository = new InMemoryCareerGrowthRepository();
    const { notifier, enqueued } = makeFakeNotifier();

    const project: GrowthProject = {
      id: "project-1",
      userId,
      sourceRecommendationId: "rec-1",
      title: "Distributed Rate Limiter",
      objective: "Build a rate limiter",
      status: "completed",
      startDate: "2026-07-01",
      targetDate: "2026-08-01",
      estimatedHoursPerWeek: 5,
      progress: 100,
      expectedEvidence: ["GitHub repo"],
      supportingCampaignIds: [],
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
      completedAt: "2026-08-01T00:00:00Z", // 19 days ago
    };
    await repository.insertProject(project);

    const evidence = {
      getCurrent: async () => ({
        id: "ev-1",
        userId,
        sourceDocumentId: "doc-1",
        extractionModel: "test",
        createdAt: now.toISOString(),
        verifiedAt: now.toISOString(),
        status: "verified" as const,
        updatedAt: now.toISOString(),
        evidence: {
          schema_version: 1 as const,
          profile: {
            full_name: "Ada",
            email: null,
            phone: null,
            location: null,
            summary: null,
          },
          work_experience: [],
          skills: [],
          experiences: [],
          projects: [
            {
              id: "p-1",
              origin: "extracted" as const,
              source_quote: null,
              name: "Distributed Rate Limiter",
              role: null,
              start_date: null,
              end_date: null,
              bullets: [],
              technologies: [],
            },
          ],
          education: [],
          certifications: [],
          achievements: [],
          references: [],
          warnings: [],
        },
      }),
    };

    const result = await nudgeUnconfirmedHandoffs(
      { userId },
      {
        repository,
        evidence,
        notifier,
        createId: () => "id-1",
        now: () => now,
        delayDays: 7,
        maxReminders: 3,
      },
    );

    expect(result.unconfirmedCount).toBe(0);
    expect(result.nudgesEnqueued).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it("does not nudge before the first 7-day delay passes", async () => {
    const repository = new InMemoryCareerGrowthRepository();
    const { notifier, enqueued } = makeFakeNotifier();

    const project: GrowthProject = {
      id: "project-1",
      userId,
      sourceRecommendationId: "rec-1",
      title: "Distributed Rate Limiter",
      objective: "Build a rate limiter",
      status: "completed",
      startDate: "2026-08-01",
      targetDate: "2026-08-18",
      estimatedHoursPerWeek: 5,
      progress: 100,
      expectedEvidence: ["GitHub repo"],
      supportingCampaignIds: [],
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-18T00:00:00Z",
      completedAt: "2026-08-18T00:00:00Z", // 2.5 days ago (< 7 days)
    };
    await repository.insertProject(project);

    const evidence = {
      getCurrent: async () => null,
    };

    const result = await nudgeUnconfirmedHandoffs(
      { userId },
      {
        repository,
        evidence,
        notifier,
        createId: () => "id-1",
        now: () => now,
        delayDays: 7,
        maxReminders: 3,
      },
    );

    expect(result.unconfirmedCount).toBe(1);
    expect(result.nudgesEnqueued).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it("enqueues repeating nudges at 7-day cadence capped at maxReminders", async () => {
    const repository = new InMemoryCareerGrowthRepository();
    const { notifier, enqueued } = makeFakeNotifier();

    const project: GrowthProject = {
      id: "project-1",
      userId,
      sourceRecommendationId: "rec-1",
      title: "Distributed Rate Limiter",
      objective: "Build a rate limiter",
      status: "completed",
      startDate: "2026-07-01",
      targetDate: "2026-07-20",
      estimatedHoursPerWeek: 5,
      progress: 100,
      expectedEvidence: ["GitHub repo"],
      supportingCampaignIds: [],
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-20T00:00:00Z",
      completedAt: "2026-07-20T00:00:00Z", // 31 days ago (~4.4 intervals)
    };
    await repository.insertProject(project);

    const evidence = {
      getCurrent: async () => null,
    };

    let idCounter = 1;
    const result = await nudgeUnconfirmedHandoffs(
      { userId },
      {
        repository,
        evidence,
        notifier,
        createId: () => `id-${idCounter++}`,
        now: () => now,
        delayDays: 7,
        maxReminders: 3,
      },
    );

    expect(result.unconfirmedCount).toBe(1);
    // Capped at 3 reminders even though 31 days > 28 days
    expect(result.nudgesEnqueued).toBe(3);
    expect(enqueued).toHaveLength(3);
    expect(enqueued[0]?.idempotencyKey).toBe("growth-nudge:project-1:1");
    expect(enqueued[1]?.idempotencyKey).toBe("growth-nudge:project-1:2");
    expect(enqueued[2]?.idempotencyKey).toBe("growth-nudge:project-1:3");
  });

  it("is idempotent on subsequent runs", async () => {
    const repository = new InMemoryCareerGrowthRepository();
    const { notifier, enqueued } = makeFakeNotifier();

    const project: GrowthProject = {
      id: "project-1",
      userId,
      sourceRecommendationId: "rec-1",
      title: "Distributed Rate Limiter",
      objective: "Build a rate limiter",
      status: "completed",
      startDate: "2026-07-01",
      targetDate: "2026-08-01",
      estimatedHoursPerWeek: 5,
      progress: 100,
      expectedEvidence: ["GitHub repo"],
      supportingCampaignIds: [],
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
      completedAt: "2026-08-01T00:00:00Z", // 19 days ago (2 intervals)
    };
    await repository.insertProject(project);

    const evidence = {
      getCurrent: async () => null,
    };

    let idCounter = 1;
    const firstRun = await nudgeUnconfirmedHandoffs(
      { userId },
      {
        repository,
        evidence,
        notifier,
        createId: () => `id-${idCounter++}`,
        now: () => now,
        delayDays: 7,
        maxReminders: 3,
      },
    );

    expect(firstRun.nudgesEnqueued).toBe(2);

    const secondRun = await nudgeUnconfirmedHandoffs(
      { userId },
      {
        repository,
        evidence,
        notifier,
        createId: () => `id-${idCounter++}`,
        now: () => now,
        delayDays: 7,
        maxReminders: 3,
      },
    );

    expect(secondRun.nudgesEnqueued).toBe(0); // Deduplicated
    expect(enqueued).toHaveLength(2);
  });
});
