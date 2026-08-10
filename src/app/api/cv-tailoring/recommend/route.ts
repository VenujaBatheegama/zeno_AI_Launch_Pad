import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCvTailoringApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as { listingId: string };
    const application = getCvTailoringApplication(userId);
    const recommendation = await application.recommend({
      listingId: body.listingId,
    });
    return NextResponse.json(recommendation);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
