import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const plan = await getCareerIntelligenceApplication().getPlan();
    return NextResponse.json(plan);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
      assessmentId?: string;
    };
    const plan = await getCareerIntelligenceApplication().createPlan({
      force: body.force ?? false,
      assessmentId: body.assessmentId,
    });
    return NextResponse.json(plan);
  } catch (error) {
    return errorResponse(error);
  }
}
