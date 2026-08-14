import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { createSprintSchema } from "@/modules/career-friend/domain/schemas";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerFriendApplication } from "@/server/composition-root";

export async function GET() {
  try {
    const userId = await requireUserId();
    const sprints = await getCareerFriendApplication(userId).listSprints();
    return NextResponse.json({ sprints });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = createSprintSchema.parse(await request.json());
    const result = await getCareerFriendApplication(userId).startSprint(
      input.growthActionId,
    );
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
