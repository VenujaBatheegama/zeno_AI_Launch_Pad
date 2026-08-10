import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCvTailoringApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ variantId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { variantId } = await context.params;
    const application = getCvTailoringApplication(userId);
    const file = await application.download({ variantId });
    return new NextResponse(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        ...(file.checksum
          ? { "X-Content-Checksum": file.checksum }
          : {}),
      },
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
