import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const bodySchema = z.object({
  campaignId: z.uuid(),
  mode: z.enum(["preliminary", "market_refined"]).default("preliminary"),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await request.json());
    const assessmentRequest = await getCareerGrowthApplication(
      userId,
    ).requestAssessment(body);
    return NextResponse.json({ request: assessmentRequest }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
