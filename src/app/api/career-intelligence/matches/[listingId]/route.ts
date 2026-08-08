import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ listingId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { listingId } = await params;
    const details = await getCareerIntelligenceApplication().getMatchDetails({
      listingId,
    });
    return NextResponse.json(details);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { listingId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const result = await getCareerIntelligenceApplication().analyseAndMatch({
      listingId,
      force: body.force ?? false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
