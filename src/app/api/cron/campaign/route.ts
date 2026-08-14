import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import {
  getCareerCampaignApplication,
  runScheduledDiscoveryTick,
} from "@/server/composition-root";
import { getServerConfig } from "@/server/config";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const config = getServerConfig();
  if (!config.CRON_SECRET) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length) === config.CRON_SECRET;
}

export async function GET(request: Request) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await runScheduledDiscoveryTick();
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST with the same auth for local/manual ops. Optional userId runs one campaign check. */
export async function POST(request: Request) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = z
      .object({ userId: z.uuid().optional() })
      .parse(await request.json().catch(() => ({})));
    if (body.userId) {
      const day = new Date().toISOString().slice(0, 10);
      const result = await getCareerCampaignApplication(body.userId).runCheck({
        trigger: "cron",
        idempotencyKey: `cron:${day}:${body.userId}`,
      });
      return NextResponse.json({ run: result.run });
    }
    const summary = await runScheduledDiscoveryTick();
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
