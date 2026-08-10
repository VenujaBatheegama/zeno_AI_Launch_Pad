import type {
  DiscoveredJob,
  JobSearchCriteria,
  JobSearchPreferences,
  JobSearchProfile,
  JobSourceResult,
  NormalizedExternalJob,
  UserJobState,
} from "../domain/job";

export type JobSourceIdentity = {
  key: string;
  name: string;
};

export interface JobSource {
  readonly identity: JobSourceIdentity;
  search(criteria: JobSearchCriteria): Promise<JobSourceResult>;
}

export interface JobDiscoveryRepository {
  getSearchProfile(userId: string): Promise<JobSearchProfile | null>;
  saveSearchProfile(input: {
    id: string;
    userId: string;
    preferences: JobSearchPreferences;
    preferenceRevision: number;
    updatedAt: string;
  }): Promise<JobSearchProfile>;
  upsertDiscoveredJobs(input: {
    userId: string;
    source: JobSourceIdentity;
    jobs: NormalizedExternalJob[];
    seenAt: string;
  }): Promise<DiscoveredJob[]>;
  listJobs(input: {
    userId: string;
    includeDismissed: boolean;
    limit: number;
    offset: number;
  }): Promise<DiscoveredJob[]>;
  setUserJobState(input: {
    userId: string;
    listingId: string;
    state: UserJobState;
    updatedAt: string;
  }): Promise<DiscoveredJob>;
  clearDiscoveredJobs(input: {
    userId: string;
    includeSaved: boolean;
  }): Promise<number>;
}

export type IdGenerator = () => string;
export type Clock = () => Date;
