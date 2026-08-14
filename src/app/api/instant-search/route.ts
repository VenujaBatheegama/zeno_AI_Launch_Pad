import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const session = await getCareerCampaignApplication(
      userId,
    ).getLatestInstantSearch();
    return NextResponse.json({ session });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json().catch(() => ({}))) as {
      analysedCount?: number;
    };
    const app = getCareerCampaignApplication(userId);
    const session = await app.getLatestInstantSearch();
    if (!session) {
      return NextResponse.json({ session: null });
    }
    const updated = await app.updateInstantSearchAnalysed(
      session.id,
      Math.max(0, Number(body.analysedCount ?? session.analysedCount)),
    );
    return NextResponse.json({ session: updated });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
