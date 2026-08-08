import "server-only";

import { randomUUID } from "node:crypto";

import { getCurrentEvidence } from "@/modules/career-evidence/application/get-current-evidence";
import {
  ingestCv,
  type IngestCvCommand,
} from "@/modules/career-evidence/application/ingest-cv";
import {
  saveDraft,
  type SaveDraftCommand,
} from "@/modules/career-evidence/application/save-draft";
import {
  verifyEvidence,
  type VerifyEvidenceCommand,
} from "@/modules/career-evidence/application/verify-evidence";
import { GroqEvidenceExtractor } from "@/modules/career-evidence/infrastructure/groq-evidence-extractor";
import { PdfDocxTextExtractor } from "@/modules/career-evidence/infrastructure/pdf-docx-text-extractor";
import { SupabaseCvStorage } from "@/modules/career-evidence/infrastructure/supabase-cv-storage";
import { SupabaseEvidenceRepository } from "@/modules/career-evidence/infrastructure/supabase-evidence-repository";
import {
  discoverJobs,
  previewJobSearchQueries,
  type DiscoverJobsCommand,
} from "@/modules/job-discovery/application/discover-jobs";
import {
  clearDiscoveredJobsForUser,
  listDiscoveredJobs,
  setUserJobState,
  type ListJobsCommand,
  type SetJobStateCommand,
} from "@/modules/job-discovery/application/jobs";
import {
  getJobSearchProfile,
  saveJobSearchPreferences,
  type SavePreferencesCommand,
} from "@/modules/job-discovery/application/preferences";
import { HybridJobSource } from "@/modules/job-discovery/application/hybrid-search";
import type { JobSource } from "@/modules/job-discovery/application/ports";
import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";
import { ITProJobSource } from "@/modules/job-discovery/infrastructure/itpro-job-source";
import { JSearchJobSource } from "@/modules/job-discovery/infrastructure/jsearch-job-source";
import { LinkedInGuestJobSource } from "@/modules/job-discovery/infrastructure/linkedin-guest-job-source";
import { SupabaseJobDiscoveryRepository } from "@/modules/job-discovery/infrastructure/supabase-job-discovery-repository";
import { TheirStackJobSource } from "@/modules/job-discovery/infrastructure/theirstack-job-source";
import {
  analyseAndMatchBatch,
  analyseAndMatchJob,
  type AnalyseAndMatchBatchCommand,
  type AnalyseAndMatchJobCommand,
} from "@/modules/career-intelligence/application/analyse-and-match";
import {
  assessCareerStageForUser,
  type AssessCareerStageCommand,
} from "@/modules/career-intelligence/application/assess-career-stage";
import {
  getCandidateCapabilityProfile,
  refreshCandidateCapabilityProfile,
  type RefreshCandidateCapabilityProfileCommand,
} from "@/modules/career-intelligence/application/capability-profile";
import { clearMatchAnalysesForUser } from "@/modules/career-intelligence/application/clear-matches";
import {
  getJobMatchDetails,
  listRankedJobMatches,
  type GetJobMatchDetailsCommand,
  type ListRankedJobMatchesCommand,
} from "@/modules/career-intelligence/application/list-matches";
import {
  createCareerAwareSearchPlan,
  executeCareerAwareJobSearch,
  type CreateCareerAwareSearchPlanCommand,
  type ExecuteCareerAwareJobSearchCommand,
} from "@/modules/career-intelligence/application/search-plan";
import { CareerIntelligenceError } from "@/modules/career-intelligence/domain/errors";
import { DEFAULT_ANALYSIS_BATCH_SIZE } from "@/modules/career-intelligence/domain/policy";
import { GroqCapabilitySignalExtractor } from "@/modules/career-intelligence/infrastructure/groq-capability-extractor";
import { GroqJobRequirementExtractor } from "@/modules/career-intelligence/infrastructure/groq-job-analyser";
import { GroqRequirementMatcher } from "@/modules/career-intelligence/infrastructure/groq-requirement-matcher";
import { SupabaseCareerIntelligenceRepository } from "@/modules/career-intelligence/infrastructure/supabase-career-intelligence-repository";

