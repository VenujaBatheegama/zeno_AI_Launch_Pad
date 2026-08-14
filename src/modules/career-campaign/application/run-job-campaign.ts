import { CareerCampaignError } from "../domain/errors";
import { campaignIdCommandSchema } from "../domain/job-campaign";
import type {
  FreshWatchCaps,
  FreshWatchLogger,
  FreshWatchRepository,
  LinkedInFreshClient,
} from "./fresh-watch-ports";
import { defaultFreshWatchLogger } from "./fresh-watch-ports";
import type { CareerCampaignRepository } from "./ports";
import {
  processLinkedInFreshSearch,
  type LinkedInFreshSearchResult,
} from "./process-linkedin-fresh-search";
import { requireOwnedCampaign } from "./manage-job-campaigns";
import type { FreshAnalysisResult } from "./fresh-watch-ports";

export type RunJobCampaignNowResult = {
  campaignId: string;
  runId: string;
  status: "completed" | "failed" | "skipped";
  linkedIn: LinkedInFreshSearchResult | null;
  recommended: number;
};

const MANUAL_RUN_COOLDOWN_MS = 15_000;

export async function runJobCampaignNow(
  raw: unknown,
  deps: {
    repository: FreshWatchRepository;
    campaignRepository: CareerCampaignRepository;
    createId: () => string;
    now: () => Date;
    caps: FreshWatchCaps;
    linkedIn?: LinkedInFreshClient;
    analyseListing?: (input: {
      userId: string;
      listingId: string;
    }) => Promise<FreshAnalysisResult>;
    runBroadSearch?: (input: {
      campaignId: string;
      userId: string;
      runId: string;
    }) => Promise<{ recommended: number; status: string; listingIds: string[] }>;
    linkedInEnabled?: boolean;
    log?: FreshWatchLogger;
  },
): Promise<RunJobCampaignNowResult> {
  const command = campaignIdCommandSchema.parse(raw);
  const campaign = await requireOwnedCampaign(command, deps.repository);
  if (campaign.status === "archived") {
    throw new CareerCampaignError(
      "CONFLICT",
      "This campaign is archived and cannot be run.",
    );
  }
  if (campaign.status !== "active") {
    throw new CareerCampaignError(
      "CONFLICT",
      "Resume this campaign before running it.",
    );
  }

  const now = deps.now();
  const nowIso = now.toISOString();
  const log = deps.log ?? defaultFreshWatchLogger;
  const recent = (await deps.repository.listCampaignRuns(campaign.id, 1))[0];
  if (
    recent &&
    recent.origin === "manual" &&
    Date.parse(nowIso) - Date.parse(recent.startedAt) < MANUAL_RUN_COOLDOWN_MS
  ) {
    return {
      campaignId: campaign.id,
      runId: recent.id,
      status: recent.status === "failed" ? "failed" : "skipped",
      linkedIn: null,
      recommended: recent.qualifying,
    };
  }

  const leaseExpiresAt = new Date(
    Date.parse(nowIso) + deps.caps.schedulerLeaseMs,
  ).toISOString();
  const claimed = await deps.repository.tryClaimCampaignRunLease({
    campaignId: campaign.id,
    now: nowIso,
    leaseOwner: `manual:${campaign.id}`,
    leaseExpiresAt,
  });
  if (!claimed) {
    throw new CareerCampaignError(
      "RUN_IN_PROGRESS",
      "This campaign is already running.",
    );
  }

  const runId = deps.createId();
  await deps.repository.insertCampaignRun({
    id: runId,
    campaignId: campaign.id,
    origin: "manual",
    status: "running",
    discovered: 0,
    analysed: 0,
    qualifying: 0,
    startedAt: nowIso,
    completedAt: null,
    error: null,
  });

  try {
    await deps.repository.updateCanonicalSearch(campaign.canonicalSearchId, {
      nextDueAt: nowIso,
    });

    let linkedIn: LinkedInFreshSearchResult | null = null;
    if (deps.linkedIn && deps.analyseListing) {
      linkedIn = await processLinkedInFreshSearch(
        { canonicalSearchId: campaign.canonicalSearchId, runId },
        {
          repository: deps.repository,
          campaignRepository: deps.campaignRepository,
          linkedIn: deps.linkedIn,
          analyseListing: deps.analyseListing,
          createId: deps.createId,
          now: deps.now,
          caps: deps.caps,
          linkedInEnabled: deps.linkedInEnabled,
          log,
        },
      );
    }

    let broadRecommended = 0;
    if (deps.runBroadSearch) {
      const broad = await deps.runBroadSearch({
        campaignId: campaign.id,
        userId: campaign.userId,
        runId,
      });
      broadRecommended = broad.recommended;
      for (const listingId of broad.listingIds) {
        await deps.repository.attachCampaignListing({
          campaignId: campaign.id,
          listingId,
          discoverySource: "broad_hybrid",
          seenAt: nowIso,
          originatingRunId: runId,
        });
      }
    }

    const recommended = (linkedIn?.recommendationsCreated ?? 0) + broadRecommended;
    await deps.repository.updateCampaignRun(runId, {
      status: linkedIn?.error ? "failed" : "completed",
      discovered: linkedIn?.newlyPersisted ?? 0,
      analysed: linkedIn?.llmCalls ?? 0,
      qualifying: recommended,
      completedAt: deps.now().toISOString(),
      error: linkedIn?.error,
    });
    await deps.repository.updateCampaign(campaign.id, {
      lastBroadSearchAt: deps.runBroadSearch ? nowIso : campaign.lastBroadSearchAt,
      lastError: linkedIn?.error ?? null,
      updatedAt: deps.now().toISOString(),
    });
    return {
      campaignId: campaign.id,
      runId,
      status: linkedIn?.error ? "failed" : "completed",
      linkedIn,
      recommended,
    };
  } catch (error) {
    await deps.repository.updateCampaignRun(runId, {
      status: "failed",
      completedAt: deps.now().toISOString(),
      error: error instanceof Error ? error.message.slice(0, 300) : "failed",
    });
    throw error;
  } finally {
    await deps.repository.releaseBroadCampaignLease(campaign.id);
  }
}
