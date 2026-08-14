import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const result = await getCareerCampaignApplication(userId).runJobCampaignNow(id);
    return NextResponse.json({ result });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
