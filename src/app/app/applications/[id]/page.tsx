import { notFound } from "next/navigation";

import { ApplicationDetail } from "@/modules/career-campaign/presentation/application-detail";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const app = getCareerCampaignApplication(userId);
  const application = await app.getApplication(id);
  if (!application) notFound();
  const events = await app.listApplicationEvents(id);
  const recommendation = await app.repository.getRecommendation(
    userId,
    application.recommendationId,
  );

  return (
    <ApplicationDetail
      application={application}
      events={events}
      title={recommendation?.fitSummarySnapshot.title ?? null}
      company={recommendation?.fitSummarySnapshot.organizationName ?? null}
      cvHref={
        application.cvVariantId
          ? `/app/cvs/tailor?variantId=${application.cvVariantId}&listingId=${application.listingId}`
          : null
      }
    />
  );
}
