import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/server/auth";
import { getServerConfig } from "@/server/config";
import { createSupabaseClient } from "@/server/supabase-client";

export const dynamic = "force-dynamic";

const manualApplicationSchema = z.object({
  roleTitle: z.string().trim().min(1, "Job title is required"),
  companyName: z.string().trim().min(1, "Company name is required"),
  applicationUrl: z.string().trim().nullable().optional(),
  status: z
    .enum(["applied", "interview", "offer", "rejected", "withdrawn"])
    .default("applied"),
  appliedAt: z.string().nullable().optional(),
  interviewAt: z.string().nullable().optional(),
  userNote: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = manualApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const nowIso = new Date().toISOString();
  const listingId = crypto.randomUUID();
  const recommendationId = crypto.randomUUID();
  const packetId = crypto.randomUUID();
  const applicationId = crypto.randomUUID();

  try {
    // 1. Insert a synthetic job listing
    const { error: listingError } = await supabase.from("job_listings").insert({
      id: listingId,
      source: "manual",
      external_id: `manual-${applicationId}`,
      title: input.roleTitle,
      organization_name: input.companyName,
      application_url: input.applicationUrl || null,
      source_url: input.applicationUrl || null,
      status: "active",
      published_at: nowIso,
      raw_payload: {
        manual: true,
        company: input.companyName,
        title: input.roleTitle,
      },
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (listingError) {
      console.error("[manual-app] listing insert error:", listingError);
      return NextResponse.json(
        { error: "Could not create job listing record." },
        { status: 500 },
      );
    }

    // 2. Insert synthetic recommendation
    const { error: recError } = await supabase.from("job_recommendations").insert({
      id: recommendationId,
      user_id: userId,
      listing_id: listingId,
      job_match_analysis_id: listingId, // self-referencing placeholder
      status: "accepted",
      score_snapshot: {
        evidenceFitScore: 100,
        careerLevel: "mid",
        hardConstraintEligible: true,
        analysisConfidence: "high",
        scoringPolicyVersion: "manual",
      },
      fit_summary_snapshot: {
        explanation: "Manually logged application by candidate.",
        title: input.roleTitle,
        organizationName: input.companyName,
        applicationUrl: input.applicationUrl || null,
        topMatched: [],
        primaryGaps: [],
        rankingReasons: [],
      },
      scoring_policy_version: "manual",
      recommended_at: nowIso,
      reviewed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (recError) {
      // If foreign key on job_match_analyses blocks it, insert analysis first
      await supabase.from("job_match_analyses").insert({
        id: listingId,
        user_id: userId,
        listing_id: listingId,
        evidence_set_id: null,
        evidence_version: 1,
        career_level: "mid",
        confidence: "high",
        requirements: [],
        hard_constraints: [],
        created_at: nowIso,
        updated_at: nowIso,
      });

      await supabase.from("job_recommendations").insert({
        id: recommendationId,
        user_id: userId,
        listing_id: listingId,
        job_match_analysis_id: listingId,
        status: "accepted",
        score_snapshot: {
          evidenceFitScore: 100,
          careerLevel: "mid",
          hardConstraintEligible: true,
          analysisConfidence: "high",
          scoringPolicyVersion: "manual",
        },
        fit_summary_snapshot: {
          explanation: "Manually logged application by candidate.",
          title: input.roleTitle,
          organizationName: input.companyName,
          applicationUrl: input.applicationUrl || null,
          topMatched: [],
          primaryGaps: [],
          rankingReasons: [],
        },
        scoring_policy_version: "manual",
        recommended_at: nowIso,
        reviewed_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // 3. Insert synthetic packet
    await supabase.from("application_packets").insert({
      id: packetId,
      user_id: userId,
      recommendation_id: recommendationId,
      listing_id: listingId,
      status: "ready",
      application_url: input.applicationUrl || null,
      requested_at: nowIso,
      ready_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 4. Insert job application
    const { data: createdApp, error: appError } = await supabase
      .from("job_applications")
      .insert({
        id: applicationId,
        user_id: userId,
        listing_id: listingId,
        recommendation_id: recommendationId,
        application_packet_id: packetId,
        status: input.status,
        applied_at: input.appliedAt || nowIso,
        interview_at: input.interviewAt || null,
        user_note: input.userNote || null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .single();

    if (appError) {
      console.error("[manual-app] application insert error:", appError);
      return NextResponse.json(
        { error: "Could not create application record." },
        { status: 500 },
      );
    }

    // 5. Insert application event
    await supabase.from("job_application_events").insert({
      id: crypto.randomUUID(),
      application_id: applicationId,
      user_id: userId,
      from_status: "ready",
      to_status: input.status,
      note: input.userNote || "Manually logged application",
      occurred_at: nowIso,
      created_at: nowIso,
    });

    return NextResponse.json({
      success: true,
      applicationId: createdApp.id,
    });
  } catch (err) {
    console.error("[manual-app] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to log application." },
      { status: 500 },
    );
  }
}