import { getServerConfig } from "./config";
import { createSupabaseClient } from "./supabase-client";

export type CareerEvidenceApplication = ReturnType<
  typeof createCareerEvidenceApplication
>;

let application: CareerEvidenceApplication | undefined;
let jobDiscoveryApplication: JobDiscoveryApplication | undefined;
let careerIntelligenceApplication: CareerIntelligenceApplication | undefined;

export function getCareerEvidenceApplication(): CareerEvidenceApplication {
  application ??= createCareerEvidenceApplication();
  return application;
}

export type JobDiscoveryApplication = ReturnType<
  typeof createJobDiscoveryApplication
>;

export function getJobDiscoveryApplication(): JobDiscoveryApplication {
  jobDiscoveryApplication ??= createJobDiscoveryApplication();
  return jobDiscoveryApplication;
}

export type CareerIntelligenceApplication = ReturnType<
  typeof createCareerIntelligenceApplication
>;

export function getCareerIntelligenceApplication(): CareerIntelligenceApplication {
  careerIntelligenceApplication ??= createCareerIntelligenceApplication();
  return careerIntelligenceApplication;
}

function createCareerEvidenceApplication() {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const repository = new SupabaseEvidenceRepository(supabase);
  const storage = new SupabaseCvStorage(
    supabase,
    config.SUPABASE_STORAGE_BUCKET,
  );
  const textExtractor = new PdfDocxTextExtractor();
  const evidenceExtractor = new GroqEvidenceExtractor(
    config.GROQ_API_KEY,
    config.GROQ_MODEL,
  );

  return {
    demoUserId: config.DEMO_USER_ID,
    ingest: (command: Omit<IngestCvCommand, "userId">) =>
      ingestCv(
        { ...command, userId: config.DEMO_USER_ID },
        {
          repository,
          storage,
          textExtractor,
          evidenceExtractor,
          extractionModel: config.GROQ_MODEL,
          createId: randomUUID,
        },
      ),
    saveDraft: (command: Omit<SaveDraftCommand, "userId">) =>
      saveDraft({ ...command, userId: config.DEMO_USER_ID }, repository),
    verify: (command: Omit<VerifyEvidenceCommand, "userId">) =>
      verifyEvidence(
        { ...command, userId: config.DEMO_USER_ID },
        { repository, now: () => new Date() },
      ),
    getCurrent: () => getCurrentEvidence(config.DEMO_USER_ID, repository),
  };
}

