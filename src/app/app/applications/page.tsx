import { ApplicationsPipelineView } from "@/modules/career-campaign/presentation/applications-pipeline-view";
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

  const readyKits = packets.map(({ rec, packet }) => ({
    packetId: packet.id,
    recommendationId: rec.id,
    title: rec.fitSummarySnapshot.title ?? "Job Application",
    companyName: rec.fitSummarySnapshot.organizationName ?? null,
    status: packet.status,
    applicationUrl: rec.fitSummarySnapshot.applicationUrl ?? null,
  }));

  const applicationItems = await Promise.all(
    applications.map(async (application) => {
      const recommendation = await app.repository
        .getRecommendation(userId, application.recommendationId)
        .catch(() => null);

      return {
        id: application.id,
        title: recommendation?.fitSummarySnapshot.title ?? "Job Application",
        companyName: recommendation?.fitSummarySnapshot.organizationName ?? null,
        status: application.status,
        appliedAt: application.appliedAt,
        interviewAt: application.interviewAt,
        followUpDueAt: application.followUpDueAt,
        userNote: application.userNote,
      };
    }),
  );

  return (
    <ApplicationsPipelineView
      readyKits={readyKits}
      applications={applicationItems}
    />
  );
}
