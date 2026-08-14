import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const dashboard = await getCareerGrowthApplication(userId).getDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