function createJobDiscoveryApplication() {
  const config = getServerConfig();
  const repository = new SupabaseJobDiscoveryRepository(
    createSupabaseClient(config),
  );
  const { source, enabledKeys } = createHybridJobSource(config);
  const now = () => new Date();

  const searchPreviewFor = (
    preferences: Parameters<typeof previewJobSearchQueries>[0],
  ) =>
    previewJobSearchQueries(preferences, {
      baseUrl: config.jsearchBaseUrl,
      maxRequests: config.JSEARCH_MAX_REQUESTS,
      pageSize: config.JSEARCH_PAGE_SIZE,
    });

  return {
    demoUserId: config.DEMO_USER_ID,
    enabledJobSources: enabledKeys,
    getProfile: async () => {
      const profile = await getJobSearchProfile(
        config.DEMO_USER_ID,
        repository,
      );
      if (!profile) return null;
      return {
        ...profile,
        searchPreview: searchPreviewFor(profile.preferences),
      };
    },
    savePreferences: async (
      command: Omit<SavePreferencesCommand, "userId">,
    ) => {
      const profile = await saveJobSearchPreferences(
        { ...command, userId: config.DEMO_USER_ID },
        { repository, createId: randomUUID, now },
      );
      return {
        ...profile,
        searchPreview: searchPreviewFor(profile.preferences),
      };
    },
    discover: (command: Omit<DiscoverJobsCommand, "userId">) => {
      if (enabledKeys.length === 0) {
        throw new JobDiscoveryError(
          "SOURCE_UNAUTHORIZED",
          "No job sources are configured. Set JOB_SOURCES and provider credentials (JSEARCH/RAPIDAPI, THEIRSTACK_API_KEY, and/or ITPro).",
        );
      }
      return discoverJobs(
        { ...command, userId: config.DEMO_USER_ID },
        {
          repository,
          source,
          now,
          maxRequests: 1,
          maxPages: config.JSEARCH_MAX_PAGES,
          pageSize: Math.max(
            config.LINKEDIN_PAGE_SIZE,
            config.JSEARCH_PAGE_SIZE,
            config.THEIRSTACK_PAGE_SIZE,
            config.ITPRO_PAGE_SIZE,
          ),
          batchTitles: true,
        },
      );
    },
    listJobs: (command: Omit<ListJobsCommand, "userId"> = {}) =>
      listDiscoveredJobs(
        { ...command, userId: config.DEMO_USER_ID },
        repository,
      ),
    setJobState: (command: Omit<SetJobStateCommand, "userId">) =>
      setUserJobState(
        { ...command, userId: config.DEMO_USER_ID },
        { repository, now },
      ),
    clearJobs: (command: { includeSaved?: boolean } = {}) =>
      clearDiscoveredJobsForUser(
        { userId: config.DEMO_USER_ID, includeSaved: command.includeSaved },
        repository,
      ),
  };
}

function createCareerIntelligenceApplication() {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const evidenceRepository = new SupabaseEvidenceRepository(supabase);
  const jobRepository = new SupabaseJobDiscoveryRepository(supabase);
  const repository = new SupabaseCareerIntelligenceRepository(supabase);
  const { source, enabledKeys } = createHybridJobSource(config);
  const extractor = new GroqJobRequirementExtractor(
    config.GROQ_API_KEY,
    config.GROQ_MODEL,
  );
  const matcher = new GroqRequirementMatcher(
    config.GROQ_API_KEY,
    config.GROQ_MODEL,
  );
  const capabilityExtractor = new GroqCapabilitySignalExtractor(
    config.GROQ_API_KEY,
    config.GROQ_MODEL,
  );
  const now = () => new Date();
  const deps = {
    evidenceRepository,
    jobRepository,
    repository,
    source,
    extractor,
    matcher,
    createId: randomUUID,
    now,
  };

  return {
    demoUserId: config.DEMO_USER_ID,
    queryBudget: config.CAREER_SEARCH_QUERY_BUDGET,
    analysisBatchSize: config.CAREER_ANALYSIS_BATCH_SIZE,
    getAssessment: () =>
      repository.getLatestCareerStageAssessment(config.DEMO_USER_ID),
    getPlan: () => repository.getLatestSearchPlan(config.DEMO_USER_ID),
    getCapabilityProfile: () =>
      getCandidateCapabilityProfile(config.DEMO_USER_ID, repository),
    refreshCapabilityProfile: (
      command: Omit<RefreshCandidateCapabilityProfileCommand, "userId"> = {},
    ) =>
      refreshCandidateCapabilityProfile(
        { ...command, userId: config.DEMO_USER_ID },
        { ...deps, extractor: capabilityExtractor },
      ),
    assess: (command: Omit<AssessCareerStageCommand, "userId"> = {}) =>
      assessCareerStageForUser(
        { ...command, userId: config.DEMO_USER_ID },
        deps,
      ),
    createPlan: (
      command: Omit<CreateCareerAwareSearchPlanCommand, "userId"> = {},
    ) =>
      createCareerAwareSearchPlan(
        {
          ...command,
          userId: config.DEMO_USER_ID,
          queryBudget:
            command.queryBudget ?? config.CAREER_SEARCH_QUERY_BUDGET,
        },
        deps,
      ),
    executeSearch: (
      command: Omit<ExecuteCareerAwareJobSearchCommand, "userId"> = {},
    ) => {
      if (enabledKeys.length === 0) {
        throw new CareerIntelligenceError(
          "SEARCH_FAILED",
          "No job sources are configured for career-aware search.",
        );
      }
      return executeCareerAwareJobSearch(
        {
          ...command,
          userId: config.DEMO_USER_ID,
          pageSize: config.JSEARCH_PAGE_SIZE,
        },
        deps,
      );
    },
    analyseAndMatch: (
      command: Omit<AnalyseAndMatchJobCommand, "userId">,
    ) =>
      analyseAndMatchJob(
        { ...command, userId: config.DEMO_USER_ID },
        deps,
      ),
    analyseBatch: (
      command: Omit<AnalyseAndMatchBatchCommand, "userId">,
    ) => {
      const listingIds = command.listingIds.slice(
        0,
        config.CAREER_ANALYSIS_BATCH_SIZE || DEFAULT_ANALYSIS_BATCH_SIZE,
      );
      return analyseAndMatchBatch(
        { ...command, userId: config.DEMO_USER_ID, listingIds },
        deps,
      );
    },
    listMatches: (
      command: Omit<ListRankedJobMatchesCommand, "userId"> = {},
    ) =>
      listRankedJobMatches(
        { ...command, userId: config.DEMO_USER_ID },
        deps,
      ),
    getMatchDetails: (
      command: Omit<GetJobMatchDetailsCommand, "userId">,
    ) =>
      getJobMatchDetails(
        { ...command, userId: config.DEMO_USER_ID },
        deps,
      ),
    clearMatches: () =>
      clearMatchAnalysesForUser(
        { userId: config.DEMO_USER_ID },
        repository,
      ),
  };
}

