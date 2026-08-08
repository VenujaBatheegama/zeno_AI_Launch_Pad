import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { getCareerIntelligenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const includeDismissed =
      new URL(request.url).searchParams.get("includeDismissed") === "true";
    const matches = await getCareerIntelligenceApplication().listMatches({
      includeDismissed,
    });
    return NextResponse.json(matches);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const application = getCareerIntelligenceApplication();
    const body = (await request.json()) as {
      listingIds?: string[];
      force?: boolean;
    };
    const listingIds = body.listingIds ?? [];
    const results = await application.analyseBatch({
      listingIds,
      force: body.force ?? true,
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
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const result = await getCareerIntelligenceApplication().clearMatches();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
