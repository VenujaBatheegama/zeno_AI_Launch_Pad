import { describe, expect, it } from "vitest";

import { buildContentPlan } from "./content-plan";
import { buildEvidenceSnapshot } from "./facts";
import { validateTailoredContent } from "./validation";
import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobRequirement } from "@/modules/career-intelligence/domain/schemas";

describe("tailored content validation", () => {
  it("rejects invented technologies and unsupported JD keywords", () => {
    const evidence = sampleEvidence();
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const requirements: JobRequirement[] = [
      {
        id: "r-aws",
        statement: "AWS experience required",
        category: "technology",
        importance: "required",
        explicit: true,
        confidence: "high",
        source_quote: "AWS",
        quantitative_threshold: null,
      },
      {
        id: "r-docker",
        statement: "Docker experience",
        category: "technology",
        importance: "required",
        explicit: true,
        confidence: "high",
        source_quote: "Docker",
        quantitative_threshold: null,
      },
    ];
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements,
      jobTitle: "Software Engineer",
    });

    const result = validateTailoredContent({
      content: {
        target_title: plan.targetTitle,
        summary: {
          text: "Candidate targeting Software Engineer with Docker experience.",
          evidence_refs: [
            {
              career_item_id: plan.skillItemIds[0]!,
              fact_ids: [`${plan.skillItemIds[0]!}:skill:docker`],
            },
          ],
        },
        experience: [
          {
            career_item_id: "00000000-0000-4000-8000-000000000201",
            bullets: [
              {
                text: "Deployed services to AWS using Docker",
                fact_ids: [
                  "00000000-0000-4000-8000-000000000201:bullet:0",
                ],
                supported_keyword_ids: [],
              },
            ],
          },
        ],
        projects: plan.projectItemIds.map((id) => ({
          career_item_id: id,
          display_title:
            snapshot.items.find((item) => item.id === id && item.type === "project")
              ?.type === "project"
              ? (
                  snapshot.items.find(
                    (item) => item.id === id,
                  ) as Extract<(typeof snapshot.items)[number], { type: "project" }>
                ).name
              : "Project",
          bullets: [
            {
              text: "Used Docker for local development",
              fact_ids: [`${id}:technology:docker`],
              supported_keyword_ids: ["r-docker:docker"],
            },
          ],
        })),
        ordered_skill_ids: plan.skillItemIds,
        change_notes: [],
      },
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });

    expect(result.ok).toBe(false);
    expect(result.factuallyValid).toBe(false);
    expect(result.missingKeywords.map((k) => k.toLowerCase())).toContain("aws");
    expect(
      result.issues.some((item) => item.code === "UNSUPPORTED_TECHNOLOGY"),
    ).toBe(true);
    expect(
      result.issues.some((item) => item.code === "UNSUPPORTED_KEYWORD_INSERTED"),
    ).toBe(true);
  });

  it("rejects unknown fact IDs", () => {
    const evidence = sampleEvidence();
    const snapshot = buildEvidenceSnapshot("ev", evidence);
    const plan = buildContentPlan({
      mode: "one_page",
      snapshot,
      requirements: [],
      jobTitle: "Software Engineer",
    });
    const projectId = plan.projectItemIds[0]!;
    const result = validateTailoredContent({
      content: {
        target_title: plan.targetTitle,
        summary: {
          text: "Candidate targeting Software Engineer roles.",
          evidence_refs: [
            {
              career_item_id: "profile",
              fact_ids: ["profile:identity:full_name"],
            },
          ],
        },
        experience: [],
        projects: [
          {
            career_item_id: projectId,
            display_title: "Deploy Pipeline",
            bullets: [
              {
                text: "Packaged services with Docker",
                fact_ids: ["not-a-real-fact"],
                supported_keyword_ids: [],
              },
            ],
          },
        ],
        ordered_skill_ids: plan.skillItemIds,
        change_notes: [],
      },
      plan,
      snapshot,
      keywordAudit: plan.keywordAudit,
    });
    expect(result.issues.some((item) => item.code === "INVALID_FACT_ID")).toBe(
      true,
    );
  });
});

function sampleEvidence(): CareerEvidence {
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
        bullets: ["Built APIs with Node.js and Docker"],
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
    projects: [
      {
        id: "00000000-0000-4000-8000-000000000204",
        origin: "extracted",
        source_quote: "Deploy",
        name: "Deploy Pipeline",
        role: "Developer",
        start_date: "2024-01",
        end_date: "2024-06",
        bullets: ["Packaged services with Docker"],
        technologies: ["Docker", "Node.js"],
      },
      {
        id: "00000000-0000-4000-8000-000000000205",
        origin: "extracted",
        source_quote: "Shop",
        name: "Campus Shop",
        role: "Developer",
        start_date: "2024-02",
        end_date: "2024-07",
        bullets: ["Built a React storefront"],
        technologies: ["React", "PostgreSQL"],
      },
    ],
    certifications: [],
    achievements: [],
    references: [],
    warnings: [],
  };
}
