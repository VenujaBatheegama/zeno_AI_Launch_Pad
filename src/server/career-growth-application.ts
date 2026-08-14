import { randomUUID } from "node:crypto";

import { SupabaseCareerCampaignRepository } from "@/modules/career-campaign/infrastructure/supabase-career-campaign-repository";
import { SupabaseFreshWatchRepository } from "@/modules/career-campaign/infrastructure/supabase-fresh-watch-repository";
import { SupabaseEvidenceRepository } from "@/modules/career-evidence/infrastructure/supabase-evidence-repository";
import { SupabaseCareerIntelligenceRepository } from "@/modules/career-intelligence/infrastructure/supabase-career-intelligence-repository";
import { requestGrowthAssessment } from "@/modules/career-growth/application/request-assessment";
import { processGrowthAssessment } from "@/modules/career-growth/application/process-assessment";
import {
  dismissGrowthRecommendation,
  getGrowthRecommendation,
  openGrowthRecommendation,
  sendGrowthChatMessage,
} from "@/modules/career-growth/application/recommendations";
import {
  acceptGrowthRecommendation,
  exportGrowthProjectCalendar,
  getGrowthDashboard,
  getGrowthProject,
  updateGrowthMilestone,
  updateGrowthProject,
} from "@/modules/career-growth/application/projects";
import { listGrowthInboxItems } from "@/modules/career-growth/application/inbox";
import { campaignGrowthState } from "@/modules/career-growth/application/campaign-state";
import { ASSESSMENT_LEASE_MS } from "@/modules/career-growth/domain/policy";
import { GroqGrowthAdvisor } from "@/modules/career-growth/infrastructure/groq-growth-advisor";
import { SupabaseCareerGrowthRepository } from "@/modules/career-growth/infrastructure/supabase-career-growth-repository";
import type {
  GrowthCampaignReader,
  GrowthEvidenceReader,
  GrowthMarketReader,
} from "@/modules/career-growth/application/ports";

import { getServerConfig } from "./config";
import { getGroqKeyPool } from "./groq";
import { createSupabaseClient } from "./supabase-client";

export function getCareerGrowthApplication(userId: string) {
  return createCareerGrowthApplication(userId);
}

export type CareerGrowthApplication = ReturnType<
  typeof createCareerGrowthApplication
>;

