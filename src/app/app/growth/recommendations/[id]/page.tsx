import { notFound } from "next/navigation";

import { CareerGrowthError } from "@/modules/career-growth/domain/errors";
import { GrowthRecommendationWorkspace } from "@/modules/career-growth/presentation/growth-recommendation-workspace";
import { requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function GrowthRecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const payload = await getCareerGrowthApplication(userId)
    .getRecommendation(id)
    .catch((error: unknown) => {
      if (error instanceof CareerGrowthError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    });
  if (!payload) notFound();

  return (
    <GrowthRecommendationWorkspace
      recommendation={payload.recommendation}
      assessment={payload.assessment}
      campaignName={payload.campaign?.name ?? "Job campaign"}
      campaignId={payload.recommendation.campaignId}
      messages={payload.messages}
    />
  );
}
