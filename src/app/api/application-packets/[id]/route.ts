import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const packet = await getCareerCampaignApplication(userId).getPacket(id);
    if (!packet) {
      return NextResponse.json({ error: "Packet not found." }, { status: 404 });
    }
    return NextResponse.json({ packet });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
