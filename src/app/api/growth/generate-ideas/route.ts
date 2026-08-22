import { NextResponse } from "next/server";
import { z } from "zod";
import { generateText, Output } from "ai";

import { requireUserId } from "@/server/auth";
import { getServerConfig } from "@/server/config";
import { getGroqKeyPool } from "@/server/groq";
import { createSupabaseClient } from "@/server/supabase-client";
import { SupabaseEvidenceRepository } from "@/modules/career-evidence/infrastructure/supabase-evidence-repository";

export const dynamic = "force-dynamic";

const generateIdeasInputSchema = z.object({
  targetRole: z.string().trim().min(1).default("Software Engineer"),
});

export const projectIdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  tagline: z.string(),
  marketAdvantage: z.string(),
  technologies: z.array(z.string()),
  milestones: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      week: z.number(),
    }),
  ),
  expectedEvidence: z.array(z.string()),
});

export type GeneratedProjectIdea = z.infer<typeof projectIdeaSchema>;

const ideasResponseSchema = z.object({
  ideas: z.array(projectIdeaSchema).min(1).max(3),
});

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

  const parsed = generateIdeasInputSchema.safeParse(body);
  const targetRole = parsed.success ? parsed.data.targetRole : "Software Engineer";

  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const evidenceRepo = new SupabaseEvidenceRepository(supabase);

  // Fetch verified profile evidence
  const evidenceRecord = await evidenceRepo.getCurrent(userId).catch(() => null);
  const profileSkills = evidenceRecord?.evidence?.skills?.map((s) => s.name) ?? [];
  const profileExperiences =
    evidenceRecord?.evidence?.work_experience?.map(
      (w) => `${w.role} at ${w.employer}`,
    ) ?? [];

  const keyPool = getGroqKeyPool();
  const prompt = `Candidate Background:
- Verified Skills: ${profileSkills.length > 0 ? profileSkills.join(", ") : "General programming fundamentals"}
- Recent Experience: ${profileExperiences.length > 0 ? profileExperiences.join("; ") : "Software engineering background"}
- Desired Target Role: "${targetRole}"

Task:
Analyze the current industry hiring market for "${targetRole}". Identify 3 distinct, modern, production-grade project ideas that will bridge the candidate's skill gaps and make their CV immediately stand out to hiring managers.
Each idea must be realistic to complete in 4 weeks (2-10 hrs/week) and culminate in verifiable proof (GitHub repo, live deployment, architecture documentation).

Provide exactly 3 distinct project ideas with 4 chronological milestones each.`;

  try {
    const result = await keyPool.withKey(
      async (apiKey) => {
        const { output } = await generateText({
          model: keyPool.createModel(apiKey, config.GROQ_MODEL),
          temperature: 0.2,
          maxOutputTokens: 1200,
          output: Output.object({ schema: ideasResponseSchema }),
          system: `You are an elite principal engineer and technical hiring manager. You design high-impact portfolio projects that prove real engineering depth on a candidate's CV.
Focus on modern toolchains (e.g., Docker, Kubernetes, Terraform, Prometheus, Vector DBs, Kafka, TypeScript, Next.js, Go) that hiring managers actively look for.`,
          prompt,
        });
        return output;
      },
      { rotateOnRateLimit: true, rotateOnToolFailure: false },
    );

    if (result?.ideas && result.ideas.length >= 2) {
      return NextResponse.json({ ideas: result.ideas });
    }
  } catch (err) {
    console.error("[generate-ideas] LLM generation failed, falling back to curated blueprints:", err);
  }

  // Curated fallback blueprints if LLM is temporarily unavailable
  const fallbackIdeas = getCuratedFallbackIdeas(targetRole);
  return NextResponse.json({ ideas: fallbackIdeas });
}

