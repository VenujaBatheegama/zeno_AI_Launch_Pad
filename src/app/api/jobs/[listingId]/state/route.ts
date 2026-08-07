import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ listingId: string }> },
) {
  try {
    const [{ listingId }, body] = await Promise.all([
      context.params,
      request.json(),
    ]);
    return NextResponse.json(
      await getJobDiscoveryApplication().setJobState({
        listingId,
        state: body.state,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
