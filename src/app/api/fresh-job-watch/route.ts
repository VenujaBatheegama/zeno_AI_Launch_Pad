import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["enable", "pause", "update"]).default("enable"),
  primaryRole: z.string().trim().min(2).max(100).optional(),
  location: z.string().trim().min(2).max(100).optional(),
  workMode: z.enum(["onsite", "hybrid", "remote", "any"]).optional(),
  minScore: z.number().min(0).max(100).optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const status = await getCareerCampaignApplication(userId).getFreshJobWatch();
    return NextResponse.json({ watch: status });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const app = getCareerCampaignApplication(userId);
    if (body.action === "pause") {
      const watch = await app.pauseFreshJobWatch();
      return NextResponse.json({ watch });
    }
    if (!body.primaryRole || !body.location) {
      return NextResponse.json(
        { error: "Primary role and location are required to enable Fresh Job Watch." },
        { status: 400 },
      );
    }
    const watch = await app.enableFreshJobWatch({
      primaryRole: body.primaryRole,
      location: body.location,
      workMode: body.workMode,
      minScore: body.minScore,
    });
    return NextResponse.json({ watch });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
