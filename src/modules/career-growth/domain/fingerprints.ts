import { createHash } from "node:crypto";

import type {
  CampaignIntent,
  VerifiedEvidenceSummary,
  WorkloadSnapshot,
} from "./schemas";
import type { AssessmentMode } from "./schemas";

export function stableHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 32);
}

export function campaignCriteriaFingerprint(intent: CampaignIntent): string {
  return stableHash({
    role: normalize(intent.primaryRole),
    location: normalize(intent.location),
    workMode: intent.workMode,
    employmentTypes: [...intent.employmentTypes].map(normalize).sort(),
    experienceLevels: [...intent.experienceLevels].map(normalize).sort(),
    stack: [...intent.preferredTechnologies].map(normalize).sort(),
    targetReadyDate: intent.targetReadyDate,
    weeklyHoursAvailable: intent.weeklyHoursAvailable,
    criteriaVersion: intent.criteriaVersion,
  });
}

export function evidenceVersion(summary: VerifiedEvidenceSummary): string {
  if (!summary.verified || !summary.evidenceSetId) {
    return `unverified:${summary.updatedAt ?? "none"}`;
  }
  return stableHash({
    id: summary.evidenceSetId,
    updatedAt: summary.updatedAt,
    skills: summary.skills.map((item) => normalize(item.name)).sort(),
    projects: summary.projects.map((item) => ({
      name: normalize(item.name),
      technologies: [...(item.technologies ?? [])].map(normalize).sort(),
    })),
    work: summary.workExperience.map((item) => ({
      role: normalize(item.role ?? ""),
      employer: normalize(item.employer ?? ""),
    })),
  });
}

export function workloadVersion(snapshot: Pick<
  WorkloadSnapshot,
  | "activeProjectCount"
  | "totalEstimatedWeeklyHours"
  | "coveringProjectId"
  | "overcommitted"
>): string {
  return stableHash(snapshot);
}

export function assessmentInputFingerprint(input: {
  userId: string;
  campaignId: string;
  criteriaFingerprint: string;
  evidenceVersion: string;
  workloadVersion: string;
  mode: AssessmentMode;
  marketSampleSize: number;
  dominantGapKey: string | null;
}): string {
  return stableHash(input);
}

export function recommendationFingerprint(input: {
  campaignId: string;
  gapKey: string;
  type: string;
  criteriaFingerprint: string;
  evidenceVersion: string;
}): string {
  return stableHash(input);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
