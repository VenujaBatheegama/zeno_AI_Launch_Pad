import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { CareerFriendChat } from "@/modules/career-friend/presentation/career-friend-chat";
import { HomeGreeting } from "@/modules/product-shell/home-greeting";
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
    <div className="mx-auto max-w-3xl space-y-8">
      {migrationGap ? (
        <section className="rounded-[20px] border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-950">
            {migrationGap.feature} database migration required
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900">
            {migrationGap.description} Apply{" "}
            <code className="rounded bg-amber-100 px-1">
              {migrationGap.migrationFile}
            </code>{" "}
            in the Supabase SQL editor (or via the Supabase CLI), then reload
            this page.
          </p>
        </section>
      ) : null}

      {incomplete ? (
        <section className="rounded-[20px] bg-[var(--zeno-violet-wash)] px-5 py-4">
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
      <CareerFriendChat featured disabled={schemaMissing || incomplete} />
    </div>
  );
}
