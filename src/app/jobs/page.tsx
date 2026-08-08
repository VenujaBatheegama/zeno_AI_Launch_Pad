import Link from "next/link";

import { JobDiscoveryWorkspace } from "@/modules/job-discovery/presentation/job-discovery-workspace";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const application = getJobDiscoveryApplication();
  const [profile, jobs] = await Promise.all([
    application.getProfile(),
    application.listJobs(),
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
              <Link href="/matching" className="hover:text-slate-950">
                Matching
              </Link>
            </div>
          </div>
          <h1 className="mt-1 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Discover real job opportunities.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Set your preferences, search live listings, and keep the jobs you
            want to revisit.
          </p>
        </header>
        <JobDiscoveryWorkspace initialProfile={profile} initialJobs={jobs} />
      </div>
    </main>
  );
}
