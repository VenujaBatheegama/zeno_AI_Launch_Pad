import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import {
  getCareerCampaignApplication,
  getCareerEvidenceApplication,
  getJobDiscoveryApplication,
} from "@/server/composition-root";
import { getServerConfig } from "@/server/config";
import { createSupabaseClient } from "@/server/supabase-client";
import { GroqCoverLetterGenerator } from "@/modules/career-campaign/infrastructure/groq-cover-letter-generator";
import { getGroqKeyPool } from "@/server/groq";

export const runtime = "nodejs";
export const maxDuration = 120;

const generateSchema = z.object({
  listingId: z.string().uuid().optional(),
  jobTitle: z.string().max(200).optional(),
  organizationName: z.string().max(200).optional(),
  jobDescription: z.string().max(20000).optional(),
  isGeneral: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const json = (await request.json().catch(() => ({}))) as unknown;
    const body = generateSchema.parse(json);
    const config = getServerConfig();
    const supabase = createSupabaseClient(config);

    // 1. Direct generation for an existing discovered / matched job
    if (body.listingId) {
      const campaign = getCareerCampaignApplication(userId);
      const result = await campaign.generateCoverLetterForListing(body.listingId);
      return NextResponse.json(result);
    }

    // 2. Standalone generation: Either pasted JD or General Profile Cover Letter
    const isGeneral =
      body.isGeneral ||
      (!body.jobDescription && !body.jobTitle && !body.organizationName) ||
      body.organizationName?.toLowerCase() === "general";

    let targetRole = body.jobTitle?.trim() || "";
    let companyName = body.organizationName?.trim() || "";

    const evidenceApp = getCareerEvidenceApplication(userId);
    const evidence = await evidenceApp.getCurrent().catch(() => null);

    if (isGeneral) {
      if (!targetRole) {
        targetRole =
          evidence?.evidence?.work_experience[0]?.role ||
          "Software Engineer";
      }
      companyName = "General";
    } else {
      if (!targetRole) targetRole = "Software Engineer";
    }

    const description =
      body.jobDescription?.trim() ||
      (isGeneral
        ? `General candidate profile and background application targeting ${targetRole} opportunities.`
        : `Job opening for ${targetRole}${companyName ? ` at ${companyName}` : ""}.`);

    // Generate cover letter draft via GroqCoverLetterGenerator directly
    const coverLetterGenerator = new GroqCoverLetterGenerator(
      getGroqKeyPool(),
      config.GROQ_MODEL,
      config.groqFallbackModels,
    );

    const evidenceJson = evidence?.evidence ?? {
      schema_version: 1,
      profile: { full_name: "Candidate" },
      work_experience: [],
      skills: [],
      projects: [],
      education: [],
    };

    const cover = await coverLetterGenerator.generate({
      evidenceJson,
      jobTitle: targetRole,
      organizationName: companyName !== "General" ? companyName : null,
      jobDescription: description,
      matchedRequirements: [],
      missingRequirements: [],
      applicationUrl: null,
    });

    const now = new Date().toISOString();
    const externalId = `cover_letter_${randomUUID()}`;

    const jobDiscovery = getJobDiscoveryApplication(userId);
    const [savedJob] = await jobDiscovery.repository.upsertDiscoveredJobs({
      userId,
      source: {
        key: "manual",
        name: isGeneral ? "General Application" : "Cover Letter Opportunity",
      },
      jobs: [
        {
          external_id: externalId,
          title: isGeneral ? `${targetRole} (General)` : targetRole,
          organization:
            companyName && companyName !== "General"
              ? {
                  name: companyName,
                  logo_url: null,
                  website_url: null,
                }
              : null,
          description,
          location: null,
          city: null,
          region: null,
          country: null,
          employment_type: null,
          work_mode: null,
          experience_level: null,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          closing_at: null,
          publisher: null,
          source_url: null,
          application_url: null,
          application_is_direct: true,
          published_at: now,
          raw_payload: {},
        },
      ],
      seenAt: now,
    });

    if (savedJob) {
      const listingId = savedJob.listing_id;
      const jobId = savedJob.job_id;

      try {
        // 1. Ensure career_evidence_sets row exists
        let evidenceSetId = evidence?.id;
        if (!evidenceSetId) {
          const { data: existingEvidence } = await supabase
            .from("career_evidence_sets")
            .select("id")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingEvidence?.id) {
            evidenceSetId = existingEvidence.id;
          } else {
            const newEvId = randomUUID();
            const { data: createdEv } = await supabase
              .from("career_evidence_sets")
              .insert({
                id: newEvId,
                user_id: userId,
                status: "verified",
                evidence: evidenceJson,
                created_at: now,
                updated_at: now,
              })
              .select("id")
              .single();
            evidenceSetId = createdEv?.id ?? newEvId;
          }
        }

        // 2. Ensure job_analyses row exists
        const analysisId = randomUUID();
        const { data: analysisData } = await supabase
          .from("job_analyses")
          .upsert(
            {
              id: analysisId,
              user_id: userId,
              job_id: jobId,
              listing_id: listingId,
              description_fingerprint: "cover_letter",
              description_quality: "complete_or_good",
              opportunity_band: "target",
              opportunity_confidence: "high",
              opportunity_reasons: [],
              extraction_policy_version: "v1",
              status: "ready",
              warnings: [],
              updated_at: now,
            },
            { onConflict: "user_id,listing_id" },
          )
          .select("id")
          .single();

        const finalAnalysisId = analysisData?.id ?? analysisId;

        // 3. Ensure career_stage_assessments row exists
        const { data: stageData } = await supabase
          .from("career_stage_assessments")
          .select("id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let stageId = stageData?.id;
        if (!stageId) {
          const newStageId = randomUUID();
          const { data: createdStage } = await supabase
            .from("career_stage_assessments")
            .insert({
              id: newStageId,
              user_id: userId,
              evidence_set_id: evidenceSetId,
              evidence_fingerprint: "default",
              preferences_fingerprint: "default",
              inferred_stage: "mid",
              confidence: "high",
              experience_summary: {},
              target_opportunity_bands: [],
              stretch_opportunity_bands: [],
              unsuitable_bands: [],
              reasons: [],
              preference_overrides: [],
              evidence_ids: [],
              policy_version: "v1",
              assessed_at: now,
            })
            .select("id")
            .single();
          stageId = createdStage?.id ?? newStageId;
        }

        // 4. Ensure job_match_analyses row exists
        const matchId = randomUUID();
        const { data: matchData } = await supabase
          .from("job_match_analyses")
          .upsert(
            {
              id: matchId,
              user_id: userId,
              job_analysis_id: finalAnalysisId,
              listing_id: listingId,
              job_id: jobId,
              career_stage_assessment_id: stageId,
              evidence_fingerprint: "cover_letter",
              preferences_fingerprint: "cover_letter",
              description_fingerprint: "cover_letter",
              evidence_fit_score: 85,
              career_level: "mid",
              hard_constraint_eligible: true,
              hard_constraint_reasons: [],
              analysis_confidence: "high",
              scoring_policy_version: "v1",
              matching_policy_version: "v1",
              score_breakdown: {},
              explanation: "Cover letter opportunity",
              status: "completed",
              updated_at: now,
            },
            { onConflict: "user_id,listing_id" },
          )
          .select("id")
          .single();

        const finalMatchId = matchData?.id ?? matchId;

        // 5. Ensure job_recommendations row exists (check first to avoid partial index ON CONFLICT error)
        const { data: existingRec } = await supabase
          .from("job_recommendations")
          .select("id")
          .eq("user_id", userId)
          .eq("listing_id", listingId)
          .limit(1)
          .maybeSingle();

        let finalRecId = existingRec?.id;
        if (!finalRecId) {
          finalRecId = randomUUID();
          await supabase.from("job_recommendations").insert({
            id: finalRecId,
            user_id: userId,
            listing_id: listingId,
            job_match_analysis_id: finalMatchId,
            status: "pending_review",
            score_snapshot: { evidenceFitScore: 85 },
            fitSummarySnapshot: {
              title: targetRole,
              organizationName: companyName,
            },
            recommended_at: now,
            created_at: now,
            updated_at: now,
          });
        }

        // 6. Persist directly into application_packets
        const { data: existingPacket } = await supabase
          .from("application_packets")
          .select("id")
          .eq("user_id", userId)
          .eq("recommendation_id", finalRecId)
          .limit(1)
          .maybeSingle();

        if (existingPacket?.id) {
          await supabase
            .from("application_packets")
            .update({
              status: "ready",
              cover_letter_draft: cover.draft,
              cover_letter_meta: {
                ...cover.meta,
                jobTitle: targetRole,
                organizationName: companyName,
              },
              ready_at: now,
              updated_at: now,
            })
            .eq("id", existingPacket.id);
        } else {
          await supabase.from("application_packets").insert({
            id: randomUUID(),
            user_id: userId,
            recommendation_id: finalRecId,
            listing_id: listingId,
            status: "ready",
            cover_letter_draft: cover.draft,
            cover_letter_meta: {
              ...cover.meta,
              jobTitle: targetRole,
              organizationName: companyName,
            },
            ready_at: now,
            created_at: now,
            updated_at: now,
          });
        }
      } catch (dbErr) {
        console.warn("Cover letter database persistence warning:", dbErr);
      }

      return NextResponse.json({
        draft: cover.draft,
        meta: cover.meta,
        listingId,
        jobTitle: targetRole,
        companyName,
      });
    }

    return NextResponse.json({
      draft: cover.draft,
      meta: cover.meta,
      jobTitle: targetRole,
      companyName,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
