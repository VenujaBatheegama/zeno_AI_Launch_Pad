import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    return NextResponse.json(
      await getJobDiscoveryApplication(userId).listJobs({
        includeDismissed:
          url.searchParams.get("includeDismissed") === "true",
      }),
    );
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const includeSaved = url.searchParams.get("includeSaved") === "true";
    return NextResponse.json(
      await getJobDiscoveryApplication(userId).clearJobs({ includeSaved }),
    );
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
