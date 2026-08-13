import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const day = new Date().toISOString().slice(0, 10);
    const idempotencyKey =
      body.idempotencyKey ?? `manual:${userId}:${day}`;

    const result = await getCareerCampaignApplication(userId).runCheck({
      trigger: "manual",
      idempotencyKey,
    });

    // Best-effort in-app notification delivery after run.
    await getCareerCampaignApplication(userId)
      .deliverNotifications()
      .catch(() => undefined);

    await getCareerCampaignApplication(userId)
      .aggregateGaps()
      .catch(() => undefined);

    return NextResponse.json({
      run: result.run,
      reused: result.reused,
      recommendedIds: result.recommendedIds,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
