import Link from "next/link";

import { CareerIntelligenceWorkspace } from "@/modules/career-intelligence/presentation/career-intelligence-workspace";
import {
  getCareerIntelligenceApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function MatchingPage() {
  const intelligence = getCareerIntelligenceApplication();
  const jobsApp = getJobDiscoveryApplication();
  const [assessment, plan, matches, jobs, capabilityProfile, profile] =
    await Promise.all([
      intelligence.getAssessment(),
      intelligence.getPlan(),
      intelligence.listMatches(),
      jobsApp.listJobs(),
      intelligence.getCapabilityProfile().catch((error) => {
        console.error("Capability profile unavailable on /matching:", error);
        return null;
      }),
      jobsApp.getProfile(),
    ]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Zeno
            </p>
            <div className="flex gap-4 text-sm font-semibold text-slate-600">
              <Link href="/" className="hover:text-slate-950">
                Career evidence
              </Link>
              <Link href="/jobs" className="hover:text-slate-950">
                Job discovery
              </Link>
            </div>
          </div>
          <h1 className="mt-1 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Career intelligence and evidence-backed matching.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Preferences set direction first. Verified capability intelligence
            then ranks the best evidenced fit within that direction.
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
    </main>
  );
}
