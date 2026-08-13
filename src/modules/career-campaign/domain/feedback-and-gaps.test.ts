import { describe, expect, it } from "vitest";

import { applyFeedbackAdjustments } from "../domain/feedback-adjustment";
import { aggregateCampaignGaps, growthActionCopy } from "../domain/gap-aggregation";
import {
  verifyWhatsAppSignature,
  WhatsAppCloudNotificationSender,
} from "../infrastructure/whatsapp-cloud-sender";
import { createHmac } from "node:crypto";

describe("feedback adjustment", () => {
  it("requires multiple signals before penalizing and caps delta", () => {
    const candidates = [
      {
        listingId: "a",
        finalScore: 80,
        workMode: "remote",
        careerLevel: "stretch",
      },
      {
        listingId: "b",
        finalScore: 75,
        workMode: "onsite",
      },
    ];

    const oneSignal = applyFeedbackAdjustments(candidates, [
      {
        id: "1",
        userId: "u",
        recommendationId: null,
        signalType: "work_mode",
        signalValue: "mismatch",
        weight: 1,
        createdAt: "",
      },
    ]);
    expect(oneSignal[0]?.adjustedScore).toBe(80);

    const twoSignals = applyFeedbackAdjustments(candidates, [
      {
        id: "1",
        userId: "u",
        recommendationId: null,
        signalType: "work_mode",
        signalValue: "mismatch",
        weight: 1,
        createdAt: "",
      },
      {
        id: "2",
        userId: "u",
        recommendationId: null,
        signalType: "work_mode",
        signalValue: "mismatch",
        weight: 1,
        createdAt: "",
      },
      {
        id: "3",
        userId: "u",
        recommendationId: null,
        signalType: "seniority",
        signalValue: "mismatch",
        weight: 2,
        createdAt: "",
      },
    ]);
    expect(twoSignals.find((c) => c.listingId === "a")!.adjustedScore).toBeLessThan(
      80,
    );
    expect(
      80 - twoSignals.find((c) => c.listingId === "a")!.adjustedScore,
    ).toBeLessThanOrEqual(12);
  });
});

describe("gap aggregation", () => {
  it("builds growth actions only from repeated unsupported gaps in strong jobs", () => {
    const gaps = aggregateCampaignGaps({
      observations: [
        { listingId: "1", gaps: ["Kubernetes", "Go"], evidenceFitScore: 70 },
        { listingId: "2", gaps: ["Kubernetes"], evidenceFitScore: 65 },
        { listingId: "3", gaps: ["RareSkill"], evidenceFitScore: 90 },
        { listingId: "4", gaps: ["Weak"], evidenceFitScore: 40 },
      ],
      supportedSkillKeys: new Set(["go"]),
      minScore: 55,
      maxActions: 2,
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.gapKey).toBe("kubernetes");
    const copy = growthActionCopy(gaps[0]!);
    expect(copy.whyItMatters).toMatch(/Kubernetes/);
  });
});

describe("whatsapp adapter", () => {
  it("verifies signatures and mocks delivery", async () => {
    const secret = "test-app-secret";
    const rawBody = '{"ok":true}';
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(
      verifyWhatsAppSignature({
        appSecret: secret,
        rawBody,
        signatureHeader: `sha256=${digest}`,
      }),
    ).toBe(true);
    expect(
      verifyWhatsAppSignature({
        appSecret: secret,
        rawBody,
        signatureHeader: "sha256=deadbeef",
      }),
    ).toBe(false);

    const calls: unknown[] = [];
    const sender = new WhatsAppCloudNotificationSender({
      accessToken: "token",
      phoneNumberId: "phone",
      templateName: "zeno_recommendation",
      templateLanguage: "en",
      publicBaseUrl: "https://zeno.example",
      resolveWaId: async () => "15551234567",
      fetchImpl: async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
          status: 200,
        });
      },
    });

    const result = await sender.send({
      id: "n1",
      userId: "u1",
      eventType: "recommendation_created",
      channel: "whatsapp",
      relatedEntityType: "job_recommendation",
      relatedEntityId: "r1",
      status: "processing",
      payload: { title: "Backend Engineer" },
      idempotencyKey: "k",
      scheduledAt: "",
      sentAt: null,
      attemptCount: 1,
      lastError: null,
      createdAt: "",
      updatedAt: "",
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
