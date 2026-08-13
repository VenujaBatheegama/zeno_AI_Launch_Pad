import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const bodySchema = z.object({
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const application = await getCareerCampaignApplication(userId).markApplied({
      packetId: id,
      source: "web",
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ application });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
