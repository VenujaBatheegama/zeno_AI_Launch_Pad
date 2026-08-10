import { describe, expect, it } from "vitest";

import { buildEvidenceSnapshot } from "./facts";
import { selectProjectsForCv } from "./project-selection";
import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobRequirement } from "@/modules/career-intelligence/domain/schemas";

describe("project selection policy", () => {
  it("selects exactly two projects for one-page when at least two exist", () => {
    const snapshot = buildEvidenceSnapshot("ev", evidenceWithProjects(4));
    const result = selectProjectsForCv({
      mode: "one_page",
      snapshot,
      requirements: [req("Docker and CI/CD experience")],
    });
    expect(result.selectedIds).toHaveLength(2);
  });

  it("fills one-page with strongest fallback when only one project is aligned", () => {
    const snapshot = buildEvidenceSnapshot("ev", evidenceWithProjects(3));
    const result = selectProjectsForCv({
      mode: "one_page",
      snapshot,
      requirements: [req("Kubernetes and Terraform")],
    });
    expect(result.selectedIds).toHaveLength(2);
    expect(result.warnings.some((item) => /fallback|remaining/iu.test(item))).toBe(
      true,
    );
  });

  it("includes a single project when only one exists", () => {
    const snapshot = buildEvidenceSnapshot("ev", evidenceWithProjects(1));
    const result = selectProjectsForCv({
      mode: "one_page",
      snapshot,
      requirements: [req("Docker")],
    });
    expect(result.selectedIds).toHaveLength(1);
  });

  it("omits projects when none exist", () => {
    const snapshot = buildEvidenceSnapshot("ev", evidenceWithProjects(0));
    const result = selectProjectsForCv({
      mode: "one_page",
      snapshot,
      requirements: [req("Docker")],
    });
    expect(result.selectedIds).toHaveLength(0);
  });

  it("selects four projects for two-page when at least four exist", () => {
    const snapshot = buildEvidenceSnapshot("ev", evidenceWithProjects(5));
    const result = selectProjectsForCv({
      mode: "two_page",
      snapshot,
      requirements: [req("React and Node.js")],
    });
    expect(result.selectedIds.length).toBeGreaterThanOrEqual(4);
  });

  it("skips a fifth project when selected projects are already heavy", () => {
    const snapshot = buildEvidenceSnapshot(
      "ev",
      evidenceWithProjects(5, { heavyBulletCount: 4 }),
    );
    const result = selectProjectsForCv({
      mode: "two_page",
      snapshot,
      requirements: [req("React and Node.js")],
    });
    expect(result.selectedIds).toHaveLength(4);
    expect(result.includedFifth).toBe(false);
    expect(result.fifthReasons).toContain("skipped_over_two_page_budget");
  });

  it("includes all available projects when fewer than four exist in two-page mode", () => {
    const snapshot = buildEvidenceSnapshot("ev", evidenceWithProjects(3));
    const result = selectProjectsForCv({
      mode: "two_page",
      snapshot,
      requirements: [req("React")],
    });
    expect(result.selectedIds).toHaveLength(3);
  });

  it("ranks directly relevant projects ahead of unrelated ones", () => {
    const snapshot = buildEvidenceSnapshot("ev", evidenceWithProjects(3));
    const result = selectProjectsForCv({
      mode: "one_page",
      snapshot,
      requirements: [req("Docker packaging")],
    });
    expect(result.selectedIds[0]).toBe(projectId(0));
  });
});

function req(statement: string): JobRequirement {
  return {
    id: "r1",
    statement,
    category: "technology",
    importance: "required",
    explicit: true,
    confidence: "high",
    source_quote: statement,
    quantitative_threshold: null,
  };
}

function projectId(index: number): string {
  return `00000000-0000-4000-8000-00000000010${index}`;
}

function evidenceWithProjects(
  count: number,
  options?: { heavyBulletCount?: number },
): CareerEvidence {
  const heavy = options?.heavyBulletCount;
  const projects = Array.from({ length: count }, (_, index) => ({
    id: projectId(index),
    origin: "extracted" as const,
    source_quote: `Project ${index}`,
    name: index === 0 ? "Deploy Pipeline" : `Campus App ${index}`,
    role: "Developer",
    start_date: "2024-01",
    end_date: "2024-06",
    bullets:
      heavy && index < 4
        ? Array.from(
            { length: heavy },
            (_, bulletIndex) =>
              `Delivered verified feature ${bulletIndex + 1} for project ${index}`,
          )
        : index === 0
          ? ["Packaged services with Docker", "Automated builds"]
          : [`Built feature set ${index}`, "Collaborated with peers"],
    technologies:
      index === 0 ? ["Docker", "Node.js"] : ["React", "PostgreSQL"],
  }));

  return {
    schema_version: 1,
    profile: {
      full_name: "Ada",
      email: "ada@example.com",
      phone: null,
      location: "Colombo",
      summary: null,
    },
    work_experience: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        origin: "extracted",
        source_quote: "Intern",
        employer: "Acme",
        role: "Software Developer Intern",
        location: null,
        start_date: "2025-01",
        end_date: "2025-08",
        is_current: false,
        bullets: ["Built APIs with Node.js"],
      },
    ],
    education: [],
    skills: [
      {
        id: "00000000-0000-4000-8000-000000000203",
        origin: "extracted",
        source_quote: "Docker",
        name: "Docker",
      },
    ],
    projects,
    certifications: [],
    achievements: [],
    references: [],
    warnings: [],
  };
}
