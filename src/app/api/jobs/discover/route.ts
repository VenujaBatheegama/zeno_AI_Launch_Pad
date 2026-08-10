import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    return NextResponse.json(
      await getJobDiscoveryApplication(userId).discover({
        cursor: body.cursor ?? null,
        depth: body.depth ?? 1,
      }),
    );
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
