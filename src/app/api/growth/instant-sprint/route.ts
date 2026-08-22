import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/server/auth";
import { getServerConfig } from "@/server/config";
import { createSupabaseClient } from "@/server/supabase-client";

export const dynamic = "force-dynamic";

const instantSprintSchema = z.object({
  targetRole: z.string().trim().optional(),
  weeklyHours: z.number().min(2).max(20).default(5),
  selectedIdea: z
    .object({
      title: z.string(),
      tagline: z.string(),
      marketAdvantage: z.string().optional(),
      technologies: z.array(z.string()).optional(),
      milestones: z.array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          week: z.number().optional(),
        }),
      ),
      expectedEvidence: z.array(z.string()).optional(),
    })
    .optional(),
});

const PRESET_SPRINTS: Record<
  string,
  {
    title: string;
    objective: string;
    milestones: string[];
    expectedEvidence: string[];
  }
> = {
  devops: {
    title: "Cloud-Native Infrastructure & CI/CD Pipeline",
    objective:
      "Design and deploy production-grade automated deployment pipelines, Docker containerization, and Terraform Infrastructure as Code.",
    milestones: [
      "Containerize backend services with Docker & multi-stage caching",
      "Author Terraform scripts to provision cloud VPC, subnets, and cluster",
      "Build GitHub Actions CI/CD with automated test suites & security scans",
      "Deploy Prometheus & Grafana observability dashboard with alerting",
    ],
    expectedEvidence: [
      "GitHub repository with Terraform IaC and GitHub Actions workflows",
      "Live deployment demo on cloud provider",
    ],
  },
  ai: {
    title: "End-to-End LLM Agent & Retrieval System",
    objective:
      "Build and evaluate a production-ready AI agent with vector search embeddings, semantic chunking, and tool calling.",
    milestones: [
      "Implement vector embedding ingestion and hybrid similarity search",
      "Construct multi-step agent tool calling with structured JSON outputs",
      "Integrate eval harness measuring latency, hallucination rate, and retrieval accuracy",
      "Deploy optimized API with streaming SSE responses and token caching",
    ],
    expectedEvidence: [
      "Working AI agent repository with evaluation benchmarks and demo video",
    ],
  },
  fullstack: {
    title: "High-Scale Modern Full-Stack Web Application",
    objective:
      "Engineer a production-ready full-stack application featuring server-side rendering, resilient state management, and real-time synchronization.",
    milestones: [
      "Architect Next.js / TypeScript domain model with strict type invariants",
      "Implement real-time WebSocket / SSE updates with optimistic UI reconciliation",
      "Configure database indexing, migration scripts, and Redis caching layer",
      "Achieve 95+ Lighthouse performance score and full test suite coverage",
    ],
    expectedEvidence: [
      "Full-stack public repository with automated test suite and live URL",
    ],
  },
};

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const parsed = instantSprintSchema.safeParse(body);
  const input = parsed.success ? parsed.data : { targetRole: "Software Engineer", weeklyHours: 5 };

  let sprintTemplate = {
    title: input.selectedIdea?.title ?? "Full-Stack Project Sprint",
    objective: input.selectedIdea?.tagline ?? "Production-ready engineering project for portfolio.",
    milestones: input.selectedIdea?.milestones.map((m) => m.title) ?? [],
    expectedEvidence: input.selectedIdea?.expectedEvidence ?? ["Public GitHub repository with documentation"],
  };

  if (!input.selectedIdea || sprintTemplate.milestones.length === 0) {
    const roleLower = (input.targetRole ?? "software engineer").toLowerCase();
    let fallback = PRESET_SPRINTS.fullstack!;
    if (roleLower.includes("devops") || roleLower.includes("cloud") || roleLower.includes("sre") || roleLower.includes("infra")) {
      fallback = PRESET_SPRINTS.devops!;
    } else if (roleLower.includes("ai") || roleLower.includes("machine learning") || roleLower.includes("ml") || roleLower.includes("data")) {
      fallback = PRESET_SPRINTS.ai!;
    }
    sprintTemplate = fallback;
  }

  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const now = new Date();
  const nowIso = now.toISOString();
  const startDate = now.toISOString().slice(0, 10);
  const targetDateObj = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
  const targetDate = targetDateObj.toISOString().slice(0, 10);

  try {
    // 1. Ensure user has a campaign
    let campaignId: string;
    const { data: existingCampaign } = await supabase
      .from("job_search_campaigns")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCampaign?.id) {
      campaignId = existingCampaign.id;
    } else {
      campaignId = crypto.randomUUID();
      const canonicalSearchId = crypto.randomUUID();

      await supabase.from("canonical_job_searches").insert({
        id: canonicalSearchId,
        normalized_role: input.targetRole || "Software Engineer",
        normalized_location: "Remote",
        work_mode: "remote",
        employment_types: ["full_time"],
        experience_levels: ["mid"],
        fingerprint: `instant-${canonicalSearchId}`,
        created_at: nowIso,
        updated_at: nowIso,
      });

      await supabase.from("job_search_campaigns").insert({
        id: campaignId,
        user_id: userId,
        name: input.targetRole || "Career Growth Campaign",
        status: "active",
        primary_role: input.targetRole || "Software Engineer",
        location: "Remote",
        work_mode: "remote",
        employment_types: ["full_time"],
        experience_levels: ["mid"],
        minimum_score: 55,
        criteria_version: 1,
        canonical_search_id: canonicalSearchId,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // 2. Create assessment request
    const requestId = crypto.randomUUID();
    await supabase.from("growth_assessment_requests").insert({
      id: requestId,
      user_id: userId,
      campaign_id: campaignId,
      criteria_fingerprint: "instant-v1",
      evidence_version: "v1",
      workload_version: "v1",
      mode: "preliminary",
      status: "completed",
      completed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 3. Create assessment
    const assessmentId = crypto.randomUUID();
    await supabase.from("growth_assessments").insert({
      id: assessmentId,
      user_id: userId,
      campaign_id: campaignId,
      request_id: requestId,
      evidence_version: "v1",
      mode: "preliminary",
      highest_priority_gap_key: "technical_depth",
      market_sample_size: 10,
      market_evidence_summary: "Instant growth assessment for targeted market elevation.",
      input_fingerprint: `instant-${assessmentId}`,
      used_model: false,
      created_at: nowIso,
    });

    // 4. Create recommendation
    const recommendationId = crypto.randomUUID();
    await supabase.from("growth_recommendations").insert({
      id: recommendationId,
      user_id: userId,
      campaign_id: campaignId,
      assessment_id: assessmentId,
      type: "new_project",
      gap_key: "technical_depth",
      title: sprintTemplate.title,
      summary: sprintTemplate.objective,
      rationale: "Accelerates interview readiness and creates tangible verified evidence for employers.",
      evidence_gap: "Requires demonstrated hands-on technical project evidence.",
      expected_evidence: sprintTemplate.expectedEvidence,
      estimated_weeks: 4,
      estimated_hours_per_week: input.weeklyHours,
      proposed_milestones: sprintTemplate.milestones.map((title, idx) => ({
        title,
        position: idx,
        is_stretch: idx === sprintTemplate.milestones.length - 1,
      })),
      status: "accepted",
      fingerprint: `instant-rec-${recommendationId}`,
      opened_at: nowIso,
      accepted_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 5. Create project
    const projectId = crypto.randomUUID();
    const { data: project, error: projErr } = await supabase
      .from("growth_projects")
      .insert({
        id: projectId,
        user_id: userId,
        source_recommendation_id: recommendationId,
        title: sprintTemplate.title,
        objective: sprintTemplate.objective,
        status: "in_progress",
        start_date: startDate,
        target_date: targetDate,
        estimated_hours_per_week: input.weeklyHours,
        progress: 0,
        expected_evidence: sprintTemplate.expectedEvidence,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .single();

    if (projErr) {
      console.error("[instant-growth] project insert error:", projErr);
      return NextResponse.json(
        { error: "Could not provision growth project." },
        { status: 500 },
      );
    }

    // 6. Connect project to campaign
    await supabase.from("growth_project_campaigns").insert({
      project_id: projectId,
      campaign_id: campaignId,
      user_id: userId,
    });

    // 7. Insert milestones
    for (let i = 0; i < sprintTemplate.milestones.length; i++) {
      const milestoneTitle = sprintTemplate.milestones[i]!;
      await supabase.from("growth_milestones").insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: userId,
        position: i,
        title: milestoneTitle,
        description: `Complete and verify: ${milestoneTitle}`,
        status: i === 0 ? "in_progress" : "todo",
        is_required: i < sprintTemplate.milestones.length - 1,
        target_date: new Date(now.getTime() + (i + 1) * 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    return NextResponse.json({
      success: true,
      projectId: project.id,
    });
  } catch (err) {
    console.error("[instant-growth] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to generate instant growth sprint." },
      { status: 500 },
    );
  }
}
