import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { decisionReasonSchema } from "@/modules/career-campaign/domain/schemas";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  action: z.enum(["save", "accept", "reject"]),
  decisionReason: decisionReasonSchema.optional(),
  decisionNote: z.string().max(500).optional(),
  prepare: z.boolean().optional().default(true),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const app = getCareerCampaignApplication(userId);
    const result = await app.recordDecision({
      recommendationId: id,
      action: body.action,
      decisionReason: body.decisionReason,
      decisionNote: body.decisionNote,
    });

    let packet = result.packet;
    if (body.action === "accept" && packet && body.prepare) {
      packet = await app.preparePacket(packet.id);
    }

    return NextResponse.json({
      recommendation: result.recommendation,
      packet,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
