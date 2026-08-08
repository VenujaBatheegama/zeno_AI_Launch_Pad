import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import type {
  AggregatedCapability,
  InferredDirection,
} from "../domain/capability-aggregation";
import type {
  CapabilitySignal,
  ExtractedCapabilitySignals,
} from "../domain/capability-schemas";
import type { CareerStageAssessment } from "../domain/career-stage";
import type {
  CareerLevelSuitability,
  ConfidenceLevel,
  DescriptionQuality,
  ExtractedJobAnalysis,
  JobRequirement,
  OpportunityBand,
  RequirementMatch,
  ScoreBreakdown,
} from "../domain/schemas";

export type PersistedCareerStageAssessment = CareerStageAssessment & {
  id: string;
  userId: string;
  evidenceSetId: string;
  createdAt: string;
  updatedAt: string;
};

export type PlannedJobQuery = {
  id: string;
  searchPlanId: string;
  roleFamily: string;
  queryText: string;
  opportunityBand: OpportunityBand;
  priority: number;
  reason: string;
  source:
    | "explicit_preference"
    | "deterministic_mapping"
    | "preferred_technology"
    | "demonstrated_capability"
    | "exploration"
    | "alternative_lane";
  executionStatus: "pending" | "succeeded" | "failed" | "skipped";
  createdAt: string;
};

export type JobSearchPlan = {
  id: string;
  userId: string;
  careerStageAssessmentId: string;
  preferencesFingerprint: string;
  evidenceFingerprint: string;
  queryBudget: number;
  status: "draft" | "executed" | "partial" | "failed";
  reasons: string[];
  createdAt: string;
  updatedAt: string;
  queries: PlannedJobQuery[];
};

export type JobAnalysis = {
  id: string;
  userId: string;
  jobId: string;
  listingId: string;
  descriptionFingerprint: string;
  descriptionQuality: DescriptionQuality;
  opportunityBand: OpportunityBand;
  opportunityConfidence: ConfidenceLevel;
  opportunityReasons: string[];
  extractionPolicyVersion: string;
  status: "ready" | "not_analysable" | "failed";
  warnings: string[];
  requirements: JobRequirement[];
  createdAt: string;
  updatedAt: string;
};

export type JobMatchAnalysis = {
  id: string;
  userId: string;
  jobAnalysisId: string;
  listingId: string;
  jobId: string;
  careerStageAssessmentId: string;
  evidenceFingerprint: string;
  preferencesFingerprint: string;
  descriptionFingerprint: string;
  evidenceFitScore: number;
  careerLevel: CareerLevelSuitability;
  hardConstraintEligible: boolean;
  hardConstraintReasons: string[];
  analysisConfidence: ConfidenceLevel;
  scoringPolicyVersion: string;
  matchingPolicyVersion: string;
  scoreBreakdown: ScoreBreakdown;
  explanation: string;
  status: "current" | "stale";
  matches: RequirementMatch[];
  createdAt: string;
  updatedAt: string;
};

export type RankedJobMatchCard = {
  listingId: string;
  jobId: string;
  title: string;
  organizationName: string | null;
  applicationUrl: string | null;
  userState: "discovered" | "saved" | "dismissed";
  evidenceFitScore: number;
  careerLevel: CareerLevelSuitability;
  confidence: ConfidenceLevel;
  topMatched: string[];
  primaryGaps: string[];
  explanation: string;
  stale: boolean;
  eligible: boolean;
  queryProvenance: string[];
  preferenceTier?: string;
  preferenceReasons?: string[];
  capabilityAlignmentScore?: number;
  capabilityAlignmentReasons?: string[];
  inferredDirectionAlignment?: "aligned" | "adjacent" | "none";
  personalizationExplanation?: string;
};

export type JobMatchDetails = {
  card: RankedJobMatchCard;
  analysis: JobAnalysis;
  match: JobMatchAnalysis;
  assessment: PersistedCareerStageAssessment;
};

