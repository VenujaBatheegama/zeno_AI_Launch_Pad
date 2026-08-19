import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const generateSchema = z.object({
  listingId: z.string().uuid().optional(),
  jobTitle: z.string().max(200).optional(),
  organizationName: z.string().max(200).optional(),
  jobDescription: z.string().max(20000).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const json = (await request.json().catch(() => ({}))) as unknown;
    const body = generateSchema.parse(json);
    const application = getCareerCampaignApplication(userId);

    if (body.listingId) {
      const result = await application.generateCoverLetterForListing(body.listingId);
      return NextResponse.json(result);
    }

    if (body.jobDescription) {
      const result = await application.generateCustomCoverLetter({
        jobTitle: body.jobTitle,
        organizationName: body.organizationName,
        jobDescription: body.jobDescription,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Either listingId or jobDescription must be provided." },
      { status: 400 },
    );
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
