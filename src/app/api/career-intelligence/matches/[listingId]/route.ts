import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ listingId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { listingId } = await params;
    const details = await getCareerIntelligenceApplication(userId).getMatchDetails({
      listingId,
    });
    return NextResponse.json(details);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { listingId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const result = await getCareerIntelligenceApplication(userId).analyseAndMatch({
      listingId,
      force: body.force ?? false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
