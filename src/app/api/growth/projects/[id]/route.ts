import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z
    .enum(["planned", "in_progress", "paused", "completed", "abandoned"])
    .optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedHoursPerWeek: z.number().int().min(1).max(20).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const payload = await getCareerGrowthApplication(userId).getProject(id);
    return NextResponse.json(payload);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const project = await getCareerGrowthApplication(userId).updateProject({
      projectId: id,
      ...body,
    });
    return NextResponse.json({ project });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
