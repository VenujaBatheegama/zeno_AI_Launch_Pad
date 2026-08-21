import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { fetchJobsWorkspaceData } from "@/app/app/jobs/page";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    // Warm up the server in-memory SWR cache for the user in the background
    await fetchJobsWorkspaceData(userId);
    return NextResponse.json({ ok: true, primed: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
