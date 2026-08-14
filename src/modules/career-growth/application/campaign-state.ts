import type { CampaignGrowthState } from "../domain/schemas";
import type { CareerGrowthRepository } from "./ports";

export async function campaignGrowthState(
  input: { userId: string; campaignId: string },
  deps: { repository: CareerGrowthRepository },
): Promise<CampaignGrowthState> {
  const projects = (
    await deps.repository.listProjects({
      userId: input.userId,
      statuses: ["planned", "in_progress", "paused"],
    })
  ).filter((item) => item.supportingCampaignIds.includes(input.campaignId));
  if (projects.length > 0) {
    const current = projects[0]!;
    return {
      kind: "project_in_progress",
      projectId: current.id,
      count: projects.length,
      href: `/app/growth/projects/${current.id}`,
    };
  }
  const recommendations = await deps.repository.listRecommendations({
    userId: input.userId,
    campaignId: input.campaignId,
    statuses: ["pending", "opened"],
  });
  if (recommendations[0]) {
    return {
      kind: "recommendation_ready",
      recommendationId: recommendations[0].id,
      href: `/app/growth/recommendations/${recommendations[0].id}`,
    };
  }
  const pending = await deps.repository.listAssessmentRequests({
    userId: input.userId,
    campaignId: input.campaignId,
    statuses: ["pending", "processing", "failed_retryable"],
  });
  if (pending[0]) {
    return {
      kind: "assessing",
      requestId: pending[0].id,
      href: `/app/jobs/campaigns/${input.campaignId}`,
    };
  }
  return { kind: "none" };
}
