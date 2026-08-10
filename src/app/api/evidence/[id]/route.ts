import { NextResponse } from "next/server";


import { errorResponse } from "../../http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const [{ id }, body] = await Promise.all([context.params, request.json()]);
    const evidenceSet = await getCareerEvidenceApplication(userId).saveDraft({
      id,
      evidence: body.evidence,
    });

    return NextResponse.json(evidenceSet);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
