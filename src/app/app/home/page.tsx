import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { ZyriconHomeExperience } from "@/modules/career-friend/presentation/zyricon-home-experience";
import { classifyMissingMigration } from "@/lib/migration-guard";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";
import { requireProfile } from "@/server/identity";

export const dynamic = "force-dynamic";

function wrapCampaignError(error: unknown): unknown {
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
    () => ({ ok: true as const }),
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {migrationGap ? (
        <section className="rounded-[24px] border border-amber-300/40 bg-amber-950/40 backdrop-blur-xl p-5 text-amber-200 shadow-xl">
          <h2 className="text-base font-semibold text-amber-300">
            {migrationGap.feature} database migration required
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-amber-200/80">
            {migrationGap.description} Apply{" "}
            <code className="rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-300">
              {migrationGap.migrationFile}
            </code>{" "}
            in the Supabase SQL editor, then reload this page.
          </p>
        </section>
      ) : null}

      {incomplete ? (
        <section className="rounded-[24px] border border-purple-500/30 bg-purple-950/40 backdrop-blur-xl px-6 py-4 text-purple-200 shadow-xl flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Complete your Zeno profile
            </h2>
            <p className="mt-0.5 text-xs text-purple-300/70">
              Zeno needs a verified career profile before automated campaign matches can run.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="shrink-0 rounded-full bg-purple-500/20 border border-purple-400/40 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-500/30 transition"
          >
            Continue setup →
          </Link>
        </section>
      ) : null}

      <ZyriconHomeExperience
        userName={name}
        disabled={schemaMissing || incomplete}
      />
    </div>
  );
}
