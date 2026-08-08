import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobSearchPreferences } from "@/modules/job-discovery/domain/job";

import {
  CAREER_STAGE_POLICY_VERSION,
  INTERNSHIP_PROGRESSION_MONTHS,
} from "./policy";
import {
  summarizeExperience,
  type ExperienceSummary,
} from "./experience";
import type { CareerStageBand, ConfidenceLevel, OpportunityBand } from "./schemas";

export type PreferenceOverride = {
  kind: string;
  detail: string;
};

export type CareerStageAssessment = {
  inferredStage: CareerStageBand;
  confidence: ConfidenceLevel;
  experienceSummary: ExperienceSummary;
  targetOpportunityBands: OpportunityBand[];
  stretchOpportunityBands: OpportunityBand[];
  unsuitableBands: OpportunityBand[];
  reasons: string[];
  preferenceOverrides: PreferenceOverride[];
  evidenceIds: string[];
  policyVersion: string;
  assessedAt: string;
  evidenceFingerprint: string;
  preferencesFingerprint: string;
};

export function assessCareerStage(input: {
  evidence: CareerEvidence;
  preferences: JobSearchPreferences;
  evidenceFingerprint: string;
  preferencesFingerprint: string;
  assessedAt: string;
}): CareerStageAssessment {
  const summary = summarizeExperience(input.evidence);
  const preferenceOverrides: PreferenceOverride[] = [];
  const reasons: string[] = [];

  let inferredStage: CareerStageBand = "unknown";
  let confidence: ConfidenceLevel = "low";

  const hasEducation = summary.educationCount > 0;
  const hasSkills = summary.skillCount > 0;
  const hasProjects = summary.projectCount > 0;

  if (summary.employmentMonths >= 48) {
    inferredStage = "established_individual_contributor";
    confidence = "medium";
    reasons.push(
      `Verified employment totals about ${summary.employmentMonths} months without double-counting overlaps.`,
    );
  } else if (summary.employmentMonths >= 12) {
    inferredStage = "early_career";
    confidence = "medium";
    reasons.push(
      `Verified employment totals about ${summary.employmentMonths} months.`,
    );
  } else if (summary.internshipMonths >= INTERNSHIP_PROGRESSION_MONTHS) {
    inferredStage = "experienced_intern_or_graduate_ready";
    confidence = "high";
    reasons.push(
      `Verified internship experience totals about ${summary.internshipMonths} months, so early-career engineering roles are prioritized over another internship by default.`,
    );
  } else if (summary.internshipMonths > 0 || (hasEducation && hasProjects)) {
    inferredStage = "internship_ready";
    confidence = summary.internshipMonths > 0 ? "medium" : "low";
    reasons.push(
      summary.internshipMonths > 0
        ? `Verified internship experience totals about ${summary.internshipMonths} months.`
        : "Education and project evidence support internship/trainee/graduate targeting.",
    );
  } else if (hasEducation || hasSkills || hasProjects) {
    inferredStage = "student_or_beginner";
    confidence = "low";
    reasons.push(
      "Limited verified professional experience; beginner/internship-oriented bands are recommended.",
    );
  } else {
    inferredStage = "unknown";
    confidence = "low";
    reasons.push("Insufficient verified evidence to assess career stage confidently.");
  }

  let targetOpportunityBands = defaultTargets(inferredStage);
  let stretchOpportunityBands = defaultStretch(inferredStage);
  const unsuitableBands = defaultUnsuitable(inferredStage);

  const wantsInternship = prefersInternship(input.preferences);
  if (wantsInternship) {
    if (!targetOpportunityBands.includes("internship_ready")) {
      targetOpportunityBands = ["internship_ready", ...targetOpportunityBands];
    }
    preferenceOverrides.push({
      kind: "explicit_internship_preference",
      detail:
        "Explicit role/employment preferences keep internship-level opportunities eligible despite inferred progression.",
    });
    reasons.push(
      "Explicit preference override: internships remain eligible because the user requested them.",
    );
  } else if (inferredStage === "experienced_intern_or_graduate_ready") {
    targetOpportunityBands = targetOpportunityBands.filter(
      (band) => band !== "internship_ready",
    );
    reasons.push(
      "Internships are de-prioritized because verified evidence supports progressing beyond them and no explicit internship preference was set.",
    );
  }

  if (input.preferences.experience_levels.includes("senior")) {
    if (!targetOpportunityBands.includes("senior")) {
      targetOpportunityBands = [...targetOpportunityBands, "senior"];
    }
    preferenceOverrides.push({
      kind: "explicit_senior_preference",
      detail: "User explicitly selected senior experience level preferences.",
    });
  }

  if (input.preferences.excluded_keywords.some((keyword) => /senior|lead|principal|staff/iu.test(keyword))) {
    targetOpportunityBands = targetOpportunityBands.filter(
      (band) => band !== "senior" && band !== "lead_or_management",
    );
    stretchOpportunityBands = stretchOpportunityBands.filter(
      (band) => band !== "senior" && band !== "lead_or_management",
    );
    preferenceOverrides.push({
      kind: "explicit_seniority_exclusion",
      detail: "Excluded keywords remove senior/lead targeting.",
    });
  }

  return {
    inferredStage,
    confidence,
    experienceSummary: summary,
    targetOpportunityBands,
    stretchOpportunityBands,
    unsuitableBands,
    reasons,
    preferenceOverrides,
    evidenceIds: summary.evidenceIds,
    policyVersion: CAREER_STAGE_POLICY_VERSION,
    assessedAt: input.assessedAt,
    evidenceFingerprint: input.evidenceFingerprint,
    preferencesFingerprint: input.preferencesFingerprint,
  };
}

function prefersInternship(preferences: JobSearchPreferences): boolean {
  return (
    preferences.employment_types.includes("internship") ||
    preferences.roles.some((role) => /intern|trainee/iu.test(role))
  );
}

function defaultTargets(stage: CareerStageBand): OpportunityBand[] {
  switch (stage) {
    case "student_or_beginner":
      return ["internship_ready", "student_or_beginner"];
    case "internship_ready":
      return ["internship_ready", "experienced_intern_or_graduate_ready"];
    case "experienced_intern_or_graduate_ready":
      return ["experienced_intern_or_graduate_ready", "early_career"];
    case "early_career":
      return ["early_career", "experienced_intern_or_graduate_ready"];
    case "established_individual_contributor":
      return ["established_individual_contributor", "early_career"];
    case "senior":
      return ["senior", "established_individual_contributor"];
    case "lead_or_management":
      return ["lead_or_management", "senior"];
    default:
      return ["unknown"];
  }
}

function defaultStretch(stage: CareerStageBand): OpportunityBand[] {
  switch (stage) {
    case "internship_ready":
      return ["early_career"];
    case "experienced_intern_or_graduate_ready":
      return ["established_individual_contributor"];
    case "early_career":
      return ["established_individual_contributor"];
    default:
      return [];
  }
}

function defaultUnsuitable(stage: CareerStageBand): OpportunityBand[] {
  if (
    stage === "student_or_beginner" ||
    stage === "internship_ready" ||
    stage === "experienced_intern_or_graduate_ready" ||
    stage === "early_career"
  ) {
    return ["senior", "lead_or_management"];
  }
  return [];
}
