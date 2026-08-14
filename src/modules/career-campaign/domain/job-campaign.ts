import { z } from "zod";

import {
  employmentTypeSchema,
  experienceLevelSchema,
} from "@/modules/job-discovery/domain/job";

import { freshWorkModeSchema } from "./fresh-watch";

export const ACTIVE_JOB_CAMPAIGN_LIMIT = 3;

export const weeklyHoursAvailableSchema = z.union([
  z.literal(2),
  z.literal(5),
  z.literal(8),
  z.literal(10),
]);
export type WeeklyHoursAvailable = z.infer<typeof weeklyHoursAvailableSchema>;

export const jobCampaignStatusSchema = z.enum([
  "active",
  "paused",
  "archived",
]);
export type JobCampaignStatus = z.infer<typeof jobCampaignStatusSchema>;

export const campaignWorkModeSchema = freshWorkModeSchema;
export type CampaignWorkMode = z.infer<typeof campaignWorkModeSchema>;

export function generateCampaignName(role: string, location: string): string {
  const trimmedRole = role.trim();
  const trimmedLocation = location.trim();
  if (trimmedRole && trimmedLocation) {
    return `${trimmedRole} — ${trimmedLocation}`.slice(0, 80);
  }
  return (trimmedRole || trimmedLocation || "Job campaign").slice(0, 80);
}

export const createJobCampaignSchema = z.object({
  userId: z.uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  primaryRole: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(100),
  workMode: campaignWorkModeSchema.default("any"),
  employmentTypes: z.array(employmentTypeSchema).max(5).default([]),
  experienceLevels: z.array(experienceLevelSchema).max(5).default([]),
  minimumScore: z.number().min(0).max(100).optional(),
  preferredTechnologies: z
    .array(z.string().trim().min(1).max(40))
    .max(8)
    .default([]),
  targetReadyDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  weeklyHoursAvailable: weeklyHoursAvailableSchema.nullable().optional(),
});
export type CreateJobCampaignCommand = z.infer<typeof createJobCampaignSchema>;

export const patchJobCampaignSchema = z.object({
  userId: z.uuid(),
  campaignId: z.uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  primaryRole: z.string().trim().min(2).max(100).optional(),
  location: z.string().trim().min(2).max(100).optional(),
  workMode: campaignWorkModeSchema.optional(),
  employmentTypes: z.array(employmentTypeSchema).max(5).optional(),
  experienceLevels: z.array(experienceLevelSchema).max(5).optional(),
  minimumScore: z.number().min(0).max(100).optional(),
  preferredTechnologies: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  targetReadyDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  weeklyHoursAvailable: weeklyHoursAvailableSchema.nullable().optional(),
});
export type PatchJobCampaignCommand = z.infer<typeof patchJobCampaignSchema>;

export const campaignIdCommandSchema = z.object({
  userId: z.uuid(),
  campaignId: z.uuid(),
});

export type JobSearchCampaign = {
  id: string;
  userId: string;
  name: string;
  status: JobCampaignStatus;
  primaryRole: string;
  location: string;
  workMode: CampaignWorkMode;
  employmentTypes: CreateJobCampaignCommand["employmentTypes"];
  experienceLevels: CreateJobCampaignCommand["experienceLevels"];
  minimumScore: number;
  preferredTechnologies: string[];
  targetReadyDate: string | null;
  weeklyHoursAvailable: WeeklyHoursAvailable | null;
  criteriaVersion: number;
  canonicalSearchId: string;
  lastLinkedInSearchAt: string | null;
  nextLinkedInSearchAt: string | null;
  lastBroadSearchAt: string | null;
  nextBroadSearchAt: string | null;
  lastDiscoveryAt: string | null;
  lastError: string | null;
  initialAlertsRemaining: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type CampaignListingSighting = {
  campaignId: string;
  listingId: string;
  discoverySource: "linkedin_fresh" | "broad_hybrid" | "manual";
  firstSeenAt: string;
  lastSeenAt: string;
  originatingRunId: string | null;
  qualification: "pending" | "qualifying" | "below_threshold" | "ineligible";
  isNewForCampaign: boolean;
};

export type InstantSearchSession = {
  id: string;
  userId: string;
  status: "active" | "archived";
  jobsFound: number;
  analysedCount: number;
  listingIds: string[];
  startedAt: string;
  completedAt: string | null;
};

export type JobSearchCampaignRun = {
  id: string;
  campaignId: string;
  origin: "linkedin_fresh" | "broad_hybrid" | "manual";
  status: "running" | "completed" | "failed";
  discovered: number;
  analysed: number;
  qualifying: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

export type JobCampaignOverview = {
  instantSearch: {
    lastRanAt: string | null;
    jobsFound: number;
    analysedCount: number;
    hasResults: boolean;
  };
  campaigns: {
    active: number;
    paused: number;
    newResults: number;
  };
  tiles: JobCampaignTile[];
  recentOpportunities: RecentOpportunity[];
};

export type JobCampaignTile = {
  id: string;
  name: string;
  primaryRole: string;
  location: string;
  workMode: CampaignWorkMode;
  status: Exclude<JobCampaignStatus, "archived"> | "attention";
  newlyDiscovered: number;
  qualifyingMatches: number;
  lastLinkedInSearchAt: string | null;
  lastBroadSearchAt: string | null;
  providerWarning: string | null;
};

export type RecentOpportunity = {
  listingId: string;
  title: string;
  organizationName: string | null;
  originLabel: string;
  href: string;
  seenAt: string;
};

export function campaignOriginLabel(campaign: {
  primaryRole: string;
  location: string;
}): string {
  return generateCampaignName(campaign.primaryRole, campaign.location);
}

export function campaignNeedsAttention(campaign: JobSearchCampaign): boolean {
  return Boolean(campaign.lastError) && campaign.status === "active";
}
