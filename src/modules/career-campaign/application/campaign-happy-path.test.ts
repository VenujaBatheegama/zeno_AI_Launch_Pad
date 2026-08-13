import { describe, expect, it } from "vitest";

import { InMemoryCareerCampaignRepository } from "./fakes";
import { recordRecommendationDecision } from "./recommendation-decisions";
import {
  markApplicationSubmitted,
  prepareApplicationPacket,
  updateApplicationStatus,
} from "./application-lifecycle";
import { runCampaignCheck } from "./run-campaign-check";
import { deliverPendingNotifications, InAppNotificationSender } from "./notifications";

const USER = "11111111-1111-4111-8111-111111111111";
const LISTING = "22222222-2222-4222-8222-222222222222";
const ANALYSIS = "33333333-3333-4333-8333-333333333333";

describe("career-campaign happy path", () => {
  it("runs check → recommend → accept → packet → applied → follow-up", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    const createId = (() => {
      let n = 0;
      return () => {
        n += 1;
        return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      };
    })();
    const now = () => new Date("2026-08-12T10:00:00.000Z");

    const run1 = await runCampaignCheck(
      {
        userId: USER,
        trigger: "manual",
        idempotencyKey: "manual:test:2026-08-12",
      },
      {
        repository,
        createId,
        now,
        caps: {
          analysisBatchSize: 5,
          maxRecommendations: 3,
          minScore: 50,
        },
        executeSearch: async () => ({
          jobsFound: 2,
          listingIds: [LISTING],
          searchProfileId: null,
          partialFailure: false,
          warnings: [],
        }),
        analyseListings: async () => [
          {
            listingId: LISTING,
            ok: true,
            matchAnalysisId: ANALYSIS,
            evidenceFitScore: 72,
            careerLevel: "aligned",
            hardConstraintEligible: true,
            analysisConfidence: "high",
            scoringPolicyVersion: "v2",
            explanation: "Strong TypeScript fit",
            topMatched: ["TypeScript"],
            primaryGaps: ["Kubernetes"],
            title: "Software Engineer",
            organizationName: "Acme",
            applicationUrl: "https://example.com/jobs/1",
          },
        ],
      },
    );

    expect(run1.run.status).toBe("completed");
    expect(run1.recommendedIds).toHaveLength(1);

    const run2 = await runCampaignCheck(
      {
        userId: USER,
        trigger: "manual",
        idempotencyKey: "manual:test:2026-08-12",
      },
      {
        repository,
        createId,
        now,
        caps: {
          analysisBatchSize: 5,
          maxRecommendations: 3,
          minScore: 50,
        },
        executeSearch: async () => {
          throw new Error("should not search again");
        },
        analyseListings: async () => [],
      },
    );
    expect(run2.reused).toBe(true);
    expect(run2.run.status).toBe("completed");

    const recommendationId = run1.recommendedIds[0]!;
    const decision = await recordRecommendationDecision(
      {
        userId: USER,
        recommendationId,
        action: "accept",
      },
      { repository, createId, now },
    );
    expect(decision.recommendation.status).toBe("accepted");
    expect(decision.packet).toBeTruthy();

    const packet = await prepareApplicationPacket(
      { userId: USER, packetId: decision.packet!.id },
      {
        repository,
        now,
        coverLetterGenerator: {
          async generate() {
            return {
              draft:
                "Dear Hiring Manager,\n\nI am applying for Software Engineer at Acme based on verified TypeScript experience.\n\nKind regards",
              meta: { model: "test" },
            };
          },
        },
        createTailoredCv: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
        }),
        loadPacketContext: async () => ({
          evidenceSetId: "55555555-5555-4555-8555-555555555555",
          evidenceVersion: 1,
          evidenceJson: { skills: [{ name: "TypeScript" }] },
          jobTitle: "Software Engineer",
          organizationName: "Acme",
          jobDescription: "Build APIs",
          matchedRequirements: ["TypeScript"],
          missingRequirements: ["Kubernetes"],
          applicationUrl: "https://example.com/jobs/1",
          jobMatchAnalysisId: ANALYSIS,
        }),
      },
    );
    expect(packet.status).toBe("ready");

    const application = await markApplicationSubmitted(
      { userId: USER, packetId: packet.id, source: "web" },
      { repository, createId, now, followUpDays: 7 },
    );
    expect(application.status).toBe("applied");
    expect(application.followUpDueAt).toBe("2026-08-19T10:00:00.000Z");

    const again = await markApplicationSubmitted(
      { userId: USER, packetId: packet.id, source: "web" },
      { repository, createId, now, followUpDays: 7 },
    );
    expect(again.id).toBe(application.id);

    const delivery = await deliverPendingNotifications({
      repository,
      now,
      senders: { in_app: new InAppNotificationSender() },
    });
    expect(delivery.delivered).toBeGreaterThan(0);

    const interviewed = await updateApplicationStatus(
      {
        userId: USER,
        applicationId: application.id,
        status: "interview",
        source: "web",
      },
      { repository, createId, now },
    );
    expect(interviewed.status).toBe("interview");
  });

  it("retries after a failed run instead of reusing it", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    const createId = (() => {
      let n = 0;
      return () => {
        n += 1;
        return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      };
    })();
    let searches = 0;

    await runCampaignCheck(
      {
        userId: USER,
        trigger: "manual",
        idempotencyKey: "manual:retry-test",
      },
      {
        repository,
        createId,
        now: () => new Date("2026-08-12T10:00:00.000Z"),
        caps: {
          analysisBatchSize: 5,
          maxRecommendations: 3,
          minScore: 50,
        },
        executeSearch: async () => {
          searches += 1;
          return {
            jobsFound: 1,
            listingIds: [LISTING],
            searchProfileId: null,
            partialFailure: false,
            warnings: [],
          };
        },
        analyseListings: async () => [
          { listingId: LISTING, ok: false, error: "rate limited" },
        ],
      },
    );

    const retry = await runCampaignCheck(
      {
        userId: USER,
        trigger: "manual",
        idempotencyKey: "manual:retry-test",
      },
      {
        repository,
        createId,
        now: () => new Date("2026-08-12T10:05:00.000Z"),
        caps: {
          analysisBatchSize: 5,
          maxRecommendations: 3,
          minScore: 50,
        },
        executeSearch: async () => {
          searches += 1;
          return {
            jobsFound: 1,
            listingIds: [LISTING],
            searchProfileId: null,
            partialFailure: false,
            warnings: [],
          };
        },
        analyseListings: async () => [
          {
            listingId: LISTING,
            ok: true,
            matchAnalysisId: ANALYSIS,
            evidenceFitScore: 80,
            careerLevel: "aligned",
            hardConstraintEligible: true,
            analysisConfidence: "high",
            scoringPolicyVersion: "v2",
            explanation: "fit",
            topMatched: ["TypeScript"],
            primaryGaps: [],
            title: "Engineer",
          },
        ],
      },
    );

    expect(searches).toBe(2);
    expect(retry.reused).toBe(false);
    expect(retry.recommendedIds).toHaveLength(1);
  });

  it("rejects without reason and isolates users", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    const other = "99999999-9999-4999-8999-999999999999";
    await repository.upsertRecommendation({
      id: "66666666-6666-4666-8666-666666666666",
      userId: USER,
      listingId: LISTING,
      jobMatchAnalysisId: ANALYSIS,
      campaignRunId: null,
      scoreSnapshot: {
        evidenceFitScore: 70,
        careerLevel: "aligned",
        hardConstraintEligible: true,
        analysisConfidence: "high",
        scoringPolicyVersion: "v2",
      },
      fitSummarySnapshot: {
        explanation: "fit",
        topMatched: [],
        primaryGaps: [],
        rankingReasons: [],
      },
      scoringPolicyVersion: "v2",
      recommendedAt: new Date().toISOString(),
    });

    await expect(
      recordRecommendationDecision(
        {
          userId: USER,
          recommendationId: "66666666-6666-4666-8666-666666666666",
          action: "reject",
        },
        {
          repository,
          createId: () => "77777777-7777-4777-8777-777777777777",
          now: () => new Date(),
        },
      ),
    ).rejects.toThrow(/rejection reason/i);

    const cross = await repository.getRecommendation(
      other,
      "66666666-6666-4666-8666-666666666666",
    );
    expect(cross).toBeNull();
  });
});
