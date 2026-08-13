import Link from "next/link";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { RunZenoButton } from "@/modules/career-campaign/presentation/run-zeno-button";
import { RecommendationInbox } from "@/modules/career-campaign/presentation/recommendation-inbox";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

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

export default async function RecommendationsPage() {
  const userId = await requireUserId();
  const app = getCareerCampaignApplication(userId);

  let recommendations: Awaited<ReturnType<typeof app.listRecommendations>> = [];
  let notifications: Awaited<ReturnType<typeof app.listNotifications>> = [];
  let schemaMissing = false;

  try {
    recommendations = await app.listRecommendations({
      statuses: ["pending_review", "saved", "accepted"],
      limit: 50,
    });
    notifications = await app.listNotifications(10);
  } catch (error) {
    if (isMissingCampaignSchema(error)) {
      schemaMissing = true;
    } else {
      throw error;
    }
  }

  return (
    <div className="space-y-6">
      {schemaMissing ? (
        <section className="rounded-[var(--zeno-radius-lg)] border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-950">
            Campaign database migration required
          </h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            Apply{" "}
            <code className="rounded bg-amber-100 px-1">
              supabase/migrations/0010_career_campaign.sql
            </code>{" "}
            in your Supabase SQL editor, then reload.
          </p>
        </section>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em] text-[var(--zeno-ink)]">
            Recommendations
          </h1>
          <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
            Explained job matches from your campaign. Accept to prepare an
            application packet.
          </p>
        </div>
        <RunZenoButton disabled={schemaMissing} />
      </header>

      {notifications.length > 0 ? (
        <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-violet-wash)] p-4">
          <h2 className="text-sm font-semibold">Notification outbox</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--zeno-ink-muted)]">
            {notifications.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.eventType} · {item.channel} · {item.status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RecommendationInbox recommendations={recommendations} />

      <p className="text-sm">
        <Link href="/app/applications" className="font-semibold text-[var(--zeno-primary)]">
          View applications
        </Link>
      </p>
    </div>
  );
}
