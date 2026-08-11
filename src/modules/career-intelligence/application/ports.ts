import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import type { EscoResolutionStatus, PlannedQuerySource } from "../domain/esco-selection";
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
  source: PlannedQuerySource;
  executionStatus: "pending" | "succeeded" | "failed" | "skipped";
  createdAt: string;
};

export type JobSearchPlan = {
  id: string;
  userId: string;
  careerStageAssessmentId: string | null;
  preferencesFingerprint: string;
  /** ESCO policy fingerprint used when the plan was generated. */
  evidenceFingerprint: string;
  queryBudget: number;
  status: "draft" | "executed" | "partial" | "failed";
  generationStatus: "pending" | "ready" | "failed";
  preferenceRevision: number;
  /** Reserved revision slot (ESCO policy hash historically used profileRevision). */
  profileRevision: number;
  planRevision: number;
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

/** Shared extraction cache row keyed by description hash + schema/policy versions. */
export type CachedRequirementExtraction = {
  id: string;
  jobId: string | null;
  descriptionHash: string;
  schemaVersion: string;
  extractionPolicyVersion: string;
  status: "ready" | "insufficient_description";
  opportunityBand: OpportunityBand;
  opportunityConfidence: ConfidenceLevel;
  opportunityReasons: string[];
  requirements: JobRequirement[];
  warnings: string[];
  model: string | null;
  lastErrorCategory: string | null;
  extractedAt: string;
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
  searchRelevance?: number;
  interestAlignment?: number;
  rankingReasons?: string[];
  preferredMatches?: string[];
  verifiedMatches?: string[];
};

export type JobMatchDetails = {
  card: RankedJobMatchCard;
  analysis: JobAnalysis;
  match: JobMatchAnalysis;
  assessment: PersistedCareerStageAssessment;
};

export type EscoRoleResolutionCache = {
  normalizedRole: string;
  language: string;
  occupationId: string | null;
  preferredTitle: string | null;
  selectedSearchTitles: string[];
  status: EscoResolutionStatus;
  resolverVersion: string;
  selectionPolicyVersion: string;
  resolvedAt: string;
};

export interface EscoOccupationResolver {
  resolveRole(role: string): Promise<import("../domain/esco-selection").EscoRoleResolution>;
  /**
   * Same-concept skill labels only (preferred + alternatives). Never hierarchy.
   * Failures must resolve to original-term-only without throwing.
   */
  resolveSkillLabels(term: string): Promise<{
    originalTerm: string;
    conceptUri?: string;
    labels: string[];
  }>;
}

export interface EscoRoleResolutionCacheStore {
  getResolution(input: {
    normalizedRole: string;
    language: string;
    resolverVersion: string;
    selectionPolicyVersion: string;
  }): Promise<EscoRoleResolutionCache | null>;
  saveResolution(row: EscoRoleResolutionCache): Promise<void>;
}

export interface CareerIntelligenceRepository extends EscoRoleResolutionCacheStore {
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

  getRequirementExtraction(input: {
    descriptionHash: string;
    schemaVersion: string;
    extractionPolicyVersion: string;
  }): Promise<CachedRequirementExtraction | null>;
  saveRequirementExtraction(
    row: CachedRequirementExtraction,
  ): Promise<CachedRequirementExtraction>;

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

export type IdGenerator = () => string;
export type Clock = () => Date;
