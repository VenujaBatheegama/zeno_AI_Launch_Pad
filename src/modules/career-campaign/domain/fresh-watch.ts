import { z } from "zod";

import { workModeSchema } from "@/modules/job-discovery/domain/job";

export const freshWatchStatusSchema = z.enum([
  "disabled",
  "active",
  "paused",
]);
export type FreshWatchStatus = z.infer<typeof freshWatchStatusSchema>;

export const freshWorkModeSchema = z.enum([
  "onsite",
  "hybrid",
  "remote",
  "any",
]);
export type FreshWatchWorkMode = z.infer<typeof freshWorkModeSchema>;

export const providerHealthStatusSchema = z.enum([
  "ok",
  "cooldown",
  "suspended",
  "disabled",
]);
export type ProviderHealthStatus = z.infer<typeof providerHealthStatusSchema>;

export const enableFreshJobWatchSchema = z.object({
  userId: z.uuid(),
  primaryRole: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(100),
  workMode: freshWorkModeSchema.default("any"),
  minScore: z.number().min(0).max(100).optional(),
});
export type EnableFreshJobWatchCommand = z.infer<
  typeof enableFreshJobWatchSchema
>;

export const pauseFreshJobWatchSchema = z.object({
  userId: z.uuid(),
});

export const updateFreshJobWatchSchema = enableFreshJobWatchSchema;

export type FreshJobWatch = {
  id: string;
  userId: string;
  status: Exclude<FreshWatchStatus, "disabled">;
  primaryRole: string;
  location: string;
  workMode: FreshWatchWorkMode;
  minScore: number | null;
  canonicalSearchId: string;
  lastBroadSearchAt: string | null;
  nextBroadSearchAt: string | null;
  lastDiscoveryAt: string | null;
  lastError: string | null;
  initialAlertsRemaining: number;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalJobSearch = {
  id: string;
  canonicalKey: string;
  provider: string;
  primaryRole: string;
  location: string;
  workMode: FreshWatchWorkMode;
  employmentType: string | null;
  recencyStrategy: string;
  nextDueAt: string;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  lastResultSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalSearchMember = {
  canonicalSearchId: string;
  campaignId: string;
  userId: string;
  attachedAt: string;
};

export type ProviderJobSighting = {
  id: string;
  provider: string;
  providerJobId: string;
  listingId: string | null;
  jobId: string | null;
  title: string;
  company: string | null;
  location: string | null;
  publicUrl: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  fingerprint: string;
  isNew: boolean;
};

export type ProviderHealth = {
  provider: string;
  status: ProviderHealthStatus;
  cooldownUntil: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  updatedAt: string;
};

export type FreshJobWatchStatusView = {
  status: FreshWatchStatus | "enabling" | "checking";
  enabled: boolean;
  primaryRole: string | null;
  location: string | null;
  workMode: FreshWatchWorkMode | null;
  lastLinkedInCheckAt: string | null;
  lastBroadSearchAt: string | null;
  nextLinkedInCheckAt: string | null;
  nextBroadSearchAt: string | null;
  lastDiscoveryAt: string | null;
  providerWarning: string | null;
  recommendationsHref: string;
};

export function formatFirstSeenLabel(firstSeenAt: string, now: Date): string {
  const seen = new Date(firstSeenAt);
  if (Number.isNaN(seen.getTime())) return "First seen by Zeno recently";
  const minutes = Math.max(0, Math.round((now.getTime() - seen.getTime()) / 60_000));
  if (minutes < 1) return "First seen by Zeno just now";
  if (minutes === 1) return "First seen by Zeno 1 minute ago";
  if (minutes < 60) return `First seen by Zeno ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "First seen by Zeno 1 hour ago";
  return `First seen by Zeno ${hours} hours ago`;
}

export function formatPublicationLabel(
  publishedAt: string | null,
): string {
  if (!publishedAt) return "Publication time unavailable";
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return "Publication time unavailable";
  return "Posted recently";
}

export { workModeSchema };
