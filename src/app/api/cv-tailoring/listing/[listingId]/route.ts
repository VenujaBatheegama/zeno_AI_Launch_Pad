import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCvTailoringApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ listingId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { listingId } = await context.params;
    const application = getCvTailoringApplication(userId);
    const variants = await application.listForListing({ listingId });
    return NextResponse.json({
      variants: variants.map((variant) => ({
        id: variant.id,
        mode: variant.mode,
        status: variant.status,
        pageCount: variant.artifactPageCount,
        updatedAt: variant.updatedAt,
        errorMessage: variant.errorMessage,
      })),
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
