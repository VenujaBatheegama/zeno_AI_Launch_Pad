import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const includeDismissed =
      new URL(request.url).searchParams.get("includeDismissed") === "true";
    const matches = await getCareerIntelligenceApplication(userId).listMatches({
      includeDismissed,
    });
    return NextResponse.json(matches);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const application = getCareerIntelligenceApplication(userId);
    const body = (await request.json()) as {
      listingIds?: string[];
      force?: boolean;
    };
    const listingIds = body.listingIds ?? [];
    const results = await application.analyseBatch({
      listingIds,
      // Prefer extraction cache; only force when the client explicitly asks.
      force: body.force ?? false,
    });
    // Return ranked cards in the same response so a follow-up GET cannot
    // erase a successful analyse when Supabase briefly times out.
    let ranked = [] as Awaited<ReturnType<typeof application.listMatches>>;
    try {
      ranked = await application.listMatches();
    } catch (error) {
      console.warn("Post-analyse ranked list reload failed:", error);
    }
    return NextResponse.json({ results, ranked });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    const result = await getCareerIntelligenceApplication(userId).clearMatches();
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
