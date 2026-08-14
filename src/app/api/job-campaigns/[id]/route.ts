import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { campaignWorkModeSchema, weeklyHoursAvailableSchema } from "@/modules/career-campaign/domain/job-campaign";
import {
  employmentTypeSchema,
  experienceLevelSchema,
} from "@/modules/job-discovery/domain/job";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const patchBodySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  primaryRole: z.string().trim().min(2).max(100).optional(),
  location: z.string().trim().min(2).max(100).optional(),
  workMode: campaignWorkModeSchema.optional(),
  employmentTypes: z.array(employmentTypeSchema).max(5).optional(),
  experienceLevels: z.array(experienceLevelSchema).max(5).optional(),
  minimumScore: z.number().min(0).max(100).optional(),
  preferredTechnologies: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  targetReadyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  weeklyHoursAvailable: weeklyHoursAvailableSchema.nullable().optional(),
  status: z.enum(["active", "paused"]).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const app = getCareerCampaignApplication(userId);
    const campaign = await app.getJobCampaign(id);
    const [listings, runs] = await Promise.all([
      app.listCampaignListings(id),
      app.listCampaignRuns(id),
    ]);
    return NextResponse.json({ campaign, listings, runs });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = patchBodySchema.parse(await request.json().catch(() => ({})));
    const app = getCareerCampaignApplication(userId);
    const { status, ...criteria } = body;
    if (status === "paused") {
      const campaign = await app.pauseJobCampaign(id);
      return NextResponse.json({ campaign });
    }
    if (status === "active") {
      const campaign = await app.resumeJobCampaign(id);
      return NextResponse.json({ campaign });
    }
    const campaign = await app.updateJobCampaign(id, criteria);
    return NextResponse.json({ campaign });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const campaign = await getCareerCampaignApplication(userId).archiveJobCampaign(
      id,
    );
    return NextResponse.json({ campaign });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
