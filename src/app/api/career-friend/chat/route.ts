import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { askCareerFriendSchema } from "@/modules/career-friend/domain/schemas";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerFriendApplication } from "@/server/composition-root";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = askCareerFriendSchema.parse(await request.json());
    const result = await getCareerFriendApplication(userId).ask(input);
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
