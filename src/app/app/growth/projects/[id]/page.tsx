import { notFound } from "next/navigation";

import { CareerGrowthError } from "@/modules/career-growth/domain/errors";
import { GrowthProjectTracker } from "@/modules/career-growth/presentation/growth-dashboard";
import { requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function GrowthProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const payload = await getCareerGrowthApplication(userId)
    .getProject(id)
    .catch((error: unknown) => {
      if (error instanceof CareerGrowthError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    });
  if (!payload) notFound();

  return (
    <GrowthProjectTracker
      project={payload.project}
      milestones={payload.milestones}
      recommendationId={payload.project.sourceRecommendationId}
    />
  );
}
