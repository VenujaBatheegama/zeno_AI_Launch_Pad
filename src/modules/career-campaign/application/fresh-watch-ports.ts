import type { NormalizedExternalJob } from "@/modules/job-discovery/domain/job";

import type {
  CanonicalJobSearch,
  CanonicalSearchMember,
  FreshJobWatch,
  FreshWatchWorkMode,
  ProviderHealth,
  ProviderJobSighting,
} from "../domain/fresh-watch";

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

export interface FreshWatchRepository {
  getWatchByUserId(userId: string): Promise<FreshJobWatch | null>;
  upsertWatch(watch: FreshJobWatch): Promise<FreshJobWatch>;
  listActiveWatches(): Promise<FreshJobWatch[]>;
  claimDueBroadWatches(input: {
    now: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }): Promise<FreshJobWatch[]>;
  releaseBroadWatchLease(watchId: string): Promise<void>;
  updateWatch(
    watchId: string,
    patch: Partial<{
      status: FreshJobWatch["status"];
      primaryRole: string;
      location: string;
      workMode: FreshJobWatch["workMode"];
      minScore: number | null;
      canonicalSearchId: string;
      lastBroadSearchAt: string | null;
      nextBroadSearchAt: string | null;
      lastDiscoveryAt: string | null;
      lastError: string | null;
      initialAlertsRemaining: number;
      updatedAt: string;
    }>,
  ): Promise<FreshJobWatch>;

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
    watchId: string;
    userId: string;
    canonicalSearchId: string;
    attachedAt: string;
  }): Promise<void>;
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

  getProviderHealth(provider: string): Promise<ProviderHealth | null>;
  upsertProviderHealth(health: ProviderHealth): Promise<ProviderHealth>;
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
      scope: "fresh-job-watch",
      event,
      ...payload,
    }),
  );
}

export type { FreshWatchWorkMode };
