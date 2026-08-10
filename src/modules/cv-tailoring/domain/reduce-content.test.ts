import { describe, expect, it } from "vitest";

import { reduceResumeForTwoPage } from "./reduce-content";
import type { TailoredResume } from "./tailored-resume";

describe("reduceResumeForTwoPage", () => {
  it("drops Not specified education and soft skills before projects", () => {
    const resume = baseResume({
      education: [
        {
          id: "edu-1",
          qualification: "BSc (Hons) Computer Science",
          institution: "IIT",
          startDate: "2024-01",
          endDate: "2027-06",
          details: ["Modules: Algorithms"],
        },
        {
          id: "edu-2",
          qualification: "GCE A/L",
          institution: "Not specified",
          startDate: "2020-06",
          endDate: "2023-01",
          details: [],
        },
      ],
      skills: [
        { category: "Languages", items: ["Java"] },
        {
          category: "Other",
          items: ["Adaptability", "Crystal Reports", "Leadership Capability"],
        },
      ],
    });

    const once = reduceResumeForTwoPage(resume);
    expect(once.education.map((item) => item.qualification)).toEqual([
      "BSc (Hons) Computer Science",
    ]);

    const twice = reduceResumeForTwoPage(once);
    expect(twice.education[0]?.details).toEqual([]);

    const thrice = reduceResumeForTwoPage(twice);
    expect(
      thrice.skills.find((group) => group.category === "Other")?.items,
    ).toEqual(["Crystal Reports"]);
  });

  it("collapses multi-paragraph projects then drops a 5th project", () => {
    const resume = baseResume({
      projects: [
        project("P1", 0, 2),
        project("P2", 1, 2),
        project("P3", 2, 1),
        project("P4", 3, 1),
        project("P5", 4, 1),
      ],
    });

    let current = resume;
    for (let i = 0; i < 8; i += 1) {
      current = reduceResumeForTwoPage(current);
      if (current.projects.length <= 4) break;
    }
    expect(current.projects.length).toBe(4);
    expect(
      current.projects.every((item) => item.paragraphs.length === 1),
    ).toBe(true);
  });
});

function project(
  name: string,
  priority: number,
  paragraphs: number,
): TailoredResume["projects"][number] {
  return {
    id: `proj-${name}`,
    name,
    technologies: ["Java"],
    paragraphs: Array.from({ length: paragraphs }, (_, index) => ({
      text: `${name} paragraph ${index + 1}. Built features with verified evidence and delivered outcomes for users.`,
      factIds: [`${name}-fact-${index}`],
      priority: index,
      source: "verified_evidence" as const,
    })),
    priority,
  };
}

function baseResume(overrides: Partial<TailoredResume>): TailoredResume {
  return {
    targetTitle: "Junior Software Engineer",
    contact: {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: null,
      location: null,
    },
    summary: {
      text: "Software developer with internship experience building Java services.",
      factIds: ["summary-1"],
      source: "verified_evidence",
    },
    skills: [{ category: "Languages", items: ["Java"] }],
    experience: [
      {
        id: "work-1",
        employer: "Acme",
        title: "Intern",
        startDate: "2025-01",
        endDate: null,
        bullets: [
          {
            text: "Built APIs with Java.",
            factIds: ["work-1-b0"],
            priority: 0,
            source: "verified_evidence",
          },
        ],
        priority: 0,
      },
    ],
    projects: [project("Alpha", 0, 1)],
    education: [
      {
        id: "edu-1",
        qualification: "BSc Computer Science",
        institution: "IIT",
        startDate: "2024-01",
        details: [],
      },
    ],
    certifications: [],
    achievements: [],
    references: [],
    changeNotes: [],
    assessment: {
      factuallyValid: true,
      jobAlignment: "medium",
      supportedKeywords: ["Java"],
      transferableKeywords: [],
      missingKeywords: [],
      generationStatus: "success",
    },
    ...overrides,
  };
}
