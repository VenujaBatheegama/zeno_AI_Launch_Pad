import { notFound } from "next/navigation";

import { JobCampaignDetail } from "@/modules/career-campaign/presentation/job-campaign-detail";
import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { LINKEDIN_GUEST_PROVIDER } from "@/modules/career-campaign/domain/canonical-search";
import { providerWarningFor } from "@/modules/career-campaign/application/manage-job-campaigns";
import { withJobDescriptionPreview } from "@/modules/job-discovery/domain/job";
import { requireUserId } from "@/server/auth";
import {
  getCareerCampaignApplication,
  getCareerCampaignCronServices,
  getCareerGrowthApplication,
  getCareerIntelligenceApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function JobCampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const userId = await requireUserId();
  const { campaignId } = await params;
  const app = getCareerCampaignApplication(userId);
  const campaign = await app.getJobCampaign(campaignId).catch((error: unknown) => {
    if (error instanceof CareerCampaignError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  });
  if (!campaign) notFound();

  const listings = await app.listCampaignListings(campaignId);
  const listingIds = listings.map((row) => row.listingId);
  const [matches, jobs, runs, health] = await Promise.all([
    listingIds.length
      ? getCareerIntelligenceApplication(userId).listMatches({ listingIds })
      : Promise.resolve([]),
    getJobDiscoveryApplication(userId).listJobs(),
    app.listCampaignRuns(campaignId),
    getCareerCampaignCronServices().freshRepository.getProviderHealth(
      LINKEDIN_GUEST_PROVIDER,
    ),
  ]);

  let growthState: Awaited<ReturnType<ReturnType<typeof getCareerGrowthApplication>["campaignState"]>> | undefined;
  try {
    growthState = await getCareerGrowthApplication(userId).campaignState(campaignId);
  } catch {
    growthState = undefined;
  }

  return (
    <JobCampaignDetail
      campaign={campaign}
      matches={matches}
      jobs={jobs.map(withJobDescriptionPreview)}
      runs={runs}
      providerWarning={providerWarningFor(
        health?.status ?? "ok",
        health?.cooldownUntil ?? null,
      )}
      growthState={growthState}
    />
  );
}
