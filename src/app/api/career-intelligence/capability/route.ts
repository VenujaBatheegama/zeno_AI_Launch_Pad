import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const profile =
      await getCareerIntelligenceApplication(userId).getCapabilityProfile();
    return NextResponse.json(profile);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const profile =
      await getCareerIntelligenceApplication(userId).refreshCapabilityProfile({
        force: body.force ?? false,
      });
    return NextResponse.json(profile);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
