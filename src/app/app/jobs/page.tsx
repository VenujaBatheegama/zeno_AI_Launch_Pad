import { JobsOverview } from "@/modules/career-campaign/presentation/jobs-overview";
import {
  campaignOriginLabel,
  type RecentOpportunity,
} from "@/modules/career-campaign/domain/job-campaign";
import { withJobDescriptionPreview } from "@/modules/job-discovery/domain/job";
import { requireUserId } from "@/server/auth";
import { getOrSetCached } from "@/server/cache/jobs-cache";
import {
  getCareerCampaignApplication,
  getCareerGrowthApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export async function fetchJobsWorkspaceData(userId: string) {
  return getOrSetCached(
    `jobs-workspace:${userId}`,
    async () => {
      const campaign = getCareerCampaignApplication(userId);
      const jobsApp = getJobDiscoveryApplication(userId);

      const [overview, campaigns, session, jobs] = await Promise.all([
        campaign.getJobsOverview(),
        campaign.listJobCampaigns(),
        campaign.getLatestInstantSearch(),
        jobsApp.listJobs({ limit: 15 }),
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

      const allCampaignListings = await Promise.all(
        campaigns.slice(0, 5).map(async (item) => ({
          campaign: item,
          listings: await campaign.listCampaignListings(item.id),
        })),
      );

      for (const { campaign: item, listings } of allCampaignListings) {
        if (recentOpportunities.length >= 5) break;
        for (const listing of listings) {
          if (recentOpportunities.length >= 5) break;
          const job = jobById.get(listing.listingId);
          if (!job) continue;
          if (
            recentOpportunities.some((row) => row.listingId === listing.listingId)
          ) {
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

      const growthByCampaignId: Record<
        string,
        Awaited<
          ReturnType<
            ReturnType<typeof getCareerGrowthApplication>["campaignState"]
          >
        >
      > = {};
      try {
        const growth = getCareerGrowthApplication(userId);
        await Promise.all(
          campaigns.map(async (item) => {
            growthByCampaignId[item.id] = await growth.campaignState(item.id);
          }),
        );
      } catch {
        // Growth schema may not be applied yet.
      }

      return {
        overview: { ...overview, recentOpportunities },
        campaigns,
        session,
        recentOpportunities,
        growthByCampaignId,
      };
    },
    45000,
  );
}

export default async function JobsPage() {
  const userId = await requireUserId();
  const data = await fetchJobsWorkspaceData(userId);

  return (
    <JobsOverview
      overview={data.overview}
      campaigns={data.campaigns}
      instantSearch={data.session}
      recentOpportunities={data.recentOpportunities}
      growthByCampaignId={data.growthByCampaignId}
    />
  );
}
