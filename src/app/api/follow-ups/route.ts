import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const followUps = await getCareerCampaignApplication(userId).findDueFollowUps();
    return NextResponse.json({ followUps });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
