import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { FluxHomeExperience } from "@/modules/career-friend/presentation/flux-home-experience";
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
    <div className="space-y-6">
      {migrationGap ? (
        <section className="rounded-[20px] border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h2 className="text-base font-semibold text-amber-900">
            {migrationGap.feature} database migration required
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-amber-800">
            {migrationGap.description} Apply{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-900">
              {migrationGap.migrationFile}
            </code>{" "}
            in the Supabase SQL editor, then reload this page.
          </p>
        </section>
      ) : null}

      {incomplete ? (
        <section className="rounded-[20px] border border-gray-200 bg-white p-5 shadow-sm flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Complete your Zeno profile
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Zeno needs a verified career profile before automated campaign matches can run.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="shrink-0 rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition"
          >
            Continue setup →
          </Link>
        </section>
      ) : null}

      <FluxHomeExperience
        userName={name}
        disabled={schemaMissing || incomplete}
      />
    </div>
  );
}
