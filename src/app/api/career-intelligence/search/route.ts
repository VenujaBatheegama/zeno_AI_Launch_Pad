import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

/**
 * Search for jobs using the latest valid internal plan.
 * Regenerates the plan automatically when preferences/ESCO policy are stale.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json().catch(() => ({}))) as {
      excludedTitles?: string[];
    };
    const result = await getCareerIntelligenceApplication(userId).searchForJobs({
      excludedTitles: body.excludedTitles,
    });
    return NextResponse.json({
      jobsFound: result.jobsFound,
      partialFailure: result.partialFailure,
      warnings: result.warnings,
      softNotice: result.softNotice,
      preparingMessage: result.preparingMessage,
      alsoSearchFor: result.alsoSearchFor,
      plan: {
        id: result.plan.id,
        status: result.plan.status,
        queryCount: result.plan.queries.length,
        recommendedRoles: result.plan.queries.map((query) => query.queryText),
        alsoSearchFor: result.alsoSearchFor,
        updatedAt: result.plan.updatedAt,
      },
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
