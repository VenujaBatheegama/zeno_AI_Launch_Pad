import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getJobDiscoveryApplication } from "@/server/composition-root";

export async function GET() {
  try {
    return NextResponse.json(
      await getJobDiscoveryApplication().getProfile(),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(
      await getJobDiscoveryApplication().savePreferences({
        preferences: body.preferences,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
