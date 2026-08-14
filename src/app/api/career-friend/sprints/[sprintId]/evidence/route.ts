import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { submitSprintEvidenceSchema } from "@/modules/career-friend/domain/schemas";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerFriendApplication } from "@/server/composition-root";

export async function POST(
  request: Request,
  context: { params: Promise<{ sprintId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { sprintId } = await context.params;
    const input = submitSprintEvidenceSchema.parse(await request.json());
    const sprint = await getCareerFriendApplication(userId).submitEvidence({
      sprintId,
      ...input,
    });
    return NextResponse.json({ sprint });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
