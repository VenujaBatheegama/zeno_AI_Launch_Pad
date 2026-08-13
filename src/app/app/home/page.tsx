import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import type { CampaignDashboard } from "@/modules/career-campaign/application/dashboard";
import { RunZenoButton } from "@/modules/career-campaign/presentation/run-zeno-button";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication, getCareerEvidenceApplication } from "@/server/composition-root";
import { requireProfile } from "@/server/identity";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const emptyDashboard = (): CampaignDashboard => ({
  needsAttention: {
    pendingRecommendations: 0,
    readyPackets: 0,
    dueFollowUps: 0,
  },
  funnel: {
    jobsDiscovered: 0,
    recommendationsMade: 0,
    accepted: 0,
    applied: 0,
    interviews: 0,
  },
  bottleneck: null,
  learned: [],
  completedWork: {
    runs: 0,
    lastRunStatus: null,
    packetsReady: 0,
  },
  growthActions: [],
});

function isMissingCampaignSchema(error: unknown): boolean {
  if (!(error instanceof CareerCampaignError)) return false;
  if (error.code !== "PERSISTENCE_FAILED") return false;
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const message = `${cause?.message ?? ""} ${error.message}`.toLocaleLowerCase();
  return (
    cause?.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
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

  const campaign = getCareerCampaignApplication(userId);
  const evidencePromise = getCareerEvidenceApplication(userId).getCurrent();

  let dashboard = emptyDashboard();
  let schemaMissing = false;
  const [evidence, dashboardResult] = await Promise.all([
    evidencePromise,
    campaign.getDashboard().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);

  if (dashboardResult.ok) {
    dashboard = dashboardResult.value;
  } else if (isMissingCampaignSchema(dashboardResult.error)) {
    schemaMissing = true;
  } else {
    throw dashboardResult.error;
  }

  const name = profile.displayName?.trim() || "there";
  const incomplete = profile.onboardingStatus !== "completed";

  return (
    <div className="space-y-6">
      {schemaMissing ? (
        <section className="rounded-[var(--zeno-radius-lg)] border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-950">
            Campaign database migration required
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900">
            Tables from{" "}
            <code className="rounded bg-amber-100 px-1">
              supabase/migrations/0010_career_campaign.sql
            </code>{" "}
            are not in your Supabase project yet. Apply that migration in the
            Supabase SQL editor (or via the Supabase CLI), then reload this
            page.
          </p>
        </section>
      ) : null}

      {incomplete ? (
        <section className="rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border-hover)] bg-[var(--zeno-violet-wash)] p-5 shadow-[var(--zeno-shadow-sm)]">
          <h2 className="text-lg font-semibold text-[var(--zeno-ink)]">
            Complete your Zeno profile
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--zeno-ink-muted)]">
            Zeno needs a verified career profile before campaign recommendations
            can run.
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
        <h1 className="mt-2 font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em] text-[var(--zeno-ink)]">
          Your job-search campaign
        </h1>
        <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
          {evidence?.status === "verified"
            ? "Verified profile ready."
            : "Profile not verified yet."}{" "}
          Last run: {dashboard.completedWork.lastRunStatus ?? "none"}
        </p>
        <div className="mt-6">
          <RunZenoButton disabled={incomplete || evidence?.status !== "verified" || schemaMissing} />
        </div>
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Needs attention</h2>
        {dashboard.needsAttention.pendingRecommendations === 0 &&
        dashboard.needsAttention.readyPackets === 0 &&
        dashboard.needsAttention.dueFollowUps === 0 ? (
          <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
            Nothing waiting — run Zeno or update preferences.
          </p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--zeno-ink-muted)]">
            {dashboard.needsAttention.pendingRecommendations > 0 ? (
              <li>
                <Link href="/app/recommendations" className="font-semibold text-[var(--zeno-primary)]">
                  {dashboard.needsAttention.pendingRecommendations} recommendation(s)
                </Link>{" "}
                awaiting review
              </li>
            ) : null}
            {dashboard.needsAttention.readyPackets > 0 ? (
              <li>
                <Link href="/app/applications" className="font-semibold text-[var(--zeno-primary)]">
                  {dashboard.needsAttention.readyPackets} packet(s)
                </Link>{" "}
                ready
              </li>
            ) : null}
            {dashboard.needsAttention.dueFollowUps > 0 ? (
              <li>
                {dashboard.needsAttention.dueFollowUps} follow-up(s) due
              </li>
            ) : null}
          </ul>
        )}
        {dashboard.bottleneck ? (
          <p className="mt-3 text-sm text-[var(--zeno-ink)]">{dashboard.bottleneck}</p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
          <h2 className="text-base font-semibold">Search funnel</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--zeno-ink-muted)]">
            <li>Jobs discovered: {dashboard.funnel.jobsDiscovered}</li>
            <li>Recommendations: {dashboard.funnel.recommendationsMade}</li>
            <li>Accepted: {dashboard.funnel.accepted}</li>
            <li>Applied: {dashboard.funnel.applied}</li>
            <li>Interviews: {dashboard.funnel.interviews}</li>
          </ul>
        </div>
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
          <h2 className="text-base font-semibold">What Zeno learned</h2>
          {dashboard.learned.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
              Explicit rejection feedback will appear here.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-[var(--zeno-ink-muted)]">
              {dashboard.learned.map((item) => (
                <li key={`${item.signalType}:${item.signalValue}`}>
                  {item.signalType} · {item.signalValue} ×{item.count}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Completed work</h2>
        <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
          {dashboard.completedWork.runs} run(s) ·{" "}
          {dashboard.completedWork.packetsReady} packet(s) ready
        </p>
        {dashboard.growthActions.length > 0 ? (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-semibold">Growth actions</h3>
            {dashboard.growthActions.map((action) => (
              <div key={action.id} className="text-sm text-[var(--zeno-ink-muted)]">
                <p className="font-medium text-[var(--zeno-ink)]">{action.gapLabel}</p>
                <p>{action.whyItMatters}</p>
                <p className="mt-1">{action.suggestedAction}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