function createHybridJobSource(config: ReturnType<typeof getServerConfig>): {
  source: JobSource;
  enabledKeys: string[];
} {
  const sources: JobSource[] = [];
  const enabledKeys: string[] = [];

  for (const key of config.jobSources) {
    if (key === "linkedin") {
      sources.push(
        new LinkedInGuestJobSource({
          baseUrl: config.LINKEDIN_BASE_URL,
          timeoutMs: config.LINKEDIN_TIMEOUT_MS,
          maxPages: config.LINKEDIN_MAX_PAGES,
          maxQueries: config.LINKEDIN_MAX_QUERIES,
          pageSize: config.LINKEDIN_PAGE_SIZE,
          enrichDescriptions: config.LINKEDIN_ENRICH_DESCRIPTIONS,
          enrichLimit: config.LINKEDIN_ENRICH_LIMIT,
        }),
      );
      enabledKeys.push(key);
      continue;
    }
    if (key === "jsearch") {
      if (!config.jsearchApiKey) continue;
      sources.push(
        new JSearchJobSource({
          apiKey: config.jsearchApiKey,
          baseUrl: config.jsearchBaseUrl,
          timeoutMs: config.JSEARCH_TIMEOUT_MS,
        }),
      );
      enabledKeys.push(key);
      continue;
    }
    if (key === "theirstack") {
      if (!config.theirstackApiKey) continue;
      sources.push(
        new TheirStackJobSource({
          apiKey: config.theirstackApiKey,
          baseUrl: config.theirstackBaseUrl,
          timeoutMs: config.THEIRSTACK_TIMEOUT_MS,
          postedAtMaxAgeDays: config.THEIRSTACK_POSTED_AT_MAX_AGE_DAYS,
          pageSize: config.THEIRSTACK_PAGE_SIZE,
        }),
      );
      enabledKeys.push(key);
      continue;
    }
    if (key === "itpro") {
      sources.push(
        new ITProJobSource({
          baseUrl: config.ITPRO_BASE_URL,
          timeoutMs: config.ITPRO_TIMEOUT_MS,
          pageSize: config.ITPRO_PAGE_SIZE,
        }),
      );
      enabledKeys.push(key);
    }
  }

  // Preserve JOB_SOURCES order as configured — no provider is promoted.
  return {
    source: new HybridJobSource(sources),
    enabledKeys,
  };
}
