import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(
      await getJobDiscoveryApplication().listJobs({
        includeDismissed:
          url.searchParams.get("includeDismissed") === "true",
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const includeSaved = url.searchParams.get("includeSaved") === "true";
    return NextResponse.json(
      await getJobDiscoveryApplication().clearJobs({ includeSaved }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
