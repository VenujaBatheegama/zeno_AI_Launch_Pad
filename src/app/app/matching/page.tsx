import { CareerIntelligenceWorkspace } from "@/modules/career-intelligence/presentation/career-intelligence-workspace";
import { requireUserId } from "@/server/auth";
import {
  getCareerIntelligenceApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function MatchingPage() {
  const userId = await requireUserId();
  const intelligence = getCareerIntelligenceApplication(userId);
  const jobsApp = getJobDiscoveryApplication(userId);
  const [assessment, plan, matches, jobs, capabilityProfile, profile] =
    await Promise.all([
      intelligence.getAssessment(),
      intelligence.getPlan(),
      intelligence.listMatches(),
      jobsApp.listJobs(),
      intelligence.getCapabilityProfile().catch((error) => {
        console.error("Capability profile unavailable:", error);
        return null;
      }),
      jobsApp.getProfile(),
    ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--zeno-ink)]">
          Find jobs with Zeno
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Tell Zeno what you are looking for, then search for opportunities that
          match your preferences.
        </p>
      </header>
      <CareerIntelligenceWorkspace
        initialAssessment={assessment}
        initialPlan={plan}
        initialMatches={matches}
        initialJobs={jobs}
        initialCapabilityProfile={capabilityProfile}
        initialPreferences={profile?.preferences ?? null}
        analysisBatchSize={intelligence.analysisBatchSize}
      />
    </div>
  );
}
