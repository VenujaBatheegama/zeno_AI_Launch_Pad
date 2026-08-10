import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const plan = await getCareerIntelligenceApplication(userId).getPlan();
    return NextResponse.json(plan);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
      assessmentId?: string;
    };
    const plan = await getCareerIntelligenceApplication(userId).createPlan({
      force: body.force ?? false,
      assessmentId: body.assessmentId,
    });
    return NextResponse.json(plan);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
