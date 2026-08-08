import { describe, expect, it } from "vitest";

import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import { matchRequirementsDeterministically } from "./matching";

describe("deterministic requirement matching", () => {
  it("does not match DevOps requirements from unrelated software internship evidence", () => {
    const matches = matchRequirementsDeterministically({
      evidence: softwareInternEvidence(),
      internshipMonths: 8,
      employmentMonths: 0,
      requirements: [
        {
          id: "r1",
          statement:
            "Strong experience in DevOps, Platform Engineering, or Site Reliability Engineering",
          category: "domain",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "DevOps, Platform Engineering",
          quantitative_threshold: null,
        },
        {
          id: "r2",
          statement:
            "Deep understanding of cloud technologies and modern DevOps practices",
          category: "domain",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "cloud technologies and modern DevOps",
          quantitative_threshold: null,
        },
        {
          id: "r3",
          statement:
            "Proficiency with AWS services and cloud-native architectures",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "AWS services",
          quantitative_threshold: null,
        },
        {
          id: "r4",
          statement:
            "Proficiency in CI/CD tooling, automation frameworks, and configuration management",
          category: "skill",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "CI/CD tooling, automation frameworks",
          quantitative_threshold: null,
        },
        {
          id: "r5",
          statement:
            "Hands-on experience building Infrastructure-as-Code solutions, ideally with Terraform or similar tools",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Terraform or similar tools",
          quantitative_threshold: null,
        },
        {
          id: "r6",
          statement:
            "High proficiency in Python for automation and tooling development",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Python for automation",
          quantitative_threshold: null,
        },
      ],
    });

    expect(matches.map((item) => [item.requirement_id, item.status])).toEqual([
      ["r1", "gap"],
      ["r2", "gap"],
      ["r3", "gap"],
      ["r4", "gap"],
      ["r5", "gap"],
      ["r6", "gap"],
    ]);
  });

  it("does not treat generic skill words like frameworks as CI/CD evidence", () => {
    const matches = matchRequirementsDeterministically({
      evidence: {
        ...softwareInternEvidence(),
        skills: [
          {
            id: "00000000-0000-4000-8000-000000000203",
            origin: "extracted",
            source_quote: "Frameworks",
            name: "Frameworks",
          },
        ],
      },
      internshipMonths: 8,
      employmentMonths: 0,
      requirements: [
        {
          id: "r4",
          statement:
            "Proficiency in CI/CD tooling, automation frameworks, and configuration management",
          category: "skill",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "automation frameworks",
          quantitative_threshold: null,
        },
      ],
    });

    expect(matches[0]?.status).toBe("gap");
  });

  it("matches Docker when verified project technologies include Docker", () => {
    const matches = matchRequirementsDeterministically({
      evidence: softwareInternEvidence(),
      internshipMonths: 8,
      employmentMonths: 0,
      requirements: [
        {
          id: "r-docker",
          statement: "Docker experience",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Docker experience",
          quantitative_threshold: null,
        },
      ],
    });

    expect(matches[0]?.status).toBe("partial");
    expect(matches[0]?.evidence_ids).toContain(
      "00000000-0000-4000-8000-000000000204",
    );
  });

  it("does not treat a single skill-list hit as support for a multi-tech stack requirement", () => {
    const matches = matchRequirementsDeterministically({
      evidence: {
        ...softwareInternEvidence(),
        skills: [
          {
            id: "00000000-0000-4000-8000-000000000211",
            origin: "extracted",
            source_quote: "Python",
            name: "Python",
          },
        ],
      },
      internshipMonths: 8,
      employmentMonths: 0,
      requirements: [
        {
          id: "r-stack",
          statement:
            "Proficiency with Python, Django, FastAPI, and PostgreSQL",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Python, Django, FastAPI, and PostgreSQL",
          quantitative_threshold: null,
        },
      ],
    });

    expect(matches[0]?.status).toBe("gap");
    expect(matches[0]?.reason).toMatch(/minority overlap/iu);
  });

  it("still accepts one side of an explicit technology alternative list", () => {
    const matches = matchRequirementsDeterministically({
      evidence: {
        ...softwareInternEvidence(),
        skills: [
          {
            id: "00000000-0000-4000-8000-000000000212",
            origin: "extracted",
            source_quote: "Python",
            name: "Python",
          },
        ],
      },
      internshipMonths: 8,
      employmentMonths: 0,
      requirements: [
        {
          id: "r-or",
          statement: "Experience with Python or Java",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Python or Java",
          quantitative_threshold: null,
        },
      ],
    });

    expect(matches[0]?.status).toBe("partial");
    expect(matches[0]?.confidence).toBe("low");
  });
});

function softwareInternEvidence(): CareerEvidence {
  return {
    schema_version: 1,
    profile: {
      full_name: "Ada",
      email: null,
      phone: null,
      location: null,
      summary: null,
    },
    work_experience: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        origin: "extracted",
        source_quote: "Software Developer Intern",
        employer: "Acme",
        role: "Software Developer Intern",
        location: null,
        start_date: "2025-01",
        end_date: "2025-08",
        is_current: false,
        bullets: [
          "Built REST APIs with Node.js and PostgreSQL",
          "Collaborated with the team using Git and code reviews",
        ],
      },
    ],
    education: [],
    skills: [
      {
        id: "00000000-0000-4000-8000-000000000210",
        origin: "extracted",
        source_quote: "Java",
        name: "Java",
      },
    ],
    projects: [
      {
        id: "00000000-0000-4000-8000-000000000204",
        origin: "extracted",
        source_quote: "Campus project",
        name: "Campus Deploy",
        role: "Developer",
        start_date: "2024-06",
        end_date: "2024-09",
        bullets: ["Packaged the app with Docker"],
        technologies: ["Docker"],
      },
    ],
    certifications: [],
    warnings: [],
  };
}