function createCareerGrowthApplication(userId: string) {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const repository = new SupabaseCareerGrowthRepository(supabase);
  const fresh = new SupabaseFreshWatchRepository(supabase);
  const campaignRepo = new SupabaseCareerCampaignRepository(supabase);
  const evidenceRepo = new SupabaseEvidenceRepository(supabase);
  const intelligence = new SupabaseCareerIntelligenceRepository(supabase);
  const advisor = new GroqGrowthAdvisor(getGroqKeyPool(), config.GROQ_MODEL);
  const now = () => new Date();
  const caps = {
    marketMinAnalysedJobs: config.GROWTH_MARKET_MIN_ANALYSED_JOBS,
    assessmentLeaseMs: ASSESSMENT_LEASE_MS,
    publicAppBaseUrl: config.PUBLIC_APP_BASE_URL ?? "http://localhost:3000",
  };
  const campaigns: GrowthCampaignReader = {
    getCampaign: (id) => fresh.getCampaignById(id),
    listCampaigns: (uid) => fresh.listCampaignsByUserId(uid),
  };
  const evidence: GrowthEvidenceReader = {
    getCurrent: (uid) => evidenceRepo.getCurrent(uid),
  };
  const market: GrowthMarketReader = {
    async listAnalysedJobs(input) {
      const listings = await fresh.listCampaignListings(input.campaignId);
      const listingIds = listings.map((item) => item.listingId);
      if (listingIds.length === 0) return [];
      const [analyses, matches] = await Promise.all([
        intelligence.listJobAnalysesByListingIds(input.userId, listingIds),
        intelligence.listCurrentMatchAnalyses(input.userId),
      ]);
      const matchByListing = new Map(
        matches.map((item) => [item.listingId, item]),
      );
      return analyses.map((analysis) => ({
        listingId: analysis.listingId,
        analysisStatus: analysis.status,
        evidenceFitScore:
          matchByListing.get(analysis.listingId)?.evidenceFitScore ?? null,
        requirements: analysis.requirements,
        matches: matchByListing.get(analysis.listingId)?.matches ?? [],
      }));
    },
  };
  const notifier = {
    enqueueNotification: (input: Parameters<typeof campaignRepo.enqueueNotification>[0]) =>
      campaignRepo.enqueueNotification(input),
    suppressNotificationsForEntity: (
      input: Parameters<typeof campaignRepo.suppressNotificationsForEntity>[0],
    ) => campaignRepo.suppressNotificationsForEntity(input),
  };
  const deps = {
    repository,
    campaigns,
    evidence,
    market,
    advisor,
    notifier,
    caps,
    createId: randomUUID,
    now,
  };

  return {
    userId,
    requestAssessment: (input: {
      campaignId: string;
      mode: "preliminary" | "market_refined";
    }) =>
      requestGrowthAssessment(
        { userId, campaignId: input.campaignId, mode: input.mode },
        deps,
      ),
    processAssessment: (requestId: string) =>
      processGrowthAssessment(
        { requestId, owner: `user:${userId}`, userId },
        deps,
      ),
    listInbox: () => listGrowthInboxItems({ userId }, deps),
    campaignState: (campaignId: string) =>
      campaignGrowthState({ userId, campaignId }, deps),
    getRecommendation: async (recommendationId: string) => {
      await openGrowthRecommendation({ userId, recommendationId }, deps);
      const loaded = await getGrowthRecommendation(
        { userId, recommendationId },
        deps,
      );
      return {
        ...loaded,
        campaign: await campaigns.getCampaign(loaded.recommendation.campaignId),
      };
    },
    dismissRecommendation: (recommendationId: string, category?: string) =>
      dismissGrowthRecommendation(
        { userId, recommendationId, category },
        deps,
      ),
    sendMessage: (recommendationId: string, message: string) =>
      sendGrowthChatMessage({ userId, recommendationId, message }, deps),
    acceptRecommendation: (input: {
      recommendationId: string;
      startDate: string;
      targetDate: string;
      weeklyHours: number;
    }) =>
      acceptGrowthRecommendation(
        { userId, ...input },
        deps,
      ),
    getDashboard: () => getGrowthDashboard({ userId }, deps),
    getProject: (projectId: string) =>
      getGrowthProject({ userId, projectId }, deps),
    updateProject: (input: {
      projectId: string;
      status?: "planned" | "in_progress" | "paused" | "completed" | "abandoned";
      targetDate?: string;
      estimatedHoursPerWeek?: number;
    }) =>
      updateGrowthProject(
        { userId, ...input },
        deps,
      ),
    updateMilestone: (
      milestoneId: string,
      status: "todo" | "in_progress" | "completed" | "skipped",
    ) => updateGrowthMilestone({ userId, milestoneId, status }, deps),
    exportCalendar: (projectId: string) =>
      exportGrowthProjectCalendar({ userId, projectId }, deps),
  };
}

export async function requestGrowthAssessmentSafely(input: {
  userId: string;
  campaignId: string;
  mode: "preliminary" | "market_refined";
}) {
  try {
    return await getCareerGrowthApplication(input.userId).requestAssessment({
      campaignId: input.campaignId,
      mode: input.mode,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        scope: "career-growth",
        event: "request_failed",
        campaignId: input.campaignId,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return null;
  }
}

export async function processDueGrowthAssessments(limit = 5) {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const repository = new SupabaseCareerGrowthRepository(supabase);
  const claimed = await repository.claimDueAssessmentRequests({
    now: new Date().toISOString(),
    owner: "cron",
    leaseExpiresAt: new Date(Date.now() + ASSESSMENT_LEASE_MS).toISOString(),
    limit,
  });
  const results = [];
  for (const request of claimed) {
    try {
      results.push(
        await getCareerGrowthApplication(request.userId).processAssessment(
          request.id,
        ),
      );
    } catch (error) {
      results.push({
        requestId: request.id,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return { processed: results.length, results };
}
