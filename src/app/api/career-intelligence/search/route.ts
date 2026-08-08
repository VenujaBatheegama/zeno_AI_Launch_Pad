import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      planId?: string;
    };
    const result = await getCareerIntelligenceApplication().executeSearch({
      planId: body.planId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
