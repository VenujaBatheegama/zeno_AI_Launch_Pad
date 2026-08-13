import { notFound } from "next/navigation";

import { ApplicationPacketView } from "@/modules/career-campaign/presentation/application-packet-view";
import { requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function PacketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const app = getCareerCampaignApplication(userId);
  const packet = await app.getPacket(id);
  if (!packet) notFound();

  const recommendation = await app.repository.getRecommendation(
    userId,
    packet.recommendationId,
  );

  const cvHref = packet.cvVariantId
    ? `/app/cvs/tailor?variantId=${packet.cvVariantId}&listingId=${packet.listingId}`
    : null;

  return (
    <ApplicationPacketView
      packet={packet}
      recommendation={recommendation}
      cvHref={cvHref}
    />
  );
}
