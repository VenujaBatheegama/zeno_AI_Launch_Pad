import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { CareerFriendChat } from "@/modules/career-friend/presentation/career-friend-chat";
import { HomeGreeting } from "@/modules/product-shell/home-greeting";
import { RibbonBackdrop } from "@/modules/product-shell/ui/ribbon-backdrop";
import {
  ActivityStrip,
  type ActivityStat,
} from "@/modules/product-shell/ui/activity-strip";
import { classifyMissingMigration } from "@/lib/migration-guard";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";
import { requireProfile } from "@/server/identity";

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
  const incomplete = profile.onboardingStatus !== "completed";
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
    <div className="relative isolate mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center">
      <RibbonBackdrop />

      <div className="relative z-10 space-y-8">
        {migrationGap ? (
          <section
            className="rounded-[var(--zeno-radius-md)] border p-5"
            style={{ borderColor: "var(--zeno-warning)", backgroundColor: "var(--zeno-warning-soft)" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--zeno-warning)" }}>
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
              Complete your Zeno profile
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--zeno-ink-muted)]">
              Zeno needs a verified career profile before campaign recommendations
              can run.
            </p>
            <Link
              href="/onboarding"
              className="mt-3 inline-flex text-[13px] font-semibold text-[var(--zeno-primary-deep)] hover:underline"
            >
              Continue setup
            </Link>
          </section>
        ) : null}

        <HomeGreeting name={name} />
        <ActivityStrip stats={activityStats} />
        <CareerFriendChat featured disabled={schemaMissing || incomplete} />
      </div>
    </div>
  );
}
