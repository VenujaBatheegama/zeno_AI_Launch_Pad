import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const assessment = await getCareerIntelligenceApplication(userId).assess({
      force: body.force ?? false,
    });
    return NextResponse.json(assessment);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const assessment =
      await getCareerIntelligenceApplication(userId).getAssessment();
    return NextResponse.json(assessment);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
