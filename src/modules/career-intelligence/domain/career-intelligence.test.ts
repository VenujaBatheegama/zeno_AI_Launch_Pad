import { describe, expect, it } from "vitest";

import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import { emptyJobSearchPreferences } from "@/modules/job-discovery/domain/job";

import { assessCareerStage } from "./career-stage";
import { monthsWithoutOverlap, summarizeExperience } from "./experience";
import { selectSearchTitlesFromEscoHits } from "./esco-selection";
import { rankMatches } from "./ranking";
import { computeEvidenceFitScore } from "./scoring";

const NOW = "2026-08-07T00:00:00.000Z";

describe("career intelligence domain", () => {
  it("does not double-count overlapping internship intervals", () => {
    const months = monthsWithoutOverlap(
      [
        {
          evidenceId: "1",
          type: "internship",
          start: new Date("2025-01-01T00:00:00.000Z"),
          end: new Date("2025-06-30T00:00:00.000Z"),
          isCurrent: false,
          label: "A",
        },
        {
          evidenceId: "2",
          type: "internship",
          start: new Date("2025-04-01T00:00:00.000Z"),
          end: new Date("2025-08-31T00:00:00.000Z"),
          isCurrent: false,
          label: "B",
        },
      ],
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(months).toBe(8);
  });

  it("prioritizes early-career bands after substantial verified internship experience", () => {
    const assessment = assessCareerStage({
      evidence: evidenceWithInternshipMonths(),
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["Software Engineer"],
      },
      evidenceFingerprint: "ev",
      preferencesFingerprint: "pref",
      assessedAt: NOW,
    });

    expect(assessment.inferredStage).toBe(
      "experienced_intern_or_graduate_ready",
    );
    expect(assessment.targetOpportunityBands).toContain("early_career");
    expect(assessment.targetOpportunityBands).not.toContain("internship_ready");
    expect(assessment.unsuitableBands).toEqual(
      expect.arrayContaining(["senior", "lead_or_management"]),
    );
  });

  it("keeps internships eligible when explicitly preferred", () => {
    const assessment = assessCareerStage({
      evidence: evidenceWithInternshipMonths(),
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["Software Engineer Intern"],
        employment_types: ["internship"],
      },
      evidenceFingerprint: "ev",
      preferencesFingerprint: "pref",
      assessedAt: NOW,
    });

    expect(assessment.targetOpportunityBands).toContain("internship_ready");
    expect(assessment.preferenceOverrides[0]?.kind).toBe(
      "explicit_internship_preference",
    );
  });

  it("keeps exact role titles without injecting unrelated catalog families", () => {
    const resolution = selectSearchTitlesFromEscoHits({
      originalRole: "Software Engineer",
      hits: [
        {
          uri: "http://data.europa.eu/esco/occupation/se",
          title: "software developer",
          alternativeLabels: ["application developer"],
        },
      ],
      maxAlternatives: 2,
    });

    expect(resolution.searchTitles[0]).toBe("Software Engineer");
    expect(resolution.searchTitles.length).toBeLessThanOrEqual(4);
    expect(
      resolution.searchTitles.some((title) => /devops|platform|sre/iu.test(title)),
    ).toBe(false);
  });

  it("does not invent DevOps titles when ESCO returns software hits only", () => {
    const resolution = selectSearchTitlesFromEscoHits({
      originalRole: "Software Engineer",
      hits: [
        {
          uri: "u",
          title: "software developer",
          alternativeLabels: ["web developer"],
        },
      ],
    });

    expect(
      resolution.searchTitles.some((title) => /devops|platform|sre/iu.test(title)),
    ).toBe(false);
  });

  it("computes a reproducible evidence-fit score from weights and credits", () => {
    const score = computeEvidenceFitScore({
      requirements: [
        {
          id: "r1",
          statement: "Docker",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Docker required",
          quantitative_threshold: null,
        },
        {
          id: "r2",
          statement: "Terraform",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Terraform required",
          quantitative_threshold: null,
        },
        {
          id: "r3",
          statement: "Communication",
          category: "soft_skill",
          importance: "preferred",
          explicit: true,
          confidence: "medium",
          source_quote: "Strong communication",
          quantitative_threshold: null,
        },
      ],
      matches: [
        {
          requirement_id: "r1",
          status: "matched",
          evidence_ids: ["00000000-0000-4000-8000-000000000101"],
          reason: "Verified project uses Docker.",
          confidence: "high",
          classifier: "deterministic",
        },
        {
          requirement_id: "r2",
          status: "gap",
          evidence_ids: [],
          reason: "No verified Terraform evidence.",
          confidence: "high",
          classifier: "deterministic",
        },
        {
          requirement_id: "r3",
          status: "unknown",
          evidence_ids: [],
          reason: "Soft skill is not clearly evidenced.",
          confidence: "low",
          classifier: "deterministic",
        },
      ],
    });

    // (3*1 + 3*0 + 1*0) / (3+3+1) = 3/7 ≈ 43
    expect(score.evidence_fit_score).toBe(43);
    expect(score.gap_count).toBe(1);
    expect(score.unknown_count).toBe(1);
  });

  it("down-weights low-confidence partial credit so skill-list-only hits cannot dominate", () => {
    const score = computeEvidenceFitScore({
      requirements: [
        {
          id: "r1",
          statement: "Python",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Python",
          quantitative_threshold: null,
        },
        {
          id: "r2",
          statement: "Django",
          category: "technology",
          importance: "required",
          explicit: true,
          confidence: "high",
          source_quote: "Django",
          quantitative_threshold: null,
        },
      ],
      matches: [
        {
          requirement_id: "r1",
          status: "partial",
          evidence_ids: ["00000000-0000-4000-8000-000000000101"],
          reason: "Skill-list mentions Python.",
          confidence: "low",
          classifier: "deterministic",
        },
        {
          requirement_id: "r2",
          status: "gap",
          evidence_ids: [],
          reason: "No Django evidence.",
          confidence: "high",
          classifier: "deterministic",
        },
      ],
    });

    // low-confidence partial credit 0.25: (3*0.25 + 3*0) / 6 = 12.5 → 13
    expect(score.evidence_fit_score).toBe(13);
    expect(score.contributions[0]?.credit).toBe(0.25);
  });

  it("ranks career-aligned higher-fit jobs above overleveled ones", () => {
    const ranked = rankMatches([
      {
        listingId: "l2",
        jobId: "j2",
        eligible: true,
        evidenceFitScore: 90,
        careerLevel: "substantially_overleveled",
        confidence: "high",
        publishedAt: null,
      },
      {
        listingId: "l1",
        jobId: "j1",
        eligible: true,
        evidenceFitScore: 70,
        careerLevel: "aligned",
        confidence: "medium",
        publishedAt: null,
      },
    ]);
    expect(ranked[0].listingId).toBe("l1");
  });
});

function evidenceWithInternshipMonths(): CareerEvidence {
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
        bullets: ["Built APIs"],
      },
    ],
    education: [
      {
        id: "00000000-0000-4000-8000-000000000202",
        origin: "extracted",
        source_quote: "BSc Computer Science",
        institution: "IIT",
        qualification: "BSc",
        field_of_study: "Computer Science",
        start_date: "2024-01",
        end_date: null,
      },
    ],
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
        source_quote: "Campus project",
        name: "Campus Deploy",
        role: "Developer",
        start_date: "2024-06",
        end_date: "2024-09",
        bullets: ["Deployed on AWS"],
        technologies: ["AWS", "Docker"],
      },
    ],
    certifications: [],
    achievements: [],
    references: [],
    warnings: [],
  };
}

describe("experience summary", () => {
  it("keeps internship and employment months distinct", () => {
    const summary = summarizeExperience(evidenceWithInternshipMonths());
    expect(summary.internshipMonths).toBeGreaterThanOrEqual(6);
    expect(summary.employmentMonths).toBe(0);
    expect(summary.projectCount).toBe(1);
  });
});
