import { CareerIntelligenceWorkspace } from "@/modules/career-intelligence/presentation/career-intelligence-workspace";
import { withJobDescriptionPreview } from "@/modules/job-discovery/domain/job";
import { requireUserId } from "@/server/auth";
import {
  getCareerCampaignApplication,
  getCareerIntelligenceApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function InstantSearchPage() {
  const userId = await requireUserId();
  const intelligence = getCareerIntelligenceApplication(userId);
  const jobsApp = getJobDiscoveryApplication(userId);
  const campaign = getCareerCampaignApplication(userId);
  const [assessment, plan, matches, jobs, profile, session] = await Promise.all([
    intelligence.getAssessment(),
    intelligence.getPlan(),
    intelligence.listMatches(),
    jobsApp.listJobs(),
    jobsApp.getProfile(),
    campaign.getLatestInstantSearch(),
  ]);

  const sessionListingIds = session?.listingIds ?? [];
  const scopedMatches =
    sessionListingIds.length > 0
      ? await intelligence.listMatches({ listingIds: sessionListingIds })
      : [];

  return (
    <CareerIntelligenceWorkspace
      initialAssessment={assessment}
      initialPlan={plan}
      initialMatches={scopedMatches.length ? scopedMatches : matches.filter((item) =>
        sessionListingIds.includes(item.listingId),
      )}
      initialJobs={jobs.map(withJobDescriptionPreview)}
      initialPreferences={profile?.preferences ?? null}
      analysisBatchSize={intelligence.analysisBatchSize}
      sessionListingIds={sessionListingIds}
    />
  );
}
