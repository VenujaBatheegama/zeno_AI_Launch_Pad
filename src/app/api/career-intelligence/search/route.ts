import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

/**
 * Search for jobs using the latest valid internal plan.
 * Regenerates the plan automatically when preferences/profile are stale.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    // Body kept for backward compatibility; planId is ignored in favour of ensure+search.
    await request.json().catch(() => ({}));
    const result =
      await getCareerIntelligenceApplication(userId).searchForJobs({});
    return NextResponse.json({
      jobsFound: result.jobsFound,
      partialFailure: result.partialFailure,
      warnings: result.warnings,
      softNotice: result.softNotice,
      preparingMessage: result.preparingMessage,
      // Do not expose capability internals — only query titles for UI context.
      plan: {
        id: result.plan.id,
        status: result.plan.status,
        queryCount: result.plan.queries.length,
        recommendedRoles: result.plan.queries.map((query) => query.queryText),
        smartSkillAnalyserEnabled: result.plan.smartSkillAnalyserEnabled,
        updatedAt: result.plan.updatedAt,
      },
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
