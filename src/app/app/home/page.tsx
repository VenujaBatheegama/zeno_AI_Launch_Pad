import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { CareerFriendChat } from "@/modules/career-friend/presentation/career-friend-chat";
import { HomeGreeting } from "@/modules/product-shell/home-greeting";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";
import { requireProfile } from "@/server/identity";

export const dynamic = "force-dynamic";

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
  const dashboardResult = await campaign.getDashboard().then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  let schemaMissing = false;
  if (!dashboardResult.ok) {
    if (isMissingCampaignSchema(dashboardResult.error)) {
      schemaMissing = true;
    } else {
      throw dashboardResult.error;
    }
  }

  const name = profile.displayName?.trim() || "there";
  const incomplete = profile.onboardingStatus !== "completed";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {schemaMissing ? (
        <section className="rounded-[20px] border border-amber-300 bg-amber-50 p-5">
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
