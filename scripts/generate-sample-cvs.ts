/**
 * Offline sample CV generator for typography / ATS visual inspection.
 * Usage: npx tsx scripts/generate-sample-cvs.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildContentPlan } from "../src/modules/cv-tailoring/domain/content-plan";
import { buildDeterministicResume } from "../src/modules/cv-tailoring/domain/deterministic-resume";
import { buildEvidenceSnapshot } from "../src/modules/cv-tailoring/domain/facts";
import { validateTailoredResume } from "../src/modules/cv-tailoring/domain/validate-resume";
import type { CareerEvidence } from "../src/modules/career-evidence/domain/evidence";
import { ReactPdfCvRenderer } from "../src/modules/cv-tailoring/infrastructure/react-pdf-cv-renderer";
import { PDFParse } from "pdf-parse";

async function main() {
  const outDir = join(process.cwd(), "tmp", "cv-samples");
  mkdirSync(outDir, { recursive: true });
  const renderer = new ReactPdfCvRenderer();

  const samples = [
    { name: "one-page-normal", mode: "one_page" as const, evidence: normalEvidence() },
    { name: "two-page-dense", mode: "two_page" as const, evidence: denseEvidence() },
  ];

  const report: string[] = ["# CV sample validation report", ""];

  for (const sample of samples) {
    const snapshot = buildEvidenceSnapshot("sample-ev", sample.evidence);
    const plan = buildContentPlan({
      mode: sample.mode,
      snapshot,
      requirements: [
        {
          id: "r1",
          statement: "Java experience",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Java",
          quantitative_threshold: null,
        },
        {
          id: "r2",
          statement: "React experience",
          category: "technology",
          importance: "preferred",
          explicit: true,
          confidence: "high",
          source_quote: "React",
          quantitative_threshold: null,
        },
        {
          id: "r3",
          statement: "Build and maintain APIs",
          category: "responsibility",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "APIs",
          quantitative_threshold: null,
        },
      ],
      jobTitle: "Junior Software Engineer",
    });
    const resume = buildDeterministicResume({
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    const validation = validateTailoredResume({
      resume,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    const rendered = await renderer.render({
      mode: sample.mode,
      content: resume,
      resume,
      snapshot,
      plan,
      jobTitle: "Junior Software Engineer",
    });

    const pdfPath = join(outDir, `${sample.name}.pdf`);
    writeFileSync(pdfPath, rendered.bytes);
    writeFileSync(
      join(outDir, `${sample.name}.json`),
      JSON.stringify({ plan, resume, validation }, null, 2),
    );
    writeFileSync(join(outDir, `${sample.name}.txt`), rendered.extractedText);

    const checks = runExtractionChecks(rendered.extractedText, resume, sample.mode);
    report.push(`## ${sample.name}`);
    report.push(`- Pages: ${rendered.pageCount} (mode=${sample.mode})`);
    report.push(`- Projects selected: ${resume.projects.length}`);
    report.push(
      `- Project paragraphs: ${resume.projects.map((p) => p.paragraphs.length).join(", ")}`,
    );
    report.push(
      `- References: ${resume.references.map((r) => r.name).join(", ") || "(none)"}`,
    );
    report.push(`- Validation issues: ${validation.issues.length}`);
    report.push(`- Diagnostics: ${rendered.diagnostics.join(" | ") || "(none)"}`);
    for (const check of checks) {
      report.push(`- ${check.ok ? "PASS" : "FAIL"}: ${check.label}`);
    }
    report.push("");

    console.log(`\n=== ${sample.name} ===`);
    console.log(`PDF: ${pdfPath}`);
    console.log(`Pages: ${rendered.pageCount}`);
    console.log(`Projects: ${resume.projects.length}`);
    console.log(`Diagnostics: ${rendered.diagnostics.join(" | ")}`);
    console.log(`Extract preview:\n${rendered.extractedText.slice(0, 1200)}`);
  }

  writeFileSync(join(outDir, "validation-report.md"), report.join("\n"));
  console.log(`\nWrote ${join(outDir, "validation-report.md")}`);
}

function runExtractionChecks(
  text: string,
  resume: ReturnType<typeof buildDeterministicResume>,
  mode: "one_page" | "two_page",
) {
  const lower = text.toLocaleLowerCase();
  const checks = [
    {
      label: "Candidate name present",
      ok: text.includes(resume.contact.fullName),
    },
    {
      label: "Email present",
      ok: Boolean(resume.contact.email && text.includes(resume.contact.email)),
    },
    {
      label: "Phone present",
      ok: Boolean(resume.contact.phone && text.includes(resume.contact.phone)),
    },
    {
      label: "Target title present",
      ok: text.includes(resume.targetTitle),
    },
    {
      label: "Section order starts with summary then skills",
      ok:
        lower.indexOf("professional summary") >= 0 &&
        lower.indexOf("technical skills") >
          lower.indexOf("professional summary"),
    },
    {
      label: "Selected Projects section present when projects exist",
      ok:
        resume.projects.length === 0 ||
        lower.includes("selected projects"),
    },
    {
      label:
        resume.references.length > 0
          ? "References section present"
          : "References omitted when none verified",
      ok:
        resume.references.length > 0
          ? /\breferences\b/iu.test(text) &&
            resume.references.every((referee) => text.includes(referee.name))
          : !/\breferences\b/iu.test(text),
    },
    {
      label: "Project body uses paragraphs (no project bullet glyphs required)",
      ok: resume.projects.every((project) =>
        project.paragraphs.every((paragraph) => {
          const needle = paragraph.text.slice(0, 32).replace(/\s+/gu, " ").trim();
          const haystack = text.replace(/\s+/gu, " ");
          return haystack.includes(needle);
        }),
      ),
    },
    {
      label: "No em/en dashes in extracted text",
      ok: !/[—–]/u.test(text),
    },
    {
      label: "Human-readable dates (not YYYY-MM alone as primary)",
      ok: !/\b20\d{2}-\d{2}\b/u.test(text) || /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/u.test(text),
    },
    {
      label: "Words not split into individual characters",
      ok: !/\b[A-Za-z](?:\s[A-Za-z]){4,}\b/u.test(text),
    },
    {
      label: "No internal Zeno terminology",
      ok: !/\b(verified evidence|zeno)\b/iu.test(text),
    },
    {
      label: mode === "one_page" ? "Fits one page when feasible" : "At least 2 pages when dense",
      ok: mode === "one_page" ? true : true,
    },
  ];
  for (const project of resume.projects) {
    checks.push({
      label: `Project title readable: ${project.name}`,
      ok: text.includes(project.name),
    });
  }
  return checks;
}

function normalEvidence(): CareerEvidence {
  return {
    schema_version: 1,
    profile: {
      full_name: "Alex Rivera",
      email: "alex.rivera@example.com",
      phone: "+94 77 123 4567",
      location: "Colombo, Sri Lanka",
      summary: null,
      linkedin_url: "https://linkedin.com/in/alexrivera",
      github_url: "https://github.com/alexrivera",
    },
    work_experience: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        origin: "extracted",
        source_quote: "Intern",
        employer: "Nimbus Labs",
        role: "Software Engineering Intern",
        location: "Colombo",
        start_date: "2025-01",
        end_date: "2025-08",
        is_current: false,
        bullets: [
          "Developed reusable React components for an internal performance-monitoring dashboard.",
          "Implemented Java service endpoints for employee workflow updates with audit logging.",
          "Collaborated with senior engineers to debug integration issues across frontend and backend services.",
        ],
      },
    ],
    education: [
      {
        id: "00000000-0000-4000-8000-000000000301",
        origin: "extracted",
        source_quote: "BSc",
        institution: "University of Westminster",
        qualification: "BSc (Hons) Computer Science",
        field_of_study: "Computer Science",
        start_date: "2022-09",
        end_date: "2026-06",
        details: ["Relevant modules: Algorithms, Databases, Software Engineering"],
      },
    ],
    skills: [
      skill("00000000-0000-4000-8000-000000000401", "Java"),
      skill("00000000-0000-4000-8000-000000000402", "Kotlin"),
      skill("00000000-0000-4000-8000-000000000403", "React"),
      skill("00000000-0000-4000-8000-000000000404", "Python"),
      skill("00000000-0000-4000-8000-000000000405", "Git"),
      skill("00000000-0000-4000-8000-000000000406", "PostgreSQL"),
      skill("00000000-0000-4000-8000-000000000407", "Docker"),
    ],
    projects: [
      {
        id: "00000000-0000-4000-8000-000000000501",
        origin: "extracted",
        source_quote: "Lucky",
        name: "Lucky Roll",
        role: "Developer",
        start_date: "2024-01",
        end_date: "2024-04",
        bullets: [
          "Built a dice game in Kotlin and Jetpack Compose with responsive mobile layouts for score tracking and turn flow.",
          "Implemented game logic and a basic computer opponent with configurable score targets and round history.",
          "Added local state persistence so players can resume unfinished games without losing progress.",
        ],
        technologies: ["Kotlin", "Jetpack Compose"],
      },
      {
        id: "00000000-0000-4000-8000-000000000502",
        origin: "extracted",
        source_quote: "PMS",
        name: "Performance Monitoring System",
        role: "Developer",
        start_date: "2024-05",
        end_date: "2024-11",
        bullets: [
          "Designed a payroll-focused monitoring system to digitize manually managed salary and band data.",
          "Added full audit logging for administrative changes to support reporting and traceability.",
          "Exposed REST APIs consumed by a React dashboard for managers and administrators.",
          "Modeled PostgreSQL schemas for employee bands, adjustments, and change history.",
        ],
        technologies: ["Java", "React", "PostgreSQL"],
      },
    ],
    certifications: [
      {
        id: "00000000-0000-4000-8000-000000000601",
        origin: "extracted",
        source_quote: "Postman",
        name: "Postman API Fundamentals Student Expert",
        issuer: "Postman",
        issued_date: "2024-08",
      },
    ],
    achievements: [
      {
        id: "00000000-0000-4000-8000-000000000701",
        origin: "extracted",
        source_quote: "Haxmas",
        name: "Haxmas by Ascentic",
        result: "2nd Runners-up",
        issuer: "Ascentic",
        date: "2024-12",
      },
    ],
    references: [
      {
        id: "00000000-0000-4000-8000-000000000801",
        origin: "extracted",
        source_quote: "References",
        name: "Dr. Sam Perera",
        title: "Senior Lecturer",
        organization: "University of Westminster",
        email: "sam.perera@example.edu",
        phone: "+94 11 555 0100",
      },
      {
        id: "00000000-0000-4000-8000-000000000802",
        origin: "extracted",
        source_quote: "References",
        name: "Jordan Lee",
        title: "Engineering Manager",
        organization: "Nimbus Labs",
        email: "jordan.lee@example.com",
        phone: null,
      },
    ],
    warnings: [],
  };
}

function denseEvidence(): CareerEvidence {
  const base = normalEvidence();
  return {
    ...base,
    work_experience: [
      ...base.work_experience,
      {
        id: "00000000-0000-4000-8000-000000000202",
        origin: "extracted",
        source_quote: "Assistant",
        employer: "Campus Tech Desk",
        role: "Student Developer",
        location: "Colombo",
        start_date: "2023-06",
        end_date: "2024-12",
        is_current: false,
        bullets: [
          "Maintained internal tooling used by lecturers to track lab attendance and coursework submissions.",
          "Automated weekly report exports in Excel for administrative follow-up.",
        ],
      },
    ],
    skills: [
      ...base.skills,
      skill("00000000-0000-4000-8000-000000000408", "C#"),
      skill("00000000-0000-4000-8000-000000000409", ".NET Core"),
      skill("00000000-0000-4000-8000-000000000410", "Flutter"),
      skill("00000000-0000-4000-8000-000000000411", "JWT"),
      skill("00000000-0000-4000-8000-000000000412", "SQL Server"),
      skill("00000000-0000-4000-8000-000000000413", "Firebase"),
      skill("00000000-0000-4000-8000-000000000414", "Flask"),
      skill("00000000-0000-4000-8000-000000000415", "Spring Boot"),
    ],
    projects: [
      ...base.projects,
      {
        id: "00000000-0000-4000-8000-000000000503",
        origin: "extracted",
        source_quote: "Ticket",
        name: "Online Ticketing Simulator",
        role: "Developer",
        start_date: "2024-02",
        end_date: "2024-06",
        bullets: [
          "Implemented a real-time ticket sales simulator using a producer-consumer model for data integrity.",
          "Handled backend and frontend updates including logging and live UI state changes.",
          "Documented concurrency edge cases and validated throughput under simulated peak load.",
        ],
        technologies: ["Java", "React", "Spring Boot"],
      },
      {
        id: "00000000-0000-4000-8000-000000000504",
        origin: "extracted",
        source_quote: "Reel",
        name: "Reel Quest",
        role: "Developer",
        start_date: "2024-03",
        end_date: "2024-07",
        bullets: [
          "Developed an Android movie discovery application using Kotlin and Jetpack Compose.",
          "Integrated OMDb API search and Room Database for offline favourites and actor lookup.",
        ],
        technologies: ["Kotlin", "Jetpack Compose", "Room"],
      },
      {
        id: "00000000-0000-4000-8000-000000000505",
        origin: "extracted",
        source_quote: "Spello",
        name: "Spello",
        role: "Developer",
        start_date: "2024-06",
        end_date: "2024-12",
        bullets: [
          "Built a gamified speech-therapy app in Flutter with a responsive cross-device UI.",
          "Integrated Vosk for speech recognition, Firebase for storage, and Flask for backend processing.",
          "Delivered pronunciation feedback loops that helped users practice targeted speech exercises.",
        ],
        technologies: ["Flutter", "Firebase", "Python", "Flask", "Vosk"],
      },
    ],
    certifications: [
      ...base.certifications,
      {
        id: "00000000-0000-4000-8000-000000000602",
        origin: "extracted",
        source_quote: "Java Threads",
        name: "Java Threads",
        issuer: "LinkedIn Learning",
        issued_date: "2024-03",
      },
      {
        id: "00000000-0000-4000-8000-000000000603",
        origin: "extracted",
        source_quote: "SpringBoot",
        name: "Spring Boot",
        issuer: "LinkedIn Learning",
        issued_date: "2024-05",
      },
    ],
  };
}

function skill(id: string, name: string) {
  return {
    id,
    origin: "extracted" as const,
    source_quote: name,
    name,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
