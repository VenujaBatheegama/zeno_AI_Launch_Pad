import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { workModeSchema } from "@/modules/job-discovery/domain/job";
import { authErrorResponse, requireUserId } from "@/server/auth";
import {
  getCareerIntelligenceApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";

export const runtime = "nodejs";
export const maxDuration = 120;

const importSchema = z.object({
  description: z.string().trim().min(20, "Job description must be at least 20 characters."),
  title: z.string().trim().max(150).optional().nullable(),
  organizationName: z.string().trim().max(100).optional().nullable(),
  location: z.string().trim().max(100).optional().nullable(),
  workMode: workModeSchema.optional().nullable(),
  applicationUrl: z
    .string()
    .trim()
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
});

function deriveTitleFromDescription(description: string, explicitTitle?: string | null): string {
  if (explicitTitle && explicitTitle.trim().length > 0) {
    return explicitTitle.trim();
  }
  const firstLine = description
    .split("\n")
    .map((l) => l.trim().replace(/^#+\s*/, ""))
    .find((l) => l.length > 0 && l.length <= 100);

  if (firstLine && firstLine.length >= 3) {
    return firstLine;
  }
  return "Pasted Job Opportunity";
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const parsed = importSchema.parse(body);

    const title = deriveTitleFromDescription(parsed.description, parsed.title);
    const externalId = `pasted_${randomUUID()}`;
    const now = new Date().toISOString();

    const jobDiscovery = getJobDiscoveryApplication(userId);
    const [savedJob] = await jobDiscovery.repository.upsertDiscoveredJobs({
      userId,
      source: { key: "manual", name: "Pasted Job Description" },
      jobs: [
        {
          external_id: externalId,
          title,
          organization: parsed.organizationName
            ? {
                name: parsed.organizationName,
                logo_url: null,
                website_url: null,
              }
            : null,
          description: parsed.description,
          location: parsed.location || null,
          city: null,
          region: null,
          country: null,
          employment_type: null,
          work_mode: parsed.workMode || null,
          experience_level: null,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          closing_at: null,
          publisher: null,
          source_url: null,
          application_url: parsed.applicationUrl || null,
          application_is_direct: true,
          published_at: now,
          raw_payload: {},
        },
      ],
      seenAt: now,
    });

    if (!savedJob) {
      return NextResponse.json(
        { error: "Could not save job description." },
        { status: 500 },
      );
    }

    // Immediately analyse and match against verified evidence
    const careerIntelligence = getCareerIntelligenceApplication(userId);
    try {
      await careerIntelligence.analyseAndMatch({
        listingId: savedJob.listing_id,
        force: true,
      });
    } catch (analysisErr) {
      // Analysis failure should not block the listing creation,
      // workspace will retry on load.
      console.warn("Initial analysis for pasted job failed:", analysisErr);
    }

    return NextResponse.json({
      job: savedJob,
      listingId: savedJob.listing_id,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
