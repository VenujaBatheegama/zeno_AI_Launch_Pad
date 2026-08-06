import { NextResponse } from "next/server";

import { getCareerEvidenceApplication } from "@/server/composition-root";

import { errorResponse } from "../../../http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, body] = await Promise.all([context.params, request.json()]);
    const evidenceSet = await getCareerEvidenceApplication().verify({
      id,
      evidence: body.evidence,
      acknowledged: body.acknowledged === true,
    });

    return NextResponse.json(evidenceSet);
  } catch (error) {
    return errorResponse(error);
  }
}
