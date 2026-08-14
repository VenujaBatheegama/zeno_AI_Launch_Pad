import { describe, expect, it } from "vitest";

import {
  assessEvidenceDimensions,
  selectHighestPriorityGap,
  skillWithoutProjectEvidence,
} from "./assessment";
import type { CampaignIntent, VerifiedEvidenceSummary } from "./schemas";

const USER = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = "00000000-0000-4000-8000-000000000010";

function intent(overrides: Partial<CampaignIntent> = {}): CampaignIntent {
  return {
    id: CAMPAIGN,
    userId: USER,
    name: "Software Engineer — Remote",
    status: "active",
    primaryRole: "Software Engineer",
    location: "Remote",
    workMode: "remote",
    employmentTypes: [],
    experienceLevels: [],
    preferredTechnologies: [],
    targetReadyDate: null,
    weeklyHoursAvailable: 5,
    criteriaVersion: 1,
    priority: 1,
    ...overrides,
  };
}

function evidence(overrides: Partial<VerifiedEvidenceSummary> = {}): VerifiedEvidenceSummary {
  return {
    evidenceSetId: "00000000-0000-4000-8000-000000000020",
    verified: true,
    updatedAt: "2026-08-13T00:00:00.000Z",
    skills: [{ id: "00000000-0000-4000-8000-000000000021", name: "Java" }],
    projects: [
      {
        id: "00000000-0000-4000-8000-000000000022",
        name: "Campus library CRUD",
        role: "Developer",
        bullets: ["Built a coursework CRUD application for library records"],
        technologies: ["Java"],
      },
      {
        id: "00000000-0000-4000-8000-000000000023",
        name: "Student shop",
        role: "Developer",
        bullets: ["Coursework assignment with basic create-read-update-delete screens"],
        technologies: ["Java"],
      },
      {
        id: "00000000-0000-4000-8000-000000000024",
        name: "Timetable helper",
        role: "Developer",
        bullets: ["University project storing class times in a database"],
        technologies: ["Java"],
      },
    ],
    workExperience: [],
    educationCount: 1,
    githubUrl: null,
    portfolioUrl: null,
    linkedinUrl: null,
    ...overrides,
  };
}

describe("readiness assessment", () => {
  it("produces a role-level assessment for a broad campaign", () => {
    const dimensions = assessEvidenceDimensions({
      intent: intent(),
      evidence: evidence(),
    });
    const gap = selectHighestPriorityGap(dimensions);
    expect(gap).not.toBe("stack_specific");
    const complexity = dimensions.find((item) => item.key === "project_complexity");
    expect(complexity?.status).toBe("missing");
    expect(complexity?.explanation).toMatch(/application development/i);
    expect(complexity?.explanation).not.toMatch(/not enough/i);
  });

  it("produces a stack-relevant assessment when technologies are selected", () => {
    const dimensions = assessEvidenceDimensions({
      intent: intent({
        primaryRole: "Backend Engineer",
        preferredTechnologies: ["Java", "Spring Boot", "PostgreSQL"],
      }),
      evidence: evidence({
        skills: [
          { id: "00000000-0000-4000-8000-000000000021", name: "Java" },
        ],
        projects: [
          {
            id: "00000000-0000-4000-8000-000000000022",
            name: "Campus library CRUD",
            bullets: ["Built a Java coursework CRUD application"],
            technologies: ["Java"],
          },
        ],
      }),
    });
    const stack = dimensions.find((item) => item.key === "stack_specific");
    expect(stack?.status).toBe("missing");
    expect(stack?.explanation).toMatch(/Spring Boot|PostgreSQL|Java/);
  });

  it("treats verified skills without project evidence as an evidence gap", () => {
    const summary = evidence({
      skills: [{ id: "00000000-0000-4000-8000-000000000021", name: "Java" }],
      projects: [
        {
          id: "00000000-0000-4000-8000-000000000022",
          name: "Marketing site",
          bullets: ["Built a static brochure"],
          technologies: ["HTML"],
        },
      ],
    });
    expect(skillWithoutProjectEvidence(summary, "Java")).toBe(true);
    const dimensions = assessEvidenceDimensions({
      intent: intent({ preferredTechnologies: ["Java"] }),
      evidence: summary,
    });
    const stack = dimensions.find((item) => item.key === "stack_specific");
    expect(stack?.status).toBe("missing");
    expect(stack?.explanation).toMatch(/no project currently demonstrates/i);
  });

  it("does not declare unknown profile data missing", () => {
    const dimensions = assessEvidenceDimensions({
      intent: intent(),
      evidence: {
        evidenceSetId: null,
        verified: false,
        updatedAt: null,
        skills: [],
        projects: [],
        workExperience: [],
        educationCount: 0,
        githubUrl: null,
        portfolioUrl: null,
        linkedinUrl: null,
      },
    });
    expect(dimensions.every((item) => item.status === "unknown")).toBe(true);
    expect(dimensions.some((item) => item.status === "missing")).toBe(false);
  });
});
