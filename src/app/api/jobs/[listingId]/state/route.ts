import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ listingId: string }> },
) {
  try {
    const userId = await requireUserId();
    const [{ listingId }, body] = await Promise.all([
      context.params,
      request.json(),
    ]);
    return NextResponse.json(
      await getJobDiscoveryApplication(userId).setJobState({
        listingId,
        state: body.state,
      }),
    );
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
