import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const bodySchema = z.object({
  category: z.string().trim().max(80).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await getCareerGrowthApplication(userId).dismissRecommendation(
      id,
      body.category,
    );
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
