import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobSearchCampaign } from "@/modules/career-campaign/domain/job-campaign";

import type { WeeklyHoursAvailable } from "./policy";
import type { CampaignIntent, VerifiedEvidenceSummary } from "./schemas";

export function toCampaignIntent(campaign: JobSearchCampaign): CampaignIntent {
  return {
    id: campaign.id,
    userId: campaign.userId,
    name: campaign.name,
    status: campaign.status,
    primaryRole: campaign.primaryRole,
    location: campaign.location,
    workMode: campaign.workMode,
    employmentTypes: [...campaign.employmentTypes],
    experienceLevels: [...campaign.experienceLevels],
    preferredTechnologies: campaign.preferredTechnologies ?? [],
    targetReadyDate: campaign.targetReadyDate ?? null,
    weeklyHoursAvailable:
      (campaign.weeklyHoursAvailable as WeeklyHoursAvailable | null | undefined) ??
      null,
    criteriaVersion: campaign.criteriaVersion,
    priority: campaign.status === "active" ? 1 : 0,
  };
}

export function toVerifiedEvidenceSummary(input: {
  evidenceSetId: string | null;
  status: "draft" | "verified" | null;
  updatedAt: string | null;
  evidence: CareerEvidence | null;
}): VerifiedEvidenceSummary {
  const evidence = input.status === "verified" ? input.evidence : null;
  if (!evidence) {
    return {
      evidenceSetId: input.evidenceSetId,
      verified: false,
      updatedAt: input.updatedAt,
      skills: [],
      projects: [],
      workExperience: [],
      educationCount: 0,
      githubUrl: null,
      portfolioUrl: null,
      linkedinUrl: null,
    };
  }
  return {
    evidenceSetId: input.evidenceSetId,
    verified: true,
    updatedAt: input.updatedAt,
    skills: evidence.skills.map((item) => ({ id: item.id, name: item.name })),
    projects: evidence.projects.map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      bullets: item.bullets,
      technologies: item.technologies,
    })),
    workExperience: evidence.work_experience.map((item) => ({
      id: item.id,
      name: item.role,
      role: item.role,
      employer: item.employer,
      bullets: item.bullets,
    })),
    educationCount: evidence.education.length,
    githubUrl: evidence.profile.github_url ?? null,
    portfolioUrl: evidence.profile.portfolio_url ?? null,
    linkedinUrl: evidence.profile.linkedin_url ?? null,
  };
}
