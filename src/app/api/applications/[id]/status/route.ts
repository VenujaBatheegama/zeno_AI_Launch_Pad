import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { applicationStatusSchema } from "@/modules/career-campaign/domain/schemas";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const bodySchema = z.object({
  status: applicationStatusSchema.exclude(["ready", "applied"]),
  userNote: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const application = await getCareerCampaignApplication(userId).updateStatus({
      applicationId: id,
      status: body.status,
      userNote: body.userNote,
      source: "web",
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ application });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
