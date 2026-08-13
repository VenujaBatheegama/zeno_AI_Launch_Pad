import { z } from "zod";

import { CareerCampaignError } from "../domain/errors";
import type { ApplicationPacket, JobApplication } from "../domain/schemas";
import {
  assertUserAppliedTransition,
  isTerminalApplicationStatus,
} from "../domain/application-transitions";
import { applicationStatusSchema } from "../domain/schemas";
import type {
  CareerCampaignRepository,
  CoverLetterGenerator,
} from "./ports";

export const prepareApplicationPacketCommandSchema = z.object({
  userId: z.uuid(),
  packetId: z.uuid(),
});

export type PrepareApplicationPacketCommand = z.infer<
  typeof prepareApplicationPacketCommandSchema
>;

export async function prepareApplicationPacket(
  raw: PrepareApplicationPacketCommand,
  deps: {
    repository: CareerCampaignRepository;
    coverLetterGenerator: CoverLetterGenerator;
    createTailoredCv: (input: {
      userId: string;
      listingId: string;
    }) => Promise<{ id: string }>;
    loadPacketContext: (input: {
      userId: string;
      listingId: string;
      recommendationId: string;
    }) => Promise<{
      evidenceSetId: string;
      evidenceVersion: number;
      evidenceJson: unknown;
      jobTitle: string;
      organizationName: string | null;
      jobDescription: string;
      matchedRequirements: string[];
      missingRequirements: string[];
      applicationUrl: string | null;
      jobMatchAnalysisId: string;
    }>;
    now: () => Date;
  },
): Promise<ApplicationPacket> {
  const command = prepareApplicationPacketCommandSchema.parse(raw);
  const packet = await deps.repository.getPacket(
    command.userId,
    command.packetId,
  );
  if (!packet) {
    throw new CareerCampaignError("NOT_FOUND", "Application packet not found.");
  }
  if (packet.status === "ready" && packet.cvVariantId && packet.coverLetterDraft) {
    return packet;
  }

  await deps.repository.updatePacket(command.userId, packet.id, {
    status: "preparing",
    failureCode: null,
    failureMessage: null,
  });

  try {
    const context = await deps.loadPacketContext({
      userId: command.userId,
      listingId: packet.listingId,
      recommendationId: packet.recommendationId,
    });

    const cv = await deps.createTailoredCv({
      userId: command.userId,
      listingId: packet.listingId,
    });

    const cover = await deps.coverLetterGenerator.generate({
      evidenceJson: context.evidenceJson,
      jobTitle: context.jobTitle,
      organizationName: context.organizationName,
      jobDescription: context.jobDescription,
      matchedRequirements: context.matchedRequirements,
      missingRequirements: context.missingRequirements,
      applicationUrl: context.applicationUrl,
    });

    return deps.repository.updatePacket(command.userId, packet.id, {
      status: "ready",
      cvVariantId: cv.id,
      coverLetterDraft: cover.draft,
      coverLetterMeta: cover.meta,
      applicationUrl: context.applicationUrl,
      evidenceSetId: context.evidenceSetId,
      evidenceVersion: context.evidenceVersion,
      jobMatchAnalysisId: context.jobMatchAnalysisId,
      readyAt: deps.now().toISOString(),
      failureCode: null,
      failureMessage: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Packet preparation failed";
    await deps.repository.updatePacket(command.userId, packet.id, {
      status: "failed",
      failureCode: "PREPARE_FAILED",
      failureMessage: message.slice(0, 400),
    });
    throw error instanceof CareerCampaignError
      ? error
      : new CareerCampaignError("AI_UNAVAILABLE", message, { cause: error });
  }
}

export const markApplicationSubmittedCommandSchema = z.object({
  userId: z.uuid(),
  applicationId: z.uuid().optional(),
  packetId: z.uuid().optional(),
  source: z.enum(["web", "whatsapp"]).default("web"),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export async function markApplicationSubmitted(
  raw: z.input<typeof markApplicationSubmittedCommandSchema>,
  deps: {
    repository: CareerCampaignRepository;
    createId: () => string;
    now: () => Date;
    followUpDays: number;
  },
): Promise<JobApplication> {
  const command = markApplicationSubmittedCommandSchema.parse(raw);
  let application: JobApplication | null = null;
  let packet: ApplicationPacket | null = null;

  if (command.applicationId) {
    application = await deps.repository.getApplication(
      command.userId,
      command.applicationId,
    );
  } else if (command.packetId) {
    packet = await deps.repository.getPacket(command.userId, command.packetId);
    if (!packet) {
      throw new CareerCampaignError("NOT_FOUND", "Application packet not found.");
    }
    application = await deps.repository.getApplicationByListing(
      command.userId,
      packet.listingId,
    );
  } else {
    throw new CareerCampaignError(
      "INVALID_INPUT",
      "applicationId or packetId is required.",
    );
  }

  if (!packet && application) {
    packet = await deps.repository.getPacket(
      command.userId,
      application.applicationPacketId,
    );
  }

  if (!packet || packet.status !== "ready") {
    throw new CareerCampaignError(
      "PACKET_NOT_READY",
      "Prepare a ready application packet before marking applied.",
    );
  }

  if (!application) {
    const recommendation = await deps.repository.getRecommendation(
      command.userId,
      packet.recommendationId,
    );
    if (!recommendation) {
      throw new CareerCampaignError("NOT_FOUND", "Recommendation not found.");
    }
    const created = await deps.repository.createOrGetApplication({
      id: deps.createId(),
      userId: command.userId,
      listingId: packet.listingId,
      recommendationId: packet.recommendationId,
      applicationPacketId: packet.id,
      cvVariantId: packet.cvVariantId,
      status: "ready",
      createdAt: deps.now().toISOString(),
    });
    application = created.application;
  }

  if (application.status === "applied") {
    return application;
  }

  assertUserAppliedTransition(application.status, "applied", command.source);

  const appliedAt = deps.now();
  const followUpDueAt = new Date(
    appliedAt.getTime() + deps.followUpDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const updated = await deps.repository.updateApplication(
    command.userId,
    application.id,
    {
      status: "applied",
      appliedAt: appliedAt.toISOString(),
      followUpDueAt,
      cvVariantId: packet.cvVariantId,
    },
  );

  await deps.repository.appendApplicationEvent({
    id: deps.createId(),
    applicationId: application.id,
    userId: command.userId,
    fromStatus: application.status,
    toStatus: "applied",
    eventType: "status_changed",
    source: command.source,
    metadata: {},
    idempotencyKey:
      command.idempotencyKey ??
      `app:${application.id}:applied:${appliedAt.toISOString().slice(0, 10)}`,
    occurredAt: appliedAt.toISOString(),
  });

  await deps.repository.enqueueNotification({
    id: deps.createId(),
    userId: command.userId,
    eventType: "follow_up_due",
    channel: "in_app",
    relatedEntityType: "job_application",
    relatedEntityId: application.id,
    payload: {
      followUpDueAt,
      listingId: application.listingId,
    },
    idempotencyKey: `followup:${application.id}:${followUpDueAt.slice(0, 10)}`,
    scheduledAt: followUpDueAt,
  });

  return updated;
}

export const updateApplicationStatusCommandSchema = z.object({
  userId: z.uuid(),
  applicationId: z.uuid(),
  status: applicationStatusSchema.exclude(["ready", "applied"]),
  source: z.enum(["web", "whatsapp"]).default("web"),
  userNote: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export async function updateApplicationStatus(
  raw: z.input<typeof updateApplicationStatusCommandSchema>,
  deps: {
    repository: CareerCampaignRepository;
    createId: () => string;
    now: () => Date;
  },
): Promise<JobApplication> {
  const command = updateApplicationStatusCommandSchema.parse(raw);
  const application = await deps.repository.getApplication(
    command.userId,
    command.applicationId,
  );
  if (!application) {
    throw new CareerCampaignError("NOT_FOUND", "Application not found.");
  }
  if (application.status === command.status) {
    return application;
  }

  assertUserAppliedTransition(
    application.status,
    command.status,
    command.source,
  );

  const occurredAt = deps.now().toISOString();
  const patch: Parameters<CareerCampaignRepository["updateApplication"]>[2] = {
    status: command.status,
    userNote: command.userNote ?? application.userNote,
  };
  if (command.status === "interview") {
    patch.interviewAt = occurredAt;
  }
  if (isTerminalApplicationStatus(command.status)) {
    patch.outcomeAt = occurredAt;
    patch.followUpDueAt = null;
  }

  const updated = await deps.repository.updateApplication(
    command.userId,
    application.id,
    patch,
  );

  await deps.repository.appendApplicationEvent({
    id: deps.createId(),
    applicationId: application.id,
    userId: command.userId,
    fromStatus: application.status,
    toStatus: command.status,
    eventType: "status_changed",
    source: command.source,
    metadata: command.userNote ? { userNote: command.userNote } : {},
    idempotencyKey:
      command.idempotencyKey ??
      `app:${application.id}:${command.status}:${occurredAt}`,
    occurredAt,
  });

  if (isTerminalApplicationStatus(command.status) || command.status === "interview") {
    await deps.repository.suppressNotificationsForEntity({
      userId: command.userId,
      relatedEntityType: "job_application",
      relatedEntityId: application.id,
      eventTypes: ["follow_up_due"],
    });
  }

  return updated;
}