function getCuratedFallbackIdeas(targetRole: string): GeneratedProjectIdea[] {
  const lower = targetRole.toLowerCase();

  if (lower.includes("devops") || lower.includes("cloud") || lower.includes("sre") || lower.includes("infra")) {
    return [
      {
        id: "idea_1",
        title: "Multi-Region Cloud Infrastructure & CI/CD Pipeline",
        category: "Cloud & Infrastructure as Code",
        tagline: "Automated container orchestration with Terraform, GitHub Actions, and multi-stage Docker builds.",
        marketAdvantage: "Demonstrates production cloud provisioning and immutable deployment pipelines.",
        technologies: ["Terraform", "Docker", "AWS/GCP", "GitHub Actions", "Nginx"],
        milestones: [
          { week: 1, title: "Containerization & Multi-Stage Docker", description: "Package services with optimized, secure alpine container images." },
          { week: 2, title: "Terraform Infrastructure as Code", description: "Write modular Terraform scripts provisioning VPC, subnets, and cloud clusters." },
          { week: 3, title: "Automated CI/CD Pipeline", description: "Build GitHub Actions workflow for linting, security scans, and auto-deployments." },
          { week: 4, title: "TLS & Reverse Proxy Configuration", description: "Configure automated SSL certificates and reverse proxy routing." },
        ],
        expectedEvidence: ["GitHub repository with Terraform modules and active CI/CD badges", "Live deployed cloud endpoint"],
      },
      {
        id: "idea_2",
        title: "Observability & Incident Telemetry Cluster",
        category: "Site Reliability & Monitoring",
        tagline: "Centralized Prometheus, Grafana, and OpenTelemetry logging pipeline with automated alerts.",
        marketAdvantage: "Proves you know how to operate, debug, and monitor production systems at scale.",
        technologies: ["Prometheus", "Grafana", "OpenTelemetry", "Loki", "Alertmanager"],
        milestones: [
          { week: 1, title: "OpenTelemetry Instrumentation", description: "Instrument services to emit traces, RED metrics, and structured logs." },
          { week: 2, title: "Prometheus Metric Collection", description: "Deploy Prometheus scrapers and configure service discovery." },
          { week: 3, title: "Grafana Dashboard Suite", description: "Build real-time dashboards monitoring p99 latency, error rates, and CPU load." },
          { week: 4, title: "Alerting & On-Call Simulation", description: "Configure threshold alerts with webhooks and simulate incident remediation." },
        ],
        expectedEvidence: ["Public repo with dashboard JSON definitions and alert configuration", "Live monitoring demo dashboard"],
      },
      {
        id: "idea_3",
        title: "Zero-Downtime Blue/Green Deployment Gateway",
        category: "Release Engineering & Networking",
        tagline: "Traffic shifting reverse-proxy supporting canary releases and instant rollback triggers.",
        marketAdvantage: "Direct proof of progressive delivery and high-availability traffic routing.",
        technologies: ["Go", "Envoy/Traefik", "Docker Compose", "Bash/Python"],
        milestones: [
          { week: 1, title: "Gateway Architecture & Reverse Proxy", description: "Implement dynamic traffic routing proxy." },
          { week: 2, title: "Canary Percentage Shifting", description: "Support weighted traffic splits between v1 and v2 deployments." },
          { week: 3, title: "Automated Health-Check Rollbacks", description: "Trigger instant rollbacks when HTTP 5xx error rate exceeds 1%." },
          { week: 4, title: "Benchmark & Load Testing", description: "Execute wrk/k6 load test proving zero-downtime under heavy traffic." },
        ],
        expectedEvidence: ["GitHub repository with load test results and deployment demonstration"],
      },
    ];
  }

  if (lower.includes("ai") || lower.includes("ml") || lower.includes("machine learning") || lower.includes("data")) {
    return [
      {
        id: "idea_1",
        title: "Multi-Agent Research Assistant with Vector Retrieval",
        category: "Generative AI & Agentic Systems",
        tagline: "Autonomous multi-step research agent using vector embeddings, semantic chunking, and tool calling.",
        marketAdvantage: "Shows real-world proficiency with agentic workflows and retrieval-augmented generation.",
        technologies: ["Python", "LangChain/LlamaIndex", "Qdrant/Pinecone", "Groq/OpenAI", "FastAPI"],
        milestones: [
          { week: 1, title: "Vector Embedding Pipeline", description: "Chunk and ingest domain documents into a vector database." },
          { week: 2, title: "Structured Tool Calling", description: "Implement agent tools for search, document summarization, and data extraction." },
          { week: 3, title: "Evaluation Harness", description: "Measure retrieval precision, answer relevancy, and hallucination rates." },
          { week: 4, title: "FastAPI & Streaming UI", description: "Expose SSE streaming endpoint with token usage tracking and responsive UI." },
        ],
        expectedEvidence: ["Public GitHub repository with evaluation benchmarks and live demo"],
      },
      {
        id: "idea_2",
        title: "Semantic Code Search & Refactoring Engine",
        category: "Developer Tools & NLP",
        tagline: "Natural-language codebase indexer that finds syntax patterns and generates context-aware diffs.",
        marketAdvantage: "Demonstrates practical AI tooling engineering and AST parsing capabilities.",
        technologies: ["TypeScript", "Tree-sitter", "Vector Embeddings", "Next.js"],
        milestones: [
          { week: 1, title: "AST & Code Parsing", description: "Extract functions, classes, and comments using Tree-sitter." },
          { week: 2, title: "Hybrid Code Search", description: "Combine BM25 keyword search with dense vector embeddings." },
          { week: 3, title: "AI Diff Generation", description: "Generate precise unified diffs for refactoring requests." },
          { week: 4, title: "Web UI & Benchmark Suite", description: "Build split-diff viewer with syntax highlighting and latency benchmarks." },
        ],
        expectedEvidence: ["GitHub repository with full documentation and benchmark suite"],
      },
      {
        id: "idea_3",
        title: "Real-Time Streaming Event Anomaly Detector",
        category: "Machine Learning & Stream Processing",
        tagline: "Low-latency anomaly classification for streaming time-series data with automated alerting.",
        marketAdvantage: "Demonstrates production ML serving and low-latency feature pipelines.",
        technologies: ["Python", "FastAPI", "Redis", "Scikit-Learn/PyTorch", "Docker"],
        milestones: [
          { week: 1, title: "Time-Series Ingestion & Windowing", description: "Build streaming data generator and sliding window feature extractor." },
          { week: 2, title: "Model Training & Quantization", description: "Train isolation forest / autoencoder and optimize for <10ms inference." },
          { week: 3, title: "Real-Time Serving Pipeline", description: "Deploy model behind FastAPI with Redis pub/sub queue." },
          { week: 4, title: "Live Dashboard & Alerting", description: "Visualize anomaly scores and emit webhook notifications." },
        ],
        expectedEvidence: ["GitHub repository with test coverage, Dockerfile, and performance metrics"],
      },
    ];
  }

  // Default Full-Stack / Software Engineering
  return [
    {
      id: "idea_1",
      title: "Real-Time Collaborative Workspace with CRDT Sync",
      category: "Full-Stack & Distributed State",
      tagline: "Conflict-free real-time document editor with presence indicators and offline sync.",
      marketAdvantage: "Proves deep mastery of modern web architecture, concurrency, and distributed state.",
      technologies: ["TypeScript", "Next.js", "WebSockets", "Yjs/CRDT", "TailwindCSS"],
      milestones: [
        { week: 1, title: "Domain Model & Rich-Text Engine", description: "Implement document data structures and state management." },
        { week: 2, title: "WebSocket Sync & Presence", description: "Add multi-user live cursors and broadcast channels." },
        { week: 3, title: "Offline Storage & Reconciliation", description: "Persist locally in IndexedDB and reconcile on reconnect." },
        { week: 4, title: "Performance Tuning & 95+ Lighthouse", description: "Optimize bundle size, latency, and automated component tests." },
      ],
      expectedEvidence: ["Public GitHub repository with automated test suite and live URL"],
    },
    {
      id: "idea_2",
      title: "High-Throughput Webhook Delivery & Retry Engine",
      category: "Backend Systems & Reliability",
      tagline: "Resilient asynchronous webhook dispatcher with exponential backoff, rate limiting, and signature verification.",
      marketAdvantage: "Highlights backend systems design, queuing patterns, and idempotency guarantees.",
      technologies: ["Node.js/Go", "PostgreSQL", "Redis/BullMQ", "Docker"],
      milestones: [
        { week: 1, title: "Message Queue & Worker Pipeline", description: "Construct message ingestion with persistent queue backing." },
        { week: 2, title: "Exponential Backoff & Jitter", description: "Implement retry logic with dead-letter queue handling." },
        { week: 3, title: "HMAC Signature Security", description: "Sign webhook payloads with SHA-256 signatures for recipient verification." },
        { week: 4, title: "Analytics & Delivery Logs", description: "Build developer inspection dashboard for failed deliveries." },
      ],
      expectedEvidence: ["GitHub repository with load test benchmarks and documentation"],
    },
    {
      id: "idea_3",
      title: "Self-Hosted API Gateway & Rate Limiter",
      category: "API Architecture & Security",
      tagline: "Reverse-proxy API gateway featuring token bucket rate-limiting, JWT authentication, and request caching.",
      marketAdvantage: "Direct evidence of API security, caching strategies, and gateway architecture.",
      technologies: ["TypeScript", "Redis", "Fastify/Express", "Docker"],
      milestones: [
        { week: 1, title: "Reverse Proxy & Route Matcher", description: "Route upstream microservice requests dynamically." },
        { week: 2, title: "Redis Sliding-Window Rate Limiter", description: "Implement IP and API-key rate limiting headers (X-RateLimit-*)." },
        { week: 3, title: "JWT Auth & Role Guardrails", description: "Validate asymmetric JWT tokens and enforce RBAC policies." },
        { week: 4, title: "Response Caching & Metrics", description: "Cache idempotent GET responses with Cache-Control headers." },
      ],
      expectedEvidence: ["GitHub repository with automated integration test suite"],
    },
  ];
}
