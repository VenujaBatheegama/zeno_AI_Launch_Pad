import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const bodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weeklyHours: z.number().int().min(1).max(20),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const result = await getCareerGrowthApplication(userId).acceptRecommendation({
      recommendationId: id,
      ...body,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
