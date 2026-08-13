import { z } from "zod";

import { CareerCampaignError } from "../domain/errors";
import { signalFromDecisionReason } from "../domain/feedback-adjustment";
import {
  decisionReasonSchema,
  type ApplicationPacket,
  type JobRecommendation,
} from "../domain/schemas";
import type { CareerCampaignRepository } from "./ports";

export const recordRecommendationDecisionCommandSchema = z.object({
  userId: z.uuid(),
  recommendationId: z.uuid(),
  action: z.enum(["save", "accept", "reject"]),
  decisionReason: decisionReasonSchema.optional(),
  decisionNote: z.string().max(500).optional(),
});

export type RecordRecommendationDecisionCommand = z.infer<
  typeof recordRecommendationDecisionCommandSchema
>;

export async function recordRecommendationDecision(
  raw: RecordRecommendationDecisionCommand,
  deps: {
    repository: CareerCampaignRepository;
    createId: () => string;
    now: () => Date;
  },
): Promise<{
  recommendation: JobRecommendation;
  packet: ApplicationPacket | null;
}> {
  const command = recordRecommendationDecisionCommandSchema.parse(raw);
  const recommendation = await deps.repository.getRecommendation(
    command.userId,
    command.recommendationId,
  );
  if (!recommendation) {
    throw new CareerCampaignError("NOT_FOUND", "Recommendation not found.");
  }

  if (
    recommendation.status === "accepted" &&
    command.action === "accept"
  ) {
    const packet = await deps.repository.getPacketByRecommendation(
      command.userId,
      recommendation.id,
    );
    return { recommendation, packet };
  }

  if (
    recommendation.status === "rejected" ||
    recommendation.status === "expired"
  ) {
    throw new CareerCampaignError(
      "INVALID_TRANSITION",
      `Recommendation is already ${recommendation.status}.`,
    );
  }

  if (command.action === "reject" && !command.decisionReason) {
    throw new CareerCampaignError(
      "INVALID_INPUT",
      "A rejection reason is required.",
    );
  }

  const status =
    command.action === "save"
      ? "saved"
      : command.action === "accept"
        ? "accepted"
        : "rejected";

  const updated = await deps.repository.updateRecommendationDecision({
    userId: command.userId,
    recommendationId: recommendation.id,
    status,
    decisionReason: command.decisionReason ?? null,
    decisionNote: command.decisionNote ?? null,
    reviewedAt: deps.now().toISOString(),
  });

  if (command.action === "reject" && command.decisionReason) {
    const signal = signalFromDecisionReason(command.decisionReason);
    if (signal) {
      await deps.repository.addFeedbackSignal({
        id: deps.createId(),
        userId: command.userId,
        recommendationId: recommendation.id,
        signalType: signal.signalType,
        signalValue: signal.signalValue,
        weight: 1,
        createdAt: deps.now().toISOString(),
      });
    }
  }

  if (command.action !== "accept") {
    return { recommendation: updated, packet: null };
  }

  const { packet } = await deps.repository.createOrGetPacket({
    id: deps.createId(),
    userId: command.userId,
    recommendationId: recommendation.id,
    listingId: recommendation.listingId,
    evidenceSetId: null,
    evidenceVersion: null,
    jobMatchAnalysisId: recommendation.jobMatchAnalysisId,
    applicationUrl:
      recommendation.fitSummarySnapshot.applicationUrl ?? null,
    requestedAt: deps.now().toISOString(),
  });

  return { recommendation: updated, packet };
}
