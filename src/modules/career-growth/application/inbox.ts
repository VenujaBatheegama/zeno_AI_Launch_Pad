import type { JobRecommendation } from "@/modules/career-campaign/domain/schemas";

import type { GrowthInboxItem, InboxItem, JobInboxItem } from "../domain/schemas";
import type { CareerGrowthRepository, GrowthCampaignReader } from "./ports";

export async function listGrowthInboxItems(
  input: { userId: string },
  deps: {
    repository: CareerGrowthRepository;
    campaigns: GrowthCampaignReader;
  },
): Promise<GrowthInboxItem[]> {
  const recommendations = await deps.repository.listRecommendations({
    userId: input.userId,
    statuses: ["pending", "opened"],
  });
  const campaigns = await deps.campaigns.listCampaigns(input.userId);
  const names = new Map(campaigns.map((item) => [item.id, item.name]));
  return recommendations
    .map((item) => ({
      kind: "growth" as const,
      id: item.id,
      recommendationId: item.id,
      campaignId: item.campaignId,
      campaignName: names.get(item.campaignId) ?? "Job campaign",
      title: item.title,
      reason: item.evidenceGap || item.summary,
      estimatedWeeks: item.estimatedWeeks,
      estimatedHoursPerWeek: item.estimatedHoursPerWeek,
      createdAt: item.createdAt,
      href: `/app/growth/recommendations/${item.id}`,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function toJobInboxItem(recommendation: JobRecommendation): JobInboxItem {
  const fit = recommendation.fitSummarySnapshot;
  return {
    kind: "job",
    id: recommendation.id,
    listingId: recommendation.listingId,
    title: fit.title ?? "Job recommendation",
    organizationName: fit.organizationName ?? null,
    reason: fit.explanation || "Explained job match from your campaign.",
    score: recommendation.scoreSnapshot.evidenceFitScore,
    createdAt: recommendation.createdAt,
    href: `/app/recommendations`,
  };
}

export function mergeInboxItems(input: {
  jobs: JobInboxItem[];
  growth: GrowthInboxItem[];
}): InboxItem[] {
  return [...input.growth, ...input.jobs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
