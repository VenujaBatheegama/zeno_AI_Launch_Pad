import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const payload = await getCareerGrowthApplication(userId).getRecommendation(id);
    return NextResponse.json(payload);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
