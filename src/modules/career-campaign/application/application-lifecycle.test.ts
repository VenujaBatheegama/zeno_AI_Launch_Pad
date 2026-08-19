import { describe, expect, it } from "vitest";

import { InMemoryCareerCampaignRepository } from "./fakes";
import { updateApplicationStatus } from "./application-lifecycle";
import type { JobApplication } from "../domain/schemas";

describe("updateApplicationStatus lifecycle and outcomes", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const appId = "00000000-0000-4000-8000-000000000010";
  const listingId = "00000000-0000-4000-8000-000000000020";
  const recommendationId = "00000000-0000-4000-8000-000000000030";
  const packetId = "00000000-0000-4000-8000-000000000040";
  const now = new Date("2026-08-20T12:00:00Z");

  function setupApplication(status: JobApplication["status"] = "applied") {
    const repository = new InMemoryCareerCampaignRepository();
    const app: JobApplication = {
      id: appId,
      userId,
      listingId,
      recommendationId,
      applicationPacketId: packetId,
      cvVariantId: null,
      status,
      appliedAt: "2026-08-10T00:00:00Z",
      followUpDueAt: "2026-08-17T00:00:00Z",
      interviewAt: null,
      outcomeAt: null,
      userNote: null,
      createdAt: "2026-08-10T00:00:00Z",
      updatedAt: "2026-08-10T00:00:00Z",
    };
    repository.applications.set(app.id, app);
    return { repository, app };
  }

  it("emits positive feedback signal (+1.0) on offer and sets outcomeAt", async () => {
    const { repository } = setupApplication("interview");

    const updated = await updateApplicationStatus(
      {
        userId,
        applicationId: appId,
        status: "offer",
      },
      {
        repository,
        createId: () => "00000000-0000-4000-8000-000000000099",
        now: () => now,
      },
    );

    expect(updated.status).toBe("offer");
    expect(updated.outcomeAt).toBe(now.toISOString());
    expect(updated.followUpDueAt).toBeNull();

    const signals = await repository.listFeedbackSignals(userId);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      userId,
      recommendationId,
      signalType: "application_outcome",
      signalValue: "offer",
      weight: 1.0,
    });
  });

  it("emits negative feedback signal (-0.5) on rejected", async () => {
    const { repository } = setupApplication("applied");

    const updated = await updateApplicationStatus(
      {
        userId,
        applicationId: appId,
        status: "rejected",
      },
      {
        repository,
        createId: () => "00000000-0000-4000-8000-000000000099",
        now: () => now,
      },
    );

    expect(updated.status).toBe("rejected");
    expect(updated.outcomeAt).toBe(now.toISOString());
    expect(updated.followUpDueAt).toBeNull();

    const signals = await repository.listFeedbackSignals(userId);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      userId,
      recommendationId,
      signalType: "application_outcome",
      signalValue: "rejected",
      weight: -0.5,
    });
  });

  it("emits neutral feedback signal (0.0) on withdrawn", async () => {
    const { repository } = setupApplication("applied");

    const updated = await updateApplicationStatus(
      {
        userId,
        applicationId: appId,
        status: "withdrawn",
      },
      {
        repository,
        createId: () => "00000000-0000-4000-8000-000000000099",
        now: () => now,
      },
    );

    expect(updated.status).toBe("withdrawn");
    expect(updated.outcomeAt).toBe(now.toISOString());
    expect(updated.followUpDueAt).toBeNull();

    const signals = await repository.listFeedbackSignals(userId);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      userId,
      recommendationId,
      signalType: "application_outcome",
      signalValue: "withdrawn",
      weight: 0.0,
    });
  });
});
