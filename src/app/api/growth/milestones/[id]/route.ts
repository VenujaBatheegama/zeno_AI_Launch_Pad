import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["todo", "in_progress", "completed", "skipped"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const result = await getCareerGrowthApplication(userId).updateMilestone(
      id,
      body.status,
    );
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
