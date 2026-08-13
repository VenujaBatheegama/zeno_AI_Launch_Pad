import Link from "next/link";

import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const userId = await requireUserId();
  const app = getCareerCampaignApplication(userId);
  const [applications, accepted] = await Promise.all([
    app.listApplications({ limit: 50 }),
    app.listRecommendations({
      statuses: ["accepted"],
      limit: 50,
    }),
  ]);

  const packetRows = await Promise.all(
    accepted.map(async (rec) => {
      const packet = await app.repository.getPacketByRecommendation(
        userId,
        rec.id,
      );
      return packet ? { rec, packet } : null;
    }),
  );
  const packets = packetRows.filter(
    (row): row is NonNullable<typeof row> => row !== null,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em]">
          Applications
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Track packets and applications Zeno prepared. You always submit
          externally.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Packets</h2>
        {packets.length === 0 ? (
          <p className="text-sm text-[var(--zeno-ink-muted)]">
            No packets yet. Accept a recommendation to prepare one.
          </p>
        ) : (
          packets.map(({ rec, packet }) => (
            <Link
              key={packet.id}
              href={`/app/packets/${packet.id}`}
              className="block rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-4 hover:border-[var(--zeno-border-hover)]"
            >
              <p className="font-semibold">
                {rec.fitSummarySnapshot.title ?? "Application packet"}
              </p>
              <p className="text-sm text-[var(--zeno-ink-muted)]">
                {packet.status}
                {rec.fitSummarySnapshot.organizationName
                  ? ` · ${rec.fitSummarySnapshot.organizationName}`
                  : ""}
              </p>
            </Link>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Submitted applications</h2>
        {applications.length === 0 ? (
          <p className="text-sm text-[var(--zeno-ink-muted)]">
            No applications marked yet.
          </p>
        ) : (
          applications.map((application) => (
            <Link
              key={application.id}
              href={`/app/applications/${application.id}`}
              className="block rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-4 hover:border-[var(--zeno-border-hover)]"
            >
              <p className="font-semibold capitalize">{application.status}</p>
              <p className="text-sm text-[var(--zeno-ink-muted)]">
                Applied {application.appliedAt?.slice(0, 10) ?? "—"}
                {application.followUpDueAt
                  ? ` · Follow-up ${application.followUpDueAt.slice(0, 10)}`
                  : ""}
              </p>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
