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

const createBodySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  primaryRole: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(100),
  workMode: campaignWorkModeSchema.optional(),
  employmentTypes: z.array(employmentTypeSchema).max(5).optional(),
  experienceLevels: z.array(experienceLevelSchema).max(5).optional(),
  minimumScore: z.number().min(0).max(100).optional(),
  preferredTechnologies: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  targetReadyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  weeklyHoursAvailable: weeklyHoursAvailableSchema.nullable().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const app = getCareerCampaignApplication(userId);
    const [campaigns, overview] = await Promise.all([
      app.listJobCampaigns(),
      app.getJobsOverview(),
    ]);
    return NextResponse.json({ campaigns, overview });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = createBodySchema.parse(await request.json());
    const campaign = await getCareerCampaignApplication(userId).createJobCampaign(
      body,
    );
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
