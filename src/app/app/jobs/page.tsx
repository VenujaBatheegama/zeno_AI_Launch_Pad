import { JobsOverview } from "@/modules/career-campaign/presentation/jobs-overview";
import { campaignOriginLabel, type RecentOpportunity } from "@/modules/career-campaign/domain/job-campaign";
import { withJobDescriptionPreview } from "@/modules/job-discovery/domain/job";
import { requireUserId } from "@/server/auth";
import {
  getCareerCampaignApplication,
  getCareerGrowthApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const userId = await requireUserId();
  const campaign = getCareerCampaignApplication(userId);
  const jobsApp = getJobDiscoveryApplication(userId);
  const [overview, campaigns, session, jobs] = await Promise.all([
    campaign.getJobsOverview(),
    campaign.listJobCampaigns(),
    campaign.getLatestInstantSearch(),
    jobsApp.listJobs(),
  ]);

  const jobById = new Map(
    jobs.map((job) => [job.listing_id, withJobDescriptionPreview(job)]),
  );
  const recentOpportunities: RecentOpportunity[] = [];
  if (session) {
    for (const listingId of session.listingIds) {
      if (recentOpportunities.length >= 5) break;
      const job = jobById.get(listingId);
      if (!job) continue;
      recentOpportunities.push({
        listingId,
        title: job.title,
        organizationName: job.organization_name,
        originLabel: "Instant search",
        href: "/app/jobs/search",
        seenAt: session.completedAt ?? session.startedAt,
      });
    }
  }
  const growthByCampaignId: Record<
    string,
    Awaited<ReturnType<ReturnType<typeof getCareerGrowthApplication>["campaignState"]>>
  > = {};

  const topCampaigns = campaigns.slice(0, 5);
  const [campaignListingsResults, growthResults] = await Promise.all([
    Promise.all(
      topCampaigns.map((c) =>
        campaign.listCampaignListings(c.id).catch(() => []),
      ),
    ),
    Promise.all(
      campaigns.map(async (item) => {
        try {
          const state = await getCareerGrowthApplication(userId).campaignState(
            item.id,
          );
          return { id: item.id, state };
        } catch {
          return { id: item.id, state: null };
        }
      }),
    ),
  ]);

  for (const { id, state } of growthResults) {
    if (state) {
      growthByCampaignId[id] = state;
    }
  }

  for (let i = 0; i < topCampaigns.length; i++) {
    if (recentOpportunities.length >= 5) break;
    const item = topCampaigns[i];
    const listings = campaignListingsResults[i] ?? [];
    for (const listing of listings) {
      if (recentOpportunities.length >= 5) break;
      const job = jobById.get(listing.listingId);
      if (!job) continue;
      if (recentOpportunities.some((row) => row.listingId === listing.listingId)) {
        continue;
      }
      recentOpportunities.push({
        listingId: listing.listingId,
        title: job.title,
        organizationName: job.organization_name,
        originLabel: campaignOriginLabel(item),
        href: `/app/jobs/campaigns/${item.id}`,
        seenAt: listing.lastSeenAt,
      });
    }
  }

  return (
    <JobsOverview
      overview={{ ...overview, recentOpportunities }}
      campaigns={campaigns}
      instantSearch={session}
      recentOpportunities={recentOpportunities}
      growthByCampaignId={growthByCampaignId}
    />
  );
}
