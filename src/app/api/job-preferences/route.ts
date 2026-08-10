import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(
      await getJobDiscoveryApplication(userId).getProfile(),
    );
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    return NextResponse.json(
      await getJobDiscoveryApplication(userId).savePreferences({
        preferences: body.preferences,
      }),
    );
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
