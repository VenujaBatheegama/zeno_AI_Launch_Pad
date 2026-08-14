import type { NormalizedExternalJob } from "@/modules/job-discovery/domain/job";

import type {
  CanonicalJobSearch,
  CanonicalSearchMember,
  FreshWatchWorkMode,
  ProviderHealth,
  ProviderJobSighting,
} from "../domain/fresh-watch";
import type {
  CampaignListingSighting,
  InstantSearchSession,
  JobSearchCampaign,
  JobSearchCampaignRun,
} from "../domain/job-campaign";

export type ObserveProviderJobInput = {
  provider: string;
  providerJobId: string;
  title: string;
  company: string | null;
  location: string | null;
  publicUrl: string | null;
  publishedAt: string | null;
  fingerprint: string;
  listingId?: string | null;
  jobId?: string | null;
  seenAt: string;
};

export type FreshWatchCaps = {
  linkedInIntervalMs: number;
  linkedInRecencySeconds: number;
  broadIntervalMs: number;
  maxCanonicalSearchesPerTick: number;
  linkedInMaxPages: number;
  linkedInMaxResults: number;
  maxDescriptionFetchesPerTick: number;
  maxGroqAnalysesPerTick: number;
  maxAnalysesPerUser: number;
  providerCooldownMs: number;
  schedulerLeaseMs: number;
  initialAlertCap: number;
  minScore: number;
};

export type CampaignPatch = Partial<{
  name: string;
  status: JobSearchCampaign["status"];
  primaryRole: string;
  location: string;
  workMode: JobSearchCampaign["workMode"];
  employmentTypes: JobSearchCampaign["employmentTypes"];
  experienceLevels: JobSearchCampaign["experienceLevels"];
  minimumScore: number;
  preferredTechnologies: string[];
  targetReadyDate: string | null;
  weeklyHoursAvailable: JobSearchCampaign["weeklyHoursAvailable"];
  criteriaVersion: number;
  canonicalSearchId: string;
  lastLinkedInSearchAt: string | null;
  nextLinkedInSearchAt: string | null;
  lastBroadSearchAt: string | null;
  nextBroadSearchAt: string | null;
  lastDiscoveryAt: string | null;
  lastError: string | null;
  initialAlertsRemaining: number;
  archivedAt: string | null;
  updatedAt: string;
}>;

