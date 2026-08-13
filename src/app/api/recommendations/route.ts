import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const statuses = status
      ? (status.split(",") as Array<
          "pending_review" | "saved" | "accepted" | "rejected" | "expired"
        >)
      : undefined;
    const items = await getCareerCampaignApplication(userId).listRecommendations({
      statuses,
      limit: 50,
    });
    return NextResponse.json({ recommendations: items });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
