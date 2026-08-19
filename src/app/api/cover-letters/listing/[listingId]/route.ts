import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ listingId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { listingId } = await context.params;
    const application = getCareerCampaignApplication(userId);
    const recs = await application.listRecommendations({ limit: 50 });
    const rec = recs.find((r) => r.listingId === listingId);

    if (rec) {
      const details = await application.getPacketByRecommendation(rec.id);
      if (details?.coverLetterDraft) {
        return NextResponse.json({
          draft: details.coverLetterDraft,
          meta: details.coverLetterMeta,
          packetId: details.id,
        });
      }
    }

    return NextResponse.json({ draft: null });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
