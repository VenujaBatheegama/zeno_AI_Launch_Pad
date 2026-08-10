import { describe, expect, it } from "vitest";

import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobRequirement } from "@/modules/career-intelligence/domain/schemas";

import { buildContentPlan, deriveTargetTitle } from "./content-plan";
import {
  buildDeterministicTailoredContent,
  normalizeTailoredContent,
} from "./deterministic-content";
import { buildEvidenceSnapshot } from "./facts";
import { selectProjectsForCv } from "./project-selection";
import { validateTailoredContent } from "./validation";

describe("graceful CV tailoring (job fit ≠ validity)", () => {
  it("TEST 1 — strong match generates a highly tailored successful CV", () => {
    const evidence = devopsCandidate({
      skills: ["Docker", "Kubernetes", "AWS", "Linux", "Git"],
      projects: [
        project("Infra Pipelines", ["Docker", "Kubernetes", "AWS"], [
          "Automated Kubernetes deploys on AWS",
        ]),
        project("Monitoring Stack", ["Linux", "Docker"], [
          "Operated Linux services with Docker",
        ]),
      ],
    });
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements = reqs([
      "Kubernetes experience required",
      "AWS experience required",
      "Docker experience",
      "Linux fundamentals",
    ]);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "Junior DevOps Engineer",
    });
    const content = buildDeterministicTailoredContent({ plan, snapshot });
    const validation = validateTailoredContent({
      content,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    expect(plan.jobAlignment).toBe("high");
    expect(content.target_title).toMatch(/DevOps/i);
    expect(content.summary).not.toBeNull();
    expect(validation.ok).toBe(true);
    expect(validation.generationStatus).toMatch(/success/);
    expect(validation.supportedKeywords.map((k) => k.toLowerCase())).toEqual(
      expect.arrayContaining(["docker", "kubernetes", "aws", "linux"]),
    );
  });

  it("TEST 2 — partial match succeeds without inventing missing skills", () => {
    const evidence = devopsCandidate({
      skills: ["Docker", "Linux", "Python", "Git"],
      projects: [
        project("API Service", ["Python", "Docker"], [
          "Built APIs with Python and Docker",
        ]),
        project("Campus Shop", ["React"], ["Built a React storefront"]),
      ],
    });
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements = reqs([
      "AWS experience required",
      "Kubernetes experience required",
      "Docker experience",
      "Linux fundamentals",
    ]);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "Junior DevOps Engineer",
    });
    const content = buildDeterministicTailoredContent({ plan, snapshot });
    const allText = serializeContent(content);
    const validation = validateTailoredContent({
      content,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    expect(validation.ok).toBe(true);
    expect(allText).not.toMatch(/\bkubernetes\b/i);
    expect(allText).not.toMatch(/\baws\b/i);
    expect(validation.missingKeywords.map((k) => k.toLowerCase())).toEqual(
      expect.arrayContaining(["aws", "kubernetes"]),
    );
  });

  it("TEST 3 — very weak match still generates with target title and fallback projects", () => {
    const evidence = devopsCandidate({
      skills: ["Python", "Java", "Git"],
      projects: [
        project("React Ecommerce", ["React", "PostgreSQL"], [
          "Built a React ecommerce storefront with PostgreSQL",
        ]),
        project("Java University Project", ["Java"], [
          "Implemented algorithms in Java with Git version control",
        ]),
      ],
    });
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements = reqs([
      "Kubernetes experience required",
      "AWS experience required",
      "CI/CD pipelines",
      "Terraform",
    ]);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "Junior DevOps Engineer",
    });
    const content = buildDeterministicTailoredContent({ plan, snapshot });
    const validation = validateTailoredContent({
      content,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    expect(["low", "very_low"]).toContain(plan.jobAlignment);
    expect(plan.projectItemIds).toHaveLength(2);
    expect(content.target_title).toMatch(/DevOps/i);
    expect(content.summary?.text).toMatch(/targeting/i);
    expect(validation.ok).toBe(true);
    expect(validation.generationStatus).toMatch(/success/);
  });

  it("TEST 4 — no directly relevant projects still selects strongest available projects", () => {
    const evidence = devopsCandidate({
      skills: ["Git"],
      projects: [
        project("React Ecommerce", ["React"], ["Built a React storefront"]),
        project("Java Coursework", ["Java"], ["Completed Java coursework"]),
        project("Python Scripts", ["Python"], ["Wrote Python automation scripts"]),
      ],
    });
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements = reqs(["Kubernetes experience required", "AWS required"]);
    const selection = selectProjectsForCv({
      mode: "one_page",
      snapshot,
      requirements,
    });
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "DevOps Engineer",
    });

    expect(selection.selectedIds).toHaveLength(2);
    expect(
      selection.ranked.filter((item) => item.directlyRelevant),
    ).toHaveLength(0);
    expect(plan.projectItemIds).toHaveLength(2);
    const content = buildDeterministicTailoredContent({ plan, snapshot });
    expect(
      validateTailoredContent({
        content,
        plan,
        snapshot,
        keywordAudit: plan.keywordAudit,
      }).ok,
    ).toBe(true);
  });

  it("TEST 5 — unsupported JD keyword is not added; generation still succeeds", () => {
    const evidence = devopsCandidate({
      skills: ["Docker", "Git"],
      projects: [
        project("Deploy Pipeline", ["Docker"], ["Packaged services with Docker"]),
        project("Shop", ["React"], ["Built a React app"]),
      ],
    });
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements = reqs(["Kubernetes experience required", "Docker experience"]);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "Platform Engineer",
    });
    const content = buildDeterministicTailoredContent({ plan, snapshot });
    const validation = validateTailoredContent({
      content,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    expect(serializeContent(content)).not.toMatch(/\bkubernetes\b/i);
    expect(
      plan.keywordAudit.some(
        (entry) =>
          entry.keyword.toLowerCase() === "kubernetes" &&
          (entry.support_state === "unsupported" ||
            entry.support_state === "transferable"),
      ),
    ).toBe(true);
    expect(validation.ok).toBe(true);
  });

  it("TEST 6 — hallucinated LLM bullet is repaired and generation continues", () => {
    const evidence = devopsCandidate({
      skills: ["Docker", "Git"],
      projects: [
        project("Deploy Pipeline", ["Docker"], ["Packaged services with Docker"]),
        project("Shop", ["React"], ["Built a React app"]),
      ],
    });
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements = reqs(["AWS experience required", "Docker experience"]);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "Cloud Engineer",
    });
    const hallucinated = {
      target_title: plan.targetTitle,
      summary: {
        text: "Candidate targeting Cloud Engineer with Docker experience.",
        evidence_refs: [
          {
            career_item_id: plan.skillItemIds[0]!,
            fact_ids: [`${plan.skillItemIds[0]!}:skill:docker`],
          },
        ],
      },
      experience: [],
      projects: plan.projectItemIds.map((id) => {
        const item = snapshot.items.find(
          (entry) => entry.id === id && entry.type === "project",
        );
        const name =
          item && item.type === "project" ? item.name : "Project";
        return {
          career_item_id: id,
          display_title: name,
          bullets: [
            {
              text: "Deployed production workloads on AWS with Docker",
              fact_ids: [`${id}:bullet:0`],
              supported_keyword_ids: [],
            },
          ],
        };
      }),
      ordered_skill_ids: plan.skillItemIds,
      change_notes: [],
    };

    const before = validateTailoredContent({
      content: hallucinated,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });
    expect(before.ok).toBe(false);
    expect(
      before.issues.some(
        (issue) =>
          issue.code === "UNSUPPORTED_TECHNOLOGY" ||
          issue.code === "UNSUPPORTED_KEYWORD_INSERTED",
      ),
    ).toBe(true);

    const repaired = normalizeTailoredContent({
      content: hallucinated,
      plan,
      snapshot,
    });
    const after = validateTailoredContent({
      content: repaired,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
      usedFallback: true,
    });
    expect(serializeContent(repaired)).not.toMatch(/\baws\b/i);
    expect(after.ok).toBe(true);
    expect(after.generationStatus).toBe("success_with_fallback");
  });

  it("TEST 7 — low keyword coverage does not block generation", () => {
    const evidence = devopsCandidate({
      skills: ["Git", "Python"],
      projects: [
        project("Scripts", ["Python", "Git"], ["Wrote Python scripts using Git"]),
        project("Notes App", ["JavaScript"], ["Built a notes app in JavaScript"]),
      ],
    });
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements = reqs([
      "Kubernetes required",
      "AWS required",
      "Terraform required",
      "Azure required",
      "CI/CD required",
      "Linux required",
      "Docker required",
      "Prometheus required",
      "Grafana required",
      "Git required",
    ]);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "SRE",
    });
    const content = buildDeterministicTailoredContent({ plan, snapshot });
    const validation = validateTailoredContent({
      content,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    expect(validation.supportedKeywords.length).toBeLessThanOrEqual(3);
    expect(validation.missingKeywords.length).toBeGreaterThanOrEqual(5);
    expect(validation.ok).toBe(true);
  });

  it("TEST 8 — minimal candidate profile still produces an honest CV", () => {
    const evidence: CareerEvidence = {
      schema_version: 1,
      profile: {
        full_name: "Minimal Candidate",
        email: null,
        phone: null,
        location: null,
        summary: null,
      },
      work_experience: [],
      education: [
        {
          id: "00000000-0000-4000-8000-000000000501",
          origin: "extracted",
          source_quote: "BSc",
          institution: "State University",
          qualification: "BSc",
          field_of_study: "Computer Science",
          start_date: "2022-01",
          end_date: "2026-01",
        },
      ],
      skills: [
        {
          id: "00000000-0000-4000-8000-000000000502",
          origin: "extracted",
          source_quote: "Git",
          name: "Git",
        },
      ],
      projects: [
        {
          id: "00000000-0000-4000-8000-000000000503",
          origin: "extracted",
          source_quote: "Todo",
          name: "Todo CLI",
          role: null,
          start_date: null,
          end_date: null,
          bullets: ["Built a Git-tracked CLI todo tool"],
          technologies: ["Git"],
        },
      ],
      certifications: [],
      achievements: [],
      references: [],
      warnings: [],
    };
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements: reqs(["Kubernetes experience required"]),
      jobTitle: "DevOps Engineer",
    });
    const content = buildDeterministicTailoredContent({ plan, snapshot });
    const validation = validateTailoredContent({
      content,
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    expect(content.target_title).toBe(
      deriveTargetTitle({ jobTitle: "DevOps Engineer", earlyCareer: true }),
    );
    expect(content.summary?.text.length).toBeGreaterThan(20);
    expect(validation.ok).toBe(true);
    expect(validation.jobAlignment).not.toBe("high");
  });
});

