import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import {
  getCareerCampaignApplication,
  getCareerIntelligenceApplication,
} from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const app = getCareerCampaignApplication(userId);
    const campaign = await app.getJobCampaign(id);
    const listings = await app.listCampaignListings(id);
    const listingIds = listings.map((row) => row.listingId);
    const matches =
      listingIds.length === 0
        ? []
        : await getCareerIntelligenceApplication(userId).listMatches({
            listingIds,
          });
    return NextResponse.json({ campaign, listings, matches });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