export type PersistedCandidateCapabilityProfile = {
  id: string;
  userId: string;
  evidenceSetId: string;
  evidenceFingerprint: string;
  extractionPolicyVersion: string;
  aggregationPolicyVersion: string;
  status: "ready" | "stale" | "failed";
  warnings: string[];
  aggregates: AggregatedCapability[];
  directions: InferredDirection[];
  signals: CapabilitySignal[];
  createdAt: string;
  updatedAt: string;
};

export interface CareerIntelligenceRepository {
  saveCareerStageAssessment(input: {
    id: string;
    userId: string;
    evidenceSetId: string;
    assessment: CareerStageAssessment;
    createdAt: string;
  }): Promise<PersistedCareerStageAssessment>;
  getLatestCareerStageAssessment(
    userId: string,
  ): Promise<PersistedCareerStageAssessment | null>;
  getCareerStageAssessmentById(
    id: string,
    userId: string,
  ): Promise<PersistedCareerStageAssessment | null>;

  saveSearchPlan(input: {
    plan: Omit<JobSearchPlan, "queries">;
    queries: Array<Omit<PlannedJobQuery, "searchPlanId" | "createdAt"> & {
      createdAt?: string;
    }>;
  }): Promise<JobSearchPlan>;
  getLatestSearchPlan(userId: string): Promise<JobSearchPlan | null>;
  getSearchPlanById(id: string, userId: string): Promise<JobSearchPlan | null>;
  updateSearchPlanStatus(input: {
    id: string;
    userId: string;
    status: JobSearchPlan["status"];
    updatedAt: string;
  }): Promise<void>;
  updatePlannedQueryStatus(input: {
    id: string;
    searchPlanId: string;
    status: PlannedJobQuery["executionStatus"];
  }): Promise<void>;
  linkJobToQuery(input: {
    listingId: string;
    plannedQueryId: string;
    discoveredAt: string;
  }): Promise<void>;
  listQueryProvenance(input: {
    userId: string;
    listingIds: string[];
  }): Promise<Map<string, string[]>>;

  getJobAnalysisByListing(
    userId: string,
    listingId: string,
  ): Promise<JobAnalysis | null>;
  listJobAnalysesByListingIds(
    userId: string,
    listingIds: string[],
  ): Promise<JobAnalysis[]>;
  saveJobAnalysis(analysis: JobAnalysis): Promise<JobAnalysis>;

  getMatchAnalysisByListing(
    userId: string,
    listingId: string,
  ): Promise<JobMatchAnalysis | null>;
  saveMatchAnalysis(analysis: JobMatchAnalysis): Promise<JobMatchAnalysis>;
  listCurrentMatchAnalyses(userId: string): Promise<JobMatchAnalysis[]>;
  markMatchAnalysesStale(input: {
    userId: string;
    exceptIds?: string[];
    updatedAt: string;
  }): Promise<void>;
  clearMatchAnalyses(userId: string): Promise<number>;

  saveCapabilityProfile(
    profile: PersistedCandidateCapabilityProfile,
  ): Promise<PersistedCandidateCapabilityProfile>;
  getLatestCapabilityProfile(
    userId: string,
  ): Promise<PersistedCandidateCapabilityProfile | null>;
  markCapabilityProfileStale(input: {
    userId: string;
    updatedAt: string;
  }): Promise<void>;
}

export interface JobRequirementExtractor {
  extract(input: {
    title: string;
    description: string;
    requirementIds: string[];
  }): Promise<ExtractedJobAnalysis>;
}

export interface RequirementMatcher {
  classify(input: {
    requirements: JobRequirement[];
    evidence: CareerEvidence;
    unclassifiedRequirementIds: string[];
  }): Promise<RequirementMatch[]>;
}

export interface CapabilitySignalExtractor {
  extract(evidence: CareerEvidence): Promise<ExtractedCapabilitySignals>;
}

export type IdGenerator = () => string;
export type Clock = () => Date;
