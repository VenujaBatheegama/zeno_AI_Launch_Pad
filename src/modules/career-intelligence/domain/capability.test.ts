import { describe, expect, it } from "vitest";

import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import { emptyJobSearchPreferences } from "@/modules/job-discovery/domain/job";

import {
  aggregateCapabilitySignals,
  buildCandidateCapabilityProfile,
  seedSkillListSignals,
  validateCapabilitySignals,
} from "./capability-aggregation";
import {
  personalizeAndRankJobs,
  scoreCapabilityAlignment,
} from "./personalization";
import { expandRoleTitles } from "./role-families";
import { assessCareerStage } from "./career-stage";

const NOW = "2026-08-07T00:00:00.000Z";

describe("capability intelligence", () => {
  it("does not treat skill-list mentions as deep experience", () => {
    const signals = seedSkillListSignals(sampleEvidence());
    const aggregates = aggregateCapabilitySignals({
      signals,
      evidence: sampleEvidence(),
      now: new Date(NOW),
    });
    const docker = aggregates.find((item) => item.key === "docker");
    expect(docker?.band).toBe("limited_evidence");
    expect(docker?.maxDepth).toBe(0);
  });

  it("averages capability alignment over required stack terms, counting misses as zero", () => {
    const profile = {
      evidenceFingerprint: "ev",
      extractionPolicyVersion: "capability-extraction-v1",
      aggregationPolicyVersion: "capability-aggregation-v1",
      aggregates: [
        {
          key: "python",
          label: "Python",
          kind: "technology" as const,
          band: "limited_evidence" as const,
          aggregateScore: 0.2,
          confidence: "low" as const,
          evidenceIds: ["00000000-0000-4000-8000-000000000203"],
          signalCount: 1,
          independentSources: 1,
          maxDepth: 0,
        },
        {
          key: "docker",
          label: "Docker",
          kind: "technology" as const,
          band: "demonstrated" as const,
          aggregateScore: 0.7,
          confidence: "medium" as const,
          evidenceIds: ["00000000-0000-4000-8000-000000000201"],
          signalCount: 1,
          independentSources: 1,
          maxDepth: 3,
        },
      ],
      directions: [],
      warnings: [],
      createdAt: NOW,
    };

    const thin = scoreCapabilityAlignment({
      profile,
      requirementStatements: [
        "Python",
        "Django",
        "FastAPI",
        "PostgreSQL",
      ],
    });
    // limited_evidence(0.25) + three misses(0) => 0.0625
    expect(thin.score).toBe(0.0625);

    const hitOnly = scoreCapabilityAlignment({
      profile,
      requirementStatements: ["Python"],
    });
    expect(hitOnly.score).toBe(0.25);
    expect(thin.score).toBeLessThan(hitOnly.score);

    const stronger = scoreCapabilityAlignment({
      profile,
      requirementStatements: ["Docker"],
    });
    expect(stronger.score).toBeGreaterThan(hitOnly.score);
  });

  it("gives meaningful project use more depth than a bare mention", () => {
    const evidence = sampleEvidence();
    const validated = validateCapabilitySignals({
      extracted: {
        signals: [
          {
            capability_key: "docker",
            display_label: "Docker",
            capability_type: "technology",
            evidence_ids: ["00000000-0000-4000-8000-000000000204"],
            evidence_context: "independent_project",
            depth: 2,
            ownership_signal: false,
            source_quote: "Deployed with Docker",
            rationale: "Project implemented Docker packaging.",
            warnings: [],
          },
        ],
        direction_candidates: [],
        warnings: [],
      },
      evidenceIds: new Set([
        "00000000-0000-4000-8000-000000000204",
        "00000000-0000-4000-8000-000000000203",
      ]),
    });
    const aggregates = aggregateCapabilitySignals({
      signals: [...seedSkillListSignals(evidence), ...validated.signals],
      evidence,
      now: new Date(NOW),
    });
    expect(aggregates.find((item) => item.key === "docker")?.band).toBe(
      "demonstrated",
    );
  });

  it("rejects invalid evidence IDs", () => {
    const validated = validateCapabilitySignals({
      extracted: {
        signals: [
          {
            capability_key: "kubernetes",
            display_label: "Kubernetes",
            capability_type: "technology",
            evidence_ids: ["00000000-0000-4000-8000-000000000999"],
            evidence_context: "internship",
            depth: 2,
            ownership_signal: false,
            source_quote: "k8s",
            rationale: "bad id",
            warnings: [],
          },
        ],
        direction_candidates: [],
        warnings: [],
      },
      evidenceIds: new Set(["00000000-0000-4000-8000-000000000201"]),
    });
    expect(validated.signals).toHaveLength(0);
    expect(validated.warnings[0]).toMatch(/invalid/i);
  });

  it("does not inflate independent repetition from one project", () => {
    const evidence = sampleEvidence();
    const signals = [
      {
        capability_key: "docker",
        display_label: "Docker",
        capability_type: "technology" as const,
        evidence_ids: ["00000000-0000-4000-8000-000000000204"],
        evidence_context: "independent_project" as const,
        depth: 2 as const,
        ownership_signal: false,
        source_quote: "Docker compose",
        rationale: "bullet 1",
        warnings: [],
      },
      {
        capability_key: "docker",
        display_label: "Docker",
        capability_type: "technology" as const,
        evidence_ids: ["00000000-0000-4000-8000-000000000204"],
        evidence_context: "independent_project" as const,
        depth: 2 as const,
        ownership_signal: false,
        source_quote: "Docker image",
        rationale: "bullet 2",
        warnings: [],
      },
    ];
    const aggregates = aggregateCapabilitySignals({
      signals,
      evidence,
      now: new Date(NOW),
    });
    expect(aggregates[0]?.independentSources).toBe(1);
  });

  it("keeps preference from mutating capability profile and prefers preference tier", () => {
    const profile = buildCandidateCapabilityProfile({
      evidence: sampleEvidence(),
      extracted: {
        signals: [
          {
            capability_key: "docker",
            display_label: "Docker",
            capability_type: "technology",
            evidence_ids: ["00000000-0000-4000-8000-000000000201"],
            evidence_context: "internship",
            depth: 3,
            ownership_signal: true,
            source_quote: "Docker in internship",
            rationale: "Used Docker in internship delivery.",
            warnings: [],
          },
        ],
        direction_candidates: [
          {
            key: "devops_platform",
            label: "DevOps / platform engineering",
            kind: "domain",
            supporting_evidence_ids: ["00000000-0000-4000-8000-000000000201"],
            confidence: "medium",
            explanation: "Internship and project signals converge on platform work.",
          },
        ],
        warnings: [],
      },
      evidenceFingerprint: "ev",
      extractionPolicyVersion: "capability-extraction-v1",
      rejectInferredDirection: false,
      createdAt: NOW,
      now: new Date(NOW),
    });

    const ranked = personalizeAndRankJobs({
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["DevOps Engineer"],
        target_role_families: ["DevOps / Platform"],
        capability_intents: [
          {
            kind: "technology",
            key: "docker",
            label: "Docker",
            mode: "prefer",
          },
          {
            kind: "technology",
            key: "kubernetes",
            label: "Kubernetes",
            mode: "explore",
          },
        ],
      },
      profile,
      jobs: [
        {
          listingId: "l-frontend",
          jobId: "j-frontend",
          title: "Frontend Engineer",
          requirementStatements: ["React", "TypeScript", "CSS"],
          evidenceFitScore: 95,
          careerLevel: "aligned",
          confidence: "high",
          hardConstraintEligible: true,
          hardConstraintReasons: [],
          gapCount: 0,
          publishedAt: null,
        },
        {
          listingId: "l-devops",
          jobId: "j-devops",
          title: "Junior DevOps Engineer",
          requirementStatements: ["Docker", "CI/CD", "Linux"],
          evidenceFitScore: 70,
          careerLevel: "aligned",
          confidence: "medium",
          hardConstraintEligible: true,
          hardConstraintReasons: [],
          gapCount: 1,
          publishedAt: null,
        },
      ],
    });

    expect(ranked[0]?.listingId).toBe("l-devops");
    expect(ranked[0]?.preferenceTier).toBe("tier_a_direct");
    expect(ranked[1]?.preferenceTier).toBe("tier_c_alternative");
    expect(profile.aggregates.find((item) => item.key === "docker")).toBeTruthy();
  });

  it("exclude hard-filters only when explicitly set; avoid does not", () => {
    const avoided = personalizeAndRankJobs({
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["Software Engineer"],
        capability_intents: [
          {
            kind: "technology",
            key: "react",
            label: "React",
            mode: "avoid",
          },
        ],
      },
      profile: null,
      jobs: [
        {
          listingId: "l1",
          jobId: "j1",
          title: "React Developer",
          requirementStatements: ["React"],
          evidenceFitScore: 80,
          careerLevel: "aligned",
          confidence: "high",
          hardConstraintEligible: true,
          hardConstraintReasons: [],
          gapCount: 0,
          publishedAt: null,
        },
      ],
    });
    expect(avoided[0]?.hardConstraintEligible).toBe(true);
    expect(avoided[0]?.preferenceTier).toBe("avoided");

    const excluded = personalizeAndRankJobs({
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["Software Engineer"],
        capability_intents: [
          {
            kind: "technology",
            key: "react",
            label: "React",
            mode: "exclude",
          },
        ],
      },
      profile: null,
      jobs: avoided,
    });
    expect(excluded[0]?.hardConstraintEligible).toBe(false);
    expect(excluded[0]?.preferenceTier).toBe("excluded");
  });

  it("keeps a bounded alternative lane unless only is set", () => {
    const assessment = assessCareerStage({
      evidence: sampleEvidence(),
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["DevOps Engineer"],
        target_role_families: ["DevOps / Platform"],
        capability_intents: [
          {
            kind: "technology",
            key: "docker",
            label: "Docker",
            mode: "prefer",
          },
        ],
      },
      evidenceFingerprint: "ev",
      preferencesFingerprint: "pref",
      assessedAt: NOW,
    });

    const withAlt = expandRoleTitles({
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["DevOps Engineer"],
        target_role_families: ["DevOps / Platform"],
        capability_intents: [
          {
            kind: "technology",
            key: "docker",
            label: "Docker",
            mode: "prefer",
          },
        ],
      },
      assessment,
      budget: 5,
      capabilityAggregates: [
        {
          key: "docker",
          label: "Docker",
          kind: "technology",
          band: "demonstrated",
          aggregateScore: 0.7,
          confidence: "medium",
          evidenceIds: ["00000000-0000-4000-8000-000000000201"],
          signalCount: 1,
          independentSources: 1,
          maxDepth: 3,
        },
      ],
    });
    expect(withAlt.some((item) => item.source === "alternative_lane")).toBe(
      true,
    );
    expect(withAlt.length).toBeLessThanOrEqual(5);

    const onlyPlan = expandRoleTitles({
      preferences: {
        ...emptyJobSearchPreferences,
        roles: ["DevOps Engineer"],
        capability_intents: [
          {
            kind: "domain",
            key: "devops_platform",
            label: "DevOps",
            mode: "only",
          },
        ],
      },
      assessment,
      budget: 5,
    });
    expect(onlyPlan.some((item) => item.source === "alternative_lane")).toBe(
      false,
    );
  });
});

function sampleEvidence(): CareerEvidence {
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
        bullets: ["Built APIs with Docker"],
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
        source_quote: "Campus project",
        name: "Campus Deploy",
        role: "Developer",
        start_date: "2024-06",
        end_date: "2024-09",
        bullets: ["Deployed with Docker"],
        technologies: ["Docker", "AWS"],
      },
    ],
    certifications: [],
    achievements: [],
    references: [],
    warnings: [],
  };
}
