import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z
    .enum(["planned", "in_progress", "paused", "completed", "abandoned"])
    .optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedHoursPerWeek: z.number().int().min(1).max(20).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const payload = await getCareerGrowthApplication(userId).getProject(id);
    return NextResponse.json(payload);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

import { getServerConfig } from "@/server/config";
import { createSupabaseClient } from "@/server/supabase-client";
import { SupabaseEvidenceRepository } from "@/modules/career-evidence/infrastructure/supabase-evidence-repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const project = await getCareerGrowthApplication(userId).updateProject({
      projectId: id,
      ...body,
    });

    if (body.status === "completed") {
      try {
        const config = getServerConfig();
        const supabase = createSupabaseClient(config);
        const evidenceRepo = new SupabaseEvidenceRepository(supabase);
        const currentEvidence = await evidenceRepo.getCurrent(userId);
        if (currentEvidence) {
          const existingProjects = currentEvidence.evidence.projects ?? [];
          if (
            !existingProjects.some(
              (p) => p.name.toLowerCase() === project.title.toLowerCase(),
            )
          ) {
            const updatedProjects = [
              ...existingProjects,
              {
                id: crypto.randomUUID(),
                name: project.title,
                description: project.objective,
                technologies: project.expectedEvidence ?? [],
                bullets: project.expectedEvidence ?? [],
                url: null,
                origin: "user_edited" as const,
                source_quote: null,
              },
            ];

            await supabase
              .from("career_evidence_sets")
              .update({
                evidence: {
                  ...currentEvidence.evidence,
                  projects: updatedProjects,
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", currentEvidence.id);
          }
        }
      } catch (err) {
        console.warn("[growth-project] auto-evidence sync warning:", err);
      }
    }

    return NextResponse.json({ project });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
