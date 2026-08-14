import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { updateMilestoneSchema } from "@/modules/career-friend/domain/schemas";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerFriendApplication } from "@/server/composition-root";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sprintId: string; milestoneId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { sprintId, milestoneId } = await context.params;
    const input = updateMilestoneSchema.parse(await request.json());
    const sprint = await getCareerFriendApplication(userId).setMilestone({
      sprintId,
      milestoneId,
      completed: input.completed,
    });
    return NextResponse.json({ sprint });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