function devopsCandidate(input: {
  skills: string[];
  projects: CareerEvidence["projects"];
}): CareerEvidence {
  return {
    schema_version: 1,
    profile: {
      full_name: "Ada",
      email: "ada@example.com",
      phone: null,
      location: "Colombo",
      summary: null,
    },
    work_experience: [],
    education: [
      {
        id: "00000000-0000-4000-8000-000000000510",
        origin: "extracted",
        source_quote: "CS",
        institution: "State University",
        qualification: "BSc",
        field_of_study: "Computer Science",
        start_date: "2022-01",
        end_date: null,
      },
    ],
    skills: input.skills.map((name, index) => ({
      id: `00000000-0000-4000-8000-0000000006${String(index).padStart(2, "0")}`,
      origin: "extracted" as const,
      source_quote: name,
      name,
    })),
    projects: input.projects,
    certifications: [],
    achievements: [],
    references: [],
    warnings: [],
  };
}

let projectSeq = 20;
function project(
  name: string,
  technologies: string[],
  bullets: string[],
): CareerEvidence["projects"][number] {
  projectSeq += 1;
  return {
    id: `00000000-0000-4000-8000-0000000007${String(projectSeq).padStart(2, "0")}`,
    origin: "extracted",
    source_quote: name,
    name,
    role: "Developer",
    start_date: "2024-01",
    end_date: "2024-12",
    bullets,
    technologies,
  };
}

function reqs(statements: string[]): JobRequirement[] {
  return statements.map((statement, index) => ({
    id: `r-${index}`,
    statement,
    category: "technology",
    importance: "required",
    explicit: true,
    confidence: "high",
    source_quote: statement.split(" ")[0] ?? statement,
    quantitative_threshold: null,
  }));
}

function serializeContent(content: {
  target_title: string;
  summary: { text: string } | null;
  experience: Array<{ bullets: Array<{ text: string }> }>;
  projects: Array<{ display_title: string; bullets: Array<{ text: string }> }>;
  ordered_skill_ids: string[];
}): string {
  return [
    content.target_title,
    content.summary?.text ?? "",
    ...content.experience.flatMap((item) =>
      item.bullets.map((bullet) => bullet.text),
    ),
    ...content.projects.flatMap((item) => [
      item.display_title,
      ...item.bullets.map((bullet) => bullet.text),
    ]),
  ].join("\n");
}
