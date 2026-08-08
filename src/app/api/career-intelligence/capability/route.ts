import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET() {
  try {
    const profile =
      await getCareerIntelligenceApplication().getCapabilityProfile();
    return NextResponse.json(profile);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const profile =
      await getCareerIntelligenceApplication().refreshCapabilityProfile({
        force: body.force ?? false,
      });
    return NextResponse.json(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
