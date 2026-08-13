/**
 * Evidence-retention regression: regenerate one/two-page CVs from the demo user's
 * verified evidence against a Junior Software Engineer-style vacancy.
 *
 * Usage:
 *   npx --yes pnpm@11.20.0 exec tsx --env-file=.env.local scripts/evidence-retention-regression.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";

import { careerEvidenceSchema } from "../src/modules/career-evidence/domain/evidence";
import { buildContentPlan } from "../src/modules/cv-tailoring/domain/content-plan";
import {
  assessContentDensity,
  countMeaningfulWords,
  enrichResumeFromSelectedEvidence,
} from "../src/modules/cv-tailoring/domain/content-density";
import { looksIncompleteProse } from "../src/modules/cv-tailoring/domain/content-integrity";
import { buildDeterministicResume } from "../src/modules/cv-tailoring/domain/deterministic-resume";
import { buildEvidenceSnapshot } from "../src/modules/cv-tailoring/domain/facts";
import { recoverEvidenceFromCvText } from "../src/modules/cv-tailoring/domain/recover-evidence-from-cv-text";
import { assembleTailoredResume } from "../src/modules/cv-tailoring/domain/assemble-resume";
import { normalizeGroqDraft } from "../src/modules/cv-tailoring/domain/deterministic-resume";
import { validateTailoredResume } from "../src/modules/cv-tailoring/domain/validate-resume";
import { GroqCvLanguageTailorer } from "../src/modules/cv-tailoring/infrastructure/groq-cv-tailorer";
import { ReactPdfCvRenderer } from "../src/modules/cv-tailoring/infrastructure/react-pdf-cv-renderer";
import { buildSkillInventory } from "../src/modules/cv-tailoring/domain/skill-inventory";
import type { JobRequirement } from "../src/modules/career-intelligence/domain/schemas";
import type { TailoredResume } from "../src/modules/cv-tailoring/domain/tailored-resume";
import type { CvMode } from "../src/modules/cv-tailoring/domain/schemas";

const JUNIOR_SE_REQUIREMENTS: JobRequirement[] = [
  {
    id: "r1",
    statement: "Software engineering fundamentals",
    category: "domain",
    importance: "required",
    explicit: true,
    confidence: "high",
    source_quote: "software engineering",
    quantitative_threshold: null,
  },
  {
    id: "r2",
    statement: "Experience with modern web frameworks such as React",
    category: "technology",
    importance: "preferred",
    explicit: true,
    confidence: "high",
    source_quote: "React",
    quantitative_threshold: null,
  },
  {
    id: "r3",
    statement: "Backend or full-stack application development",
    category: "domain",
    importance: "preferred",
    explicit: true,
    confidence: "medium",
    source_quote: "full-stack",
    quantitative_threshold: null,
  },
  {
    id: "r4",
    statement: "Database experience",
    category: "technology",
    importance: "preferred",
    explicit: true,
    confidence: "medium",
    source_quote: "SQL",
    quantitative_threshold: null,
  },
];

async function main() {
  const demoUserId = process.env.DEMO_USER_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";

  if (!demoUserId || !supabaseUrl || !serviceKey) {
    throw new Error("Missing DEMO_USER_ID / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("career_evidence_sets")
    .select("id, evidence, status, updated_at, source_document_id")
    .eq("user_id", demoUserId)
    .eq("status", "verified")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No verified career evidence found for demo user");

  const evidence = careerEvidenceSchema.parse(data.evidence);
  const { data: doc } = await supabase
    .from("cv_documents")
    .select("extracted_text")
    .eq("id", data.source_document_id ?? "")
    .maybeSingle();
  const recovered = recoverEvidenceFromCvText(
    evidence,
    (doc?.extracted_text as string | null) ?? null,
  );
  const snapshot = buildEvidenceSnapshot(data.id, recovered);
  const outDir = join(process.cwd(), "tmp", "evidence-retention");
  mkdirSync(outDir, { recursive: true });

  const renderer = new ReactPdfCvRenderer();
  const tailorer = groqKey
    ? new GroqCvLanguageTailorer(groqKey, groqModel)
    : null;

  const report: Record<string, unknown> = {
    evidenceSetId: data.id,
    masterFactCount: snapshot.facts.length,
    masterBulletFacts: snapshot.facts.filter((f) => f.kind === "bullet").length,
    profileLinks: {
      linkedin: recovered.profile.linkedin_url ?? null,
      github: recovered.profile.github_url ?? null,
      portfolio: recovered.profile.portfolio_url ?? null,
    },
    projects: recovered.projects.map((p) => ({
      name: p.name,
      bulletCount: p.bullets.length,
      technologies: p.technologies,
      bullets: p.bullets,
    })),
    skills: recovered.skills.map((s) => s.name),
    certifications: recovered.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
    })),
    achievements: recovered.achievements,
    modes: {} as Record<string, unknown>,
  };

  for (const mode of ["one_page", "two_page"] as CvMode[]) {
    const plan = buildContentPlan({
      mode,
      snapshot,
      requirements: JUNIOR_SE_REQUIREMENTS,
      jobTitle: "Junior Software Engineer",
      requestedMode: mode,
    });

    let resume: TailoredResume;
    if (tailorer) {
      const selected = {
        items: snapshot.items.filter((item) =>
          new Set([
            ...plan.experienceItemIds,
            ...plan.projectItemIds,
            ...plan.educationItemIds,
            ...plan.skillItemIds,
            ...plan.certificationItemIds,
            ...plan.achievementItemIds,
            "profile",
          ]).has(item.id),
        ),
        facts: snapshot.facts.filter((fact) =>
          new Set([
            ...plan.experienceItemIds,
            ...plan.projectItemIds,
            ...plan.educationItemIds,
            ...plan.skillItemIds,
            ...plan.certificationItemIds,
            ...plan.achievementItemIds,
            "profile",
          ]).has(fact.careerItemId),
        ),
      };
      try {
        const { draft } = await tailorer.tailor({
          jobTitle: "Junior Software Engineer",
          company: null,
          mode,
          tailoringContext: null,
          requirements: JUNIOR_SE_REQUIREMENTS,
          selectedEvidence: selected,
          keywordAudit: plan.keywordAudit.filter(
            (entry) =>
              entry.support_state === "supported" ||
              entry.support_state === "partial",
          ),
          skillInventory: buildSkillInventory(snapshot).displayNames,
          plan,
        });
        const normalized = normalizeGroqDraft(draft, snapshot);
        resume = assembleTailoredResume({
          draft: normalized,
          snapshot,
          plan,
          assessment: {
            factuallyValid: true,
            jobAlignment: plan.jobAlignment,
            supportedKeywords: plan.keywordAudit
              .filter(
                (e) =>
                  e.support_state === "supported" ||
                  e.support_state === "partial",
              )
              .map((e) => e.keyword),
            transferableKeywords: [],
            missingKeywords: [],
            generationStatus: "success",
          },
        });
        const validation = validateTailoredResume({
          resume,
          plan,
          snapshot,
          keywordAudit: plan.keywordAudit,
        });
        if (!validation.ok) {
          resume = buildDeterministicResume({
            plan,
            snapshot,
            keywordAudit: plan.keywordAudit,
          });
        }
      } catch (err) {
        console.warn(`[${mode}] Groq failed, using deterministic:`, err);
        resume = buildDeterministicResume({
          plan,
          snapshot,
          keywordAudit: plan.keywordAudit,
        });
      }
    } else {
      resume = buildDeterministicResume({
        plan,
        snapshot,
        keywordAudit: plan.keywordAudit,
      });
    }

    const density = assessContentDensity({ resume, plan, snapshot });
    if (density.thin) {
      resume = enrichResumeFromSelectedEvidence({ resume, plan, snapshot });
    }

    const rendered = await renderer.render({
      mode,
      content: resume,
      snapshot,
      plan,
      jobTitle: "Junior Software Engineer",
      resume,
    });

    const base = mode === "one_page" ? "one-page" : "two-page";
    const pdfPath = join(outDir, `${base}.pdf`);
    const jsonPath = join(outDir, `${base}.json`);
    const txtPath = join(outDir, `${base}.txt`);
    writeFileSync(pdfPath, rendered.bytes);
    writeFileSync(jsonPath, JSON.stringify(resume, null, 2));
    writeFileSync(txtPath, rendered.extractedText);

    const incomplete = [
      resume.summary.text,
      ...resume.experience.flatMap((r) => r.bullets.map((b) => b.text)),
      ...resume.projects.flatMap((p) => p.paragraphs.map((b) => b.text)),
    ].filter((t) => looksIncompleteProse(t));

    (report.modes as Record<string, unknown>)[mode] = {
      pdfPath,
      pageCount: rendered.pageCount,
      wordCount: countMeaningfulWords(resume),
      previousApproxWords: mode === "one_page" ? 268 : 375,
      selectedProjects: plan.projectItemIds.map((id) => {
        const item = snapshot.items.find((entry) => entry.id === id);
        return item && item.type === "project" ? item.name : id;
      }),
      projectParagraphCounts: resume.projects.map((p) => ({
        name: p.name,
        paragraphs: p.paragraphs.length,
        words: p.paragraphs.reduce(
          (sum, paragraph) =>
            sum + paragraph.text.trim().split(/\s+/).filter(Boolean).length,
          0,
        ),
        technologies: p.technologies,
      })),
      references: resume.references.map((r) => r.name),
      experienceBulletCounts: resume.experience.map((r) => ({
        employer: r.employer,
        bullets: r.bullets.length,
      })),
      skills: resume.skills,
      links: {
        linkedin: resume.contact.linkedinUrl,
        github: resume.contact.githubUrl,
        portfolio: resume.contact.portfolioUrl,
      },
      education: resume.education,
      certifications: resume.certifications,
      achievements: resume.achievements,
      density,
      incompleteStrings: incomplete,
      diagnostics: rendered.diagnostics,
    };

    console.log(
      `[${mode}] pages=${rendered.pageCount} words=${countMeaningfulWords(resume)} pdf=${pdfPath}`,
    );
  }

  const reportPath = join(outDir, "retention-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const mdPath = join(outDir, "retention-report.md");
  writeFileSync(mdPath, formatMarkdownReport(report));
  console.log(`Report: ${mdPath}`);
}

function formatMarkdownReport(report: Record<string, unknown>): string {
  const modes = report.modes as Record<
    string,
    {
      wordCount: number;
      previousApproxWords: number;
      pageCount: number;
      pdfPath: string;
      selectedProjects: string[];
      projectBulletCounts: Array<{
        name: string;
        bullets: number;
        technologies: string[];
      }>;
      links: Record<string, string | null | undefined>;
      incompleteStrings: string[];
      education: unknown[];
      certifications: unknown[];
      achievements: unknown[];
      skills: Array<{ category: string; items: string[] }>;
    }
  >;

  const lines = [
    "# Evidence retention regression",
    "",
    `Evidence set: \`${report.evidenceSetId}\``,
    `Master facts: ${report.masterFactCount} (bullets: ${report.masterBulletFacts})`,
    "",
    "## Profile links in master evidence",
    "```json",
    JSON.stringify(report.profileLinks, null, 2),
    "```",
    "",
    "## Master projects",
    "```json",
    JSON.stringify(report.projects, null, 2),
    "```",
    "",
  ];

  for (const mode of ["two_page", "one_page"]) {
    const m = modes[mode];
    if (!m) continue;
    lines.push(`## ${mode}`);
    lines.push(`- PDF: \`${m.pdfPath}\``);
    lines.push(`- Pages: ${m.pageCount}`);
    lines.push(
      `- Words: **${m.wordCount}** (previous ~${m.previousApproxWords})`,
    );
    lines.push(`- Selected projects: ${m.selectedProjects.join(", ")}`);
    lines.push(`- Links: ${JSON.stringify(m.links)}`);
    lines.push(
      `- Incomplete strings detected: ${m.incompleteStrings.length}`,
    );
    lines.push("### Project depth");
    lines.push("```json");
    lines.push(JSON.stringify(m.projectBulletCounts, null, 2));
    lines.push("```");
    lines.push("### Skills");
    lines.push("```json");
    lines.push(JSON.stringify(m.skills, null, 2));
    lines.push("```");
    lines.push("### Education / certs / achievements");
    lines.push("```json");
    lines.push(
      JSON.stringify(
        {
          education: m.education,
          certifications: m.certifications,
          achievements: m.achievements,
        },
        null,
        2,
      ),
    );
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
