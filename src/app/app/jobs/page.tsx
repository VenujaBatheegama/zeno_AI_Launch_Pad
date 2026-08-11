import { CareerIntelligenceWorkspace } from "@/modules/career-intelligence/presentation/career-intelligence-workspace";
import { requireUserId } from "@/server/auth";
import {
  getCareerIntelligenceApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const userId = await requireUserId();
  const intelligence = getCareerIntelligenceApplication(userId);
  const jobsApp = getJobDiscoveryApplication(userId);
  const [assessment, plan, matches, jobs, profile] = await Promise.all([
    intelligence.getAssessment(),
    intelligence.getPlan(),
    intelligence.listMatches(),
    jobsApp.listJobs(),
    jobsApp.getProfile(),
  ]);

  return (
    <CareerIntelligenceWorkspace
      initialAssessment={assessment}
      initialPlan={plan}
      initialMatches={matches}
      initialJobs={jobs}
      initialPreferences={profile?.preferences ?? null}
      analysisBatchSize={intelligence.analysisBatchSize}
    />
  );
}
