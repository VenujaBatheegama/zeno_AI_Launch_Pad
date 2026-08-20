import Link from "next/link";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import { UnifiedInbox } from "@/modules/career-growth/presentation/unified-inbox";
import { classifyMissingMigration } from "@/lib/migration-guard";
import { requireUserId } from "@/server/auth";
import {
  getCareerCampaignApplication,
  getCareerGrowthApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

function wrapCampaignError(error: unknown): unknown {
  if (error instanceof CareerCampaignError && error.code === "PERSISTENCE_FAILED") {
    return error;
  }
  return null;
}

export default async function RecommendationsPage() {
  const userId = await requireUserId();
  const app = getCareerCampaignApplication(userId);

  let recommendations: Awaited<ReturnType<typeof app.listRecommendations>> = [];
  let notifications: Awaited<ReturnType<typeof app.listNotifications>> = [];
  let migrationGap = null;
  let growthItems: Awaited<ReturnType<ReturnType<typeof getCareerGrowthApplication>["listInbox"]>> = [];
  let campaignNames = new Map<string, string>();

  const growthPromise = getCareerGrowthApplication(userId)
    .listInbox()
    .catch(() => []);

  try {
    const [recResult, notifResult, campResult, growthResult] =
      await Promise.all([
        app.listRecommendations({
          statuses: ["pending_review", "saved", "accepted"],
          limit: 50,
        }),
        app.listNotifications(10),
        app.listCampaigns(),
        growthPromise,
      ]);

    recommendations = recResult;
    notifications = notifResult;
    campaignNames = new Map(campResult.map((c) => [c.id, c.name]));
    growthItems = growthResult;
  } catch (error) {
    const wrapped = wrapCampaignError(error);
    migrationGap = wrapped ? classifyMissingMigration(wrapped) : null;
    if (!migrationGap) {
      throw error;
    }
  }
  const schemaMissing = migrationGap !== null;

  return (
    <div className="space-y-6">
      {migrationGap ? (
        <section className="rounded-[var(--zeno-radius-lg)] border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-950">
            {migrationGap.feature} database migration required
          </h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            {migrationGap.description} Apply{" "}
            <code className="rounded bg-amber-100 px-1">
              {migrationGap.migrationFile}
            </code>{" "}
            in your Supabase SQL editor, then reload.
          </p>
        </section>
      ) : null}

      <header>
        <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em] text-[var(--zeno-ink)]">
          Inbox
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Job matches and Growth recommendations from your campaigns.
        </p>
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

      <UnifiedInbox growth={growthItems} jobRecommendations={recommendations} campaignNames={campaignNames} />

      <p className="text-sm">
        <Link href="/app/applications" className="font-semibold text-[var(--zeno-primary)]">
          View applications
        </Link>
      </p>
    </div>
  );
}
