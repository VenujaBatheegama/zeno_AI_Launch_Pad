import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";
import { requireProfile } from "@/server/identity";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const userId = await requireUserId();
  const profile = await requireProfile();

  if (
    profile.onboardingStatus === "not_started" ||
    (profile.onboardingStatus === "in_progress" &&
      profile.onboardingProgress === 0)
  ) {
    redirect("/onboarding");
  }

  const evidence = await getCareerEvidenceApplication(userId).getCurrent();
  const evidenceData = evidence?.evidence;
  const counts = evidenceData
    ? {
        experience: evidenceData.work_experience.length,
        projects: evidenceData.projects.length,
        skills: evidenceData.skills.length,
      }
    : { experience: 0, projects: 0, skills: 0 };

  const incomplete = profile.onboardingStatus !== "completed";
  const name = profile.displayName?.trim() || "there";

  return (
    <div className="space-y-6">
      {incomplete ? (
        <section className="rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border-hover)] bg-[var(--zeno-violet-wash)] p-5 shadow-[var(--zeno-shadow-sm)]">
          <h2 className="text-lg font-semibold text-[var(--zeno-ink)]">
            Complete your Zeno profile
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--zeno-ink-muted)]">
            Zeno needs a little more information before it can tailor strong CVs
            and recommend suitable jobs.
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--zeno-primary-deep)]">
            You&apos;re {profile.onboardingProgress}% of the way there.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--zeno-primary-deep)]"
          >
            Continue setup
          </Link>
        </section>
      ) : null}

      <section className="rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-sm)] sm:p-8">
        <p className="text-sm font-medium text-[var(--zeno-ink-muted)]">
          {greeting()}, {name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.01em] text-[var(--zeno-ink)]">
          {incomplete
            ? "Your Zeno profile is still taking shape."
            : "Your Zeno profile is ready."}
        </h1>
        <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
          {counts.experience} experience · {counts.projects} projects ·{" "}
          {counts.skills} skills
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/jobs"
            className="inline-flex rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--zeno-primary-deep)]"
          >
            Find matching jobs
          </Link>
          <Link
            href="/app/career-profile"
            className="inline-flex rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--zeno-ink)] hover:border-[var(--zeno-border-hover)]"
          >
            View career profile
          </Link>
          <Link
            href="/app/cvs"
            className="inline-flex rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--zeno-ink)] hover:border-[var(--zeno-border-hover)]"
          >
            Generate a CV
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
          <h2 className="text-base font-semibold">Recommended next step</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--zeno-ink-muted)]">
            Discover roles that match your verified experience.
          </p>
          <Link
            href="/app/jobs"
            className="mt-4 inline-flex text-sm font-semibold text-[var(--zeno-primary)] hover:underline"
          >
            Open Jobs
          </Link>
        </div>
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
          <h2 className="text-base font-semibold">Recent CVs</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--zeno-ink-muted)]">
            Tailored CVs will appear here after you generate one for a job.
          </p>
        </div>
      </section>
    </div>
  );
}
