import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";

import { publicCvVariant, publicCvVariantCard } from "./public-variant";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCvTailoringApplication } from "@/server/composition-root";

export const runtime = "nodejs";

/** GET: list the current user's tailored CV variants as library cards. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const readyOnly = url.searchParams.get("readyOnly") === "true";
    const application = getCvTailoringApplication(userId);
    const variants = await application.listForUser({
      statuses: readyOnly
        ? ["ready"]
        : ["ready", "ready_to_render", "failed", "rendering"],
      limit: 50,
    });
    return NextResponse.json({
      variants: variants.map(publicCvVariantCard),
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

/** POST: plan + Groq tailor + validate. Stops before PDF render. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      listingId: string;
      mode?: "one_page" | "two_page";
      tailoringContext?: string | null;
      force?: boolean;
    };
    const application = getCvTailoringApplication(userId);
    const variant = await application.generateContent({
      listingId: body.listingId,
      mode: body.mode,
      tailoringContext: body.tailoringContext,
      force: body.force,
    });
    return NextResponse.json({ variant: publicCvVariant(variant) });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
