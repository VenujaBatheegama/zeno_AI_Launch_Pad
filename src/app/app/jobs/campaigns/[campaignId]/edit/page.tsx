import { notFound } from "next/navigation";

import { JobCampaignForm } from "@/modules/career-campaign/presentation/job-campaign-form";
import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";
import { getServerConfig } from "@/server/config";

export const dynamic = "force-dynamic";

export default async function EditJobCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const userId = await requireUserId();
  const { campaignId } = await params;
  const campaign = await getCareerCampaignApplication(userId)
    .getJobCampaign(campaignId)
    .catch((error: unknown) => {
      if (error instanceof CareerCampaignError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    });
  if (!campaign) notFound();
  return (
    <JobCampaignForm
      mode="edit"
      campaign={campaign}
      defaultRole={campaign.primaryRole}
      defaultLocation={campaign.location}
      defaultWorkMode={campaign.workMode}
      defaultMinScore={
        campaign.minimumScore || getServerConfig().CAMPAIGN_RECOMMENDATION_MIN_SCORE
      }
    />
  );
}
