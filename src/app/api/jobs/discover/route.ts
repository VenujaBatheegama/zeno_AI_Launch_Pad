import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(
      await getJobDiscoveryApplication().discover({
        cursor: body.cursor ?? null,
        depth: body.depth ?? 1,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