export interface FreshWatchRepository {
  listCampaignsByUserId(userId: string): Promise<JobSearchCampaign[]>;
  getCampaignById(campaignId: string): Promise<JobSearchCampaign | null>;
  countActiveCampaigns(userId: string): Promise<number>;
  insertCampaign(campaign: JobSearchCampaign): Promise<JobSearchCampaign>;
  updateCampaign(
    campaignId: string,
    patch: CampaignPatch,
  ): Promise<JobSearchCampaign>;
  claimDueBroadCampaigns(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }): Promise<JobSearchCampaign[]>;
  releaseBroadCampaignLease(campaignId: string): Promise<void>;
  tryClaimCampaignRunLease(input: {
    campaignId: string;
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
  }): Promise<boolean>;

  getCanonicalSearchByKey(key: string): Promise<CanonicalJobSearch | null>;
  getCanonicalSearchById(id: string): Promise<CanonicalJobSearch | null>;
  upsertCanonicalSearch(search: CanonicalJobSearch): Promise<CanonicalJobSearch>;
  claimDueCanonicalSearches(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }): Promise<CanonicalJobSearch[]>;
  releaseCanonicalSearchLease(searchId: string): Promise<void>;
  updateCanonicalSearch(
    searchId: string,
    patch: Partial<
      Pick<
        CanonicalJobSearch,
        | "nextDueAt"
        | "lastAttemptedAt"
        | "lastSucceededAt"
        | "leaseOwner"
        | "leaseExpiresAt"
        | "lastError"
        | "lastResultSummary"
      >
    >,
  ): Promise<CanonicalJobSearch>;

  replaceMembership(input: {
    campaignId: string;
    userId: string;
    canonicalSearchId: string;
    attachedAt: string;
  }): Promise<void>;
  detachMembership(campaignId: string): Promise<void>;
  listMembers(canonicalSearchId: string): Promise<CanonicalSearchMember[]>;
  countActiveMembers(canonicalSearchId: string): Promise<number>;

  observeProviderJob(
    input: ObserveProviderJobInput,
  ): Promise<ProviderJobSighting>;
  findSightingByFingerprint(
    fingerprint: string,
  ): Promise<ProviderJobSighting | null>;
  attachUserJob(input: {
    userId: string;
    listingId: string;
    seenAt: string;
  }): Promise<void>;
  setJobDescriptionIfEmpty(input: {
    listingId: string;
    description: string;
  }): Promise<void>;
  getListingDescription(listingId: string): Promise<string | null>;

  attachCampaignListing(input: {
    campaignId: string;
    listingId: string;
    discoverySource: CampaignListingSighting["discoverySource"];
    seenAt: string;
    originatingRunId: string | null;
  }): Promise<CampaignListingSighting>;
  listCampaignListings(campaignId: string): Promise<CampaignListingSighting[]>;
  listCampaignListingIdsForUser(userId: string): Promise<string[]>;
  countNewCampaignListings(campaignId: string, since?: string): Promise<number>;
  countQualifyingCampaignListings(campaignId: string): Promise<number>;
  updateCampaignListingQualification(input: {
    campaignId: string;
    listingId: string;
    qualification: CampaignListingSighting["qualification"];
  }): Promise<void>;

  createInstantSearchSession(
    session: InstantSearchSession,
  ): Promise<InstantSearchSession>;
  archiveInstantSearchSessions(userId: string): Promise<void>;
  getLatestInstantSearchSession(
    userId: string,
  ): Promise<InstantSearchSession | null>;
  updateInstantSearchSession(
    sessionId: string,
    patch: Partial<
      Pick<
        InstantSearchSession,
        "jobsFound" | "analysedCount" | "listingIds" | "completedAt" | "status"
      >
    >,
  ): Promise<InstantSearchSession>;

  insertCampaignRun(run: JobSearchCampaignRun): Promise<JobSearchCampaignRun>;
  updateCampaignRun(
    runId: string,
    patch: Partial<
      Pick<
        JobSearchCampaignRun,
        | "status"
        | "discovered"
        | "analysed"
        | "qualifying"
        | "completedAt"
        | "error"
      >
    >,
  ): Promise<JobSearchCampaignRun>;
  listCampaignRuns(
    campaignId: string,
    limit?: number,
  ): Promise<JobSearchCampaignRun[]>;

  getProviderHealth(provider: string): Promise<ProviderHealth | null>;
  upsertProviderHealth(health: ProviderHealth): Promise<ProviderHealth>;

  /** Compatibility: first non-archived campaign for a user. */
  getWatchByUserId(userId: string): Promise<JobSearchCampaign | null>;
}

export type LinkedInFreshClient = {
  searchFreshCards(input: {
    keywords: string;
    location: string;
    recencySeconds: number;
    maxPages: number;
    pageSize: number;
  }): Promise<{ jobs: NormalizedExternalJob[] }>;
  fetchJobDescription(externalId: string): Promise<string | null>;
};

export type FreshAnalysisResult = {
  listingId: string;
  ok: boolean;
  matchAnalysisId?: string;
  evidenceFitScore?: number;
  careerLevel?: string;
  hardConstraintEligible?: boolean;
  analysisConfidence?: string;
  scoringPolicyVersion?: string;
  matchingPolicyVersion?: string;
  explanation?: string;
  topMatched?: string[];
  primaryGaps?: string[];
  title?: string;
  organizationName?: string | null;
  applicationUrl?: string | null;
  location?: string | null;
  workMode?: string | null;
  extractionCacheHit?: boolean;
  llmCalls?: number;
  error?: string;
};

export type FreshWatchLogger = (
  event: string,
  payload: Record<string, unknown>,
) => void;

export function defaultFreshWatchLogger(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.info(
    JSON.stringify({
      scope: "job-campaign",
      event,
      ...payload,
    }),
  );
}

export type { FreshWatchWorkMode };
