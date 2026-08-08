import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const assessment = await getCareerIntelligenceApplication().assess({
      force: body.force ?? false,
    });
    return NextResponse.json(assessment);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const assessment =
      await getCareerIntelligenceApplication().getAssessment();
    return NextResponse.json(assessment);
  } catch (error) {
    return errorResponse(error);
  }
}
