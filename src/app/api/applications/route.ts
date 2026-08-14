import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const applications = await getCareerCampaignApplication(
      userId,
    ).listApplications({ limit: 50 });
    return NextResponse.json({ applications });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
