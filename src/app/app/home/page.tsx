import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { CareerFriendChat } from "@/modules/career-friend/presentation/career-friend-chat";
import { HomeGreeting } from "@/modules/product-shell/home-greeting";
import {
  ActivityStrip,
  type ActivityStat,
} from "@/modules/product-shell/ui/activity-strip";
import { classifyMissingMigration } from "@/lib/migration-guard";
import { requireUserId } from "@/server/auth";
import {
  getCareerCampaignApplication,
  getCareerEvidenceApplication,
} from "@/server/composition-root";
import { requireProfile, updateProfileOnboarding } from "@/server/identity";

export const dynamic = "force-dynamic";

function wrapCampaignError(error: unknown): unknown {
  // Surface PERSISTENCE_FAILED errors so classifyMissingMigration can inspect them.
  if (error instanceof CareerCampaignError && error.code === "PERSISTENCE_FAILED") {
    return error;
  }
  return null;
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
  const dashboardResult = await campaign.getDashboard().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  let migrationGap = null;
  if (!dashboardResult.ok) {
    const wrappedError = wrapCampaignError(dashboardResult.error);
    migrationGap = wrappedError ? classifyMissingMigration(wrappedError) : null;
    if (!migrationGap) {
      throw dashboardResult.error;
    }
  }

  const schemaMissing = migrationGap !== null;
  const name = profile.displayName?.trim() || "there";

  const evidenceApp = getCareerEvidenceApplication(userId);
  const currentEvidence = await evidenceApp.getCurrent().catch(() => null);

  let incomplete = profile.onboardingStatus !== "completed";
  if (incomplete && currentEvidence?.status === "verified") {
    await updateProfileOnboarding(userId, {
      onboardingStatus: "completed",
      onboardingCurrentStep: "completed",
      onboardingProgress: 100,
      careerProfileVerifiedAt:
        currentEvidence.verifiedAt ?? new Date().toISOString(),
      displayName:
        currentEvidence.evidence.profile.full_name ?? profile.displayName,
    });
    incomplete = false;
  }

  const isReadyToVerify =
    profile.onboardingStatus === "awaiting_verification" ||
    profile.onboardingProgress >= 100 ||
    currentEvidence !== null;

  const bannerTitle = isReadyToVerify
    ? "Verify your career profile"
    : `Complete your Zeno profile (${profile.onboardingProgress}%)`;

  const bannerDescription = isReadyToVerify
    ? "Your career details are extracted and ready. Confirm your profile to activate job campaigns, continuous search, and tailored CVs."
    : "Zeno needs your background details to match opportunities and build tailored documents.";

  const bannerHref = isReadyToVerify
    ? "/onboarding/review"
    : profile.onboardingMethod === "conversation"
      ? "/onboarding/chat"
      : profile.onboardingMethod === "cv_import"
        ? "/onboarding/import"
        : "/onboarding";

  const bannerCta = isReadyToVerify
    ? "Review & verify profile →"
    : "Continue setup →";

  const dashboard = dashboardResult.ok ? dashboardResult.value : null;

  const activityStats: ActivityStat[] = dashboard
    ? [
        {
          label: "in your inbox",
          value: dashboard.needsAttention.pendingRecommendations,
          href: "/app/recommendations",
          glyph: "bell",
          live: dashboard.needsAttention.pendingRecommendations > 0,
        },
        {
          label: "applications out",
          value: dashboard.funnel.applied,
          href: "/app/applications",
          glyph: "briefcase",
        },
      ]
    : [];

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center">
      <div className="space-y-8">
        {migrationGap ? (
          <section
            className="rounded-[var(--zeno-radius-md)] border p-5"
            style={{
              borderColor: "var(--zeno-warning)",
              backgroundColor: "var(--zeno-warning-soft)",
            }}
          >
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--zeno-warning)" }}
            >
              {migrationGap.feature} database migration required
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--zeno-ink-muted)]">
              {migrationGap.description} Apply{" "}
              <code className="rounded bg-[var(--zeno-surface-elevated)] px-1 text-[var(--zeno-ink)]">
                {migrationGap.migrationFile}
              </code>{" "}
              in the Supabase SQL editor (or via the Supabase CLI), then reload
              this page.
            </p>
          </section>
        ) : null}

        {incomplete ? (
          <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]">
            <h2 className="text-[15px] font-semibold text-[var(--zeno-ink)]">
              {bannerTitle}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--zeno-ink-muted)]">
              {bannerDescription}
            </p>
            <Link
              href={bannerHref}
              className="mt-3 inline-flex text-[13px] font-semibold text-[var(--zeno-primary-deep)] hover:underline"
            >
              {bannerCta}
            </Link>
          </section>
        ) : null}

        <HomeGreeting name={name} />

        {dashboard ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
                Jobs Discovered
              </p>
              <p className="mt-2 text-3xl font-[family-name:var(--zeno-font-display)] font-semibold text-[var(--zeno-ink)]">
                {dashboard.funnel.jobsDiscovered}
              </p>
            </div>
            <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
                Matches Found
              </p>
              <p className="mt-2 text-3xl font-[family-name:var(--zeno-font-display)] font-semibold text-[var(--zeno-ink)]">
                {dashboard.funnel.recommendationsMade}
              </p>
            </div>
            <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
                Interviews
              </p>
              <p className="mt-2 text-3xl font-[family-name:var(--zeno-font-display)] font-semibold text-[var(--zeno-primary-deep)]">
                {dashboard.funnel.interviews}
              </p>
            </div>
          </div>
        ) : null}

        {dashboard?.bottleneck ? (
          <section
            className="flex items-start gap-3 rounded-[var(--zeno-radius-md)] border px-5 py-4"
            style={{
              borderColor: "var(--zeno-primary-border)",
              backgroundColor: "var(--zeno-primary-soft)",
            }}
          >
            <div className="mt-0.5 text-[var(--zeno-primary-deep)]">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--zeno-primary-deep)]">
                Insight
              </h2>
              <p className="mt-1 text-sm text-[var(--zeno-primary-deep)]/90">
                {dashboard.bottleneck}
              </p>
            </div>
          </section>
        ) : null}

        {dashboard?.learned && dashboard.learned.length > 0 ? (
          <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="size-4 text-[var(--zeno-ink-faint)]" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
                AI Learnings
              </h2>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboard.learned.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-full bg-[var(--zeno-surface-elevated)] px-2.5 py-1 text-[12px] font-medium text-[var(--zeno-ink)]"
                >
                  <span className="mr-1.5 text-[var(--zeno-ink-muted)]">
                    {item.signalType}:
                  </span>
                  {item.signalValue.replace(/_/g, " ")}
                  <span className="ml-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--zeno-ink)] text-[10px] font-bold text-[var(--zeno-surface)]">
                    {item.count}
                  </span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {dashboard?.growthActions && dashboard.growthActions.length > 0 ? (
          <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="size-4 text-[var(--zeno-ink-faint)]" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 20V10M12 20V4M19 20v-7" />
                <path d="m4 8 6-5 5 4 5-4" />
              </svg>
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
                Recommended Skill Sprints
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {dashboard.growthActions.map((action) => (
                <div key={action.id} className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] p-3">
                  <h3 className="text-[14px] font-semibold text-[var(--zeno-ink)]">
                    {action.gapLabel}
                  </h3>
                  <p className="mt-1 text-[13px] text-[var(--zeno-ink-muted)] leading-relaxed">
                    {action.whyItMatters}
                  </p>
                  <div className="mt-2 inline-flex rounded bg-[var(--zeno-primary-soft)] px-2 py-1 text-[12px] font-medium text-[var(--zeno-primary-deep)]">
                    {action.suggestedAction}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <ActivityStrip stats={activityStats} />
        <CareerFriendChat featured disabled={schemaMissing || incomplete} />
      </div>
    </div>
  );
}
