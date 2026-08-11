import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { userEditableTailoredResumeSchema } from "@/modules/cv-tailoring/domain/tailored-resume";

import { publicCvVariant } from "../public-variant";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCvTailoringApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ variantId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { variantId } = await context.params;
    const application = getCvTailoringApplication(userId);
    const variant = await application.getVariant({ variantId });
    return NextResponse.json({ variant: publicCvVariant(variant) });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

/** PATCH: save user edits to structured ready_to_render content. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ variantId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { variantId } = await context.params;
    const body = (await request.json()) as {
      tailoredContent?: unknown;
    };
    const tailoredContent = userEditableTailoredResumeSchema.parse(
      body.tailoredContent,
    );
    const application = getCvTailoringApplication(userId);
    const variant = await application.updateContent({
      variantId,
      tailoredContent,
    });
    return NextResponse.json({ variant: publicCvVariant(variant) });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
