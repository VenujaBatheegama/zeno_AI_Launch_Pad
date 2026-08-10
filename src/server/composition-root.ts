import "server-only";

import { randomUUID } from "node:crypto";

import { getCurrentEvidence } from "@/modules/career-evidence/application/get-current-evidence";
import { ensureConversationDraft } from "@/modules/career-evidence/application/ensure-conversation-draft";
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
import { GroqOnboardingConversationalist } from "@/modules/onboarding/infrastructure/groq-onboarding-conversationalist";
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
import { clearMatchAnalysesForUser } from "@/modules/career-intelligence/application/clear-matches";
import {
  getJobMatchDetails,
  listRankedJobMatches,
  type GetJobMatchDetailsCommand,
  type ListRankedJobMatchesCommand,
} from "@/modules/career-intelligence/application/list-matches";
import {
  createCareerAwareSearchPlan,
  ensureJobSearchPlan,
  executeCareerAwareJobSearch,
  searchForJobs,
  type CreateCareerAwareSearchPlanCommand,
  type ExecuteCareerAwareJobSearchCommand,
  type SearchForJobsCommand,
} from "@/modules/career-intelligence/application/search-plan";
import { expandSearchTitles } from "@/modules/career-intelligence/application/expand-search-titles";
import { CareerIntelligenceError } from "@/modules/career-intelligence/domain/errors";
import { DEFAULT_ANALYSIS_BATCH_SIZE } from "@/modules/career-intelligence/domain/policy";
import { EscoOccupationService } from "@/modules/career-intelligence/infrastructure/esco-occupation-service";
import { GroqJobRequirementExtractor } from "@/modules/career-intelligence/infrastructure/groq-job-analyser";
import { GroqRequirementMatcher } from "@/modules/career-intelligence/infrastructure/groq-requirement-matcher";
import { SupabaseCareerIntelligenceRepository } from "@/modules/career-intelligence/infrastructure/supabase-career-intelligence-repository";
import {
  createTailoredCvContent,
  downloadCvVariant,
  getCvVariant,
  listCvVariantsForListing,
  listCvVariantsForUser,
  recommendModeForListing,
  renderTailoredCvVariant,
  type CreateAndGenerateCvCommand,
} from "@/modules/cv-tailoring/application/tailor-cv";
import { GroqCvLanguageTailorer } from "@/modules/cv-tailoring/infrastructure/groq-cv-tailorer";
import { PdfKitCvRenderer } from "@/modules/cv-tailoring/infrastructure/pdfkit-cv-renderer";
import { ReactPdfCvRenderer } from "@/modules/cv-tailoring/infrastructure/react-pdf-cv-renderer";
import { SupabaseCvTailoringRepository } from "@/modules/cv-tailoring/infrastructure/supabase-cv-tailoring-repository";
import { SupabaseTailoredCvStorage } from "@/modules/cv-tailoring/infrastructure/supabase-tailored-cv-storage";

import { getServerConfig } from "./config";
import { getGroqKeyPool } from "./groq";
import { createSupabaseClient } from "./supabase-client";

async function refreshPlanAfterPreferencesChange(userId: string): Promise<void> {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const jobRepository = new SupabaseJobDiscoveryRepository(supabase);
  const repository = new SupabaseCareerIntelligenceRepository(supabase);
  const profile = await jobRepository.getSearchProfile(userId);
  if (!profile || profile.preferences.roles.length === 0) return;
  await ensureJobSearchPlan(
    {
      userId,
      force: true,
      queryBudget: config.CAREER_SEARCH_QUERY_BUDGET,
    },
    {
      jobRepository,
      repository,
      evidenceRepository: new SupabaseEvidenceRepository(supabase),
      escoResolver: createEscoResolver(config, repository),
      createId: randomUUID,
      now: () => new Date(),
    },
  );
}

function createEscoResolver(
  config: ReturnType<typeof getServerConfig>,
  cache: SupabaseCareerIntelligenceRepository,
) {
  return new EscoOccupationService({
    baseUrl: config.ESCO_API_BASE_URL,
    language: config.ESCO_LANGUAGE,
    timeoutMs: config.ESCO_TIMEOUT_MS,
    maxAlternatives: config.ESCO_MAX_ALTERNATIVE_TITLES,
    cache,
  });
}

export type CareerEvidenceApplication = ReturnType<
  typeof createCareerEvidenceApplication
>;

export function getCareerEvidenceApplication(
  userId: string,
): CareerEvidenceApplication {
  return createCareerEvidenceApplication(userId);
}

export function getOnboardingConversationalist() {
  const config = getServerConfig();
  return new GroqOnboardingConversationalist(
    getGroqKeyPool(),
    config.GROQ_MODEL,
    config.groqFallbackModels,
  );
}

export type JobDiscoveryApplication = ReturnType<
  typeof createJobDiscoveryApplication
>;

export type CvTailoringApplication = ReturnType<
  typeof createCvTailoringApplication
>;

export function getCvTailoringApplication(
  userId: string,
): CvTailoringApplication {
  return createCvTailoringApplication(userId);
}

export function getJobDiscoveryApplication(
  userId: string,
): JobDiscoveryApplication {
  return createJobDiscoveryApplication(userId);
}

export type CareerIntelligenceApplication = ReturnType<
  typeof createCareerIntelligenceApplication
>;

export function getCareerIntelligenceApplication(
  userId: string,
): CareerIntelligenceApplication {
  return createCareerIntelligenceApplication(userId);
}

function createCareerEvidenceApplication(userId: string) {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const repository = new SupabaseEvidenceRepository(supabase);
  const storage = new SupabaseCvStorage(
    supabase,
    config.SUPABASE_STORAGE_BUCKET,
  );
  const textExtractor = new PdfDocxTextExtractor();
  const groqKeys = getGroqKeyPool();
  const evidenceExtractor = new GroqEvidenceExtractor(
    groqKeys,
    config.GROQ_MODEL,
    config.groqFallbackModels,
  );

  return {
    userId,
    ingest: (command: Omit<IngestCvCommand, "userId">) =>
      ingestCv(
        { ...command, userId },
        {
          repository,
          storage,
          textExtractor,
          evidenceExtractor,
          extractionModel: config.GROQ_MODEL,
          createId: randomUUID,
        },
      ),
    saveDraft: async (command: Omit<SaveDraftCommand, "userId">) => {
      return saveDraft({ ...command, userId }, repository);
    },
    verify: async (command: Omit<VerifyEvidenceCommand, "userId">) => {
      return verifyEvidence(
        { ...command, userId },
        { repository, now: () => new Date() },
      );
    },
    getCurrent: () => getCurrentEvidence(userId, repository),
    ensureConversationDraft: (evidence: Parameters<
      typeof ensureConversationDraft
    >[0]["evidence"]) =>
      ensureConversationDraft({
        userId,
        evidence,
        createId: randomUUID,
        repository,
        extractionModel: "conversation",
      }),
  };
}

function createJobDiscoveryApplication(userId: string) {
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
    userId,
    enabledJobSources: enabledKeys,
    getProfile: async () => {
      const profile = await getJobSearchProfile(
        userId,
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
        { ...command, userId },
        {
          repository,
          createId: randomUUID,
          now,
          onPreferencesChanged: async () => {
            await refreshPlanAfterPreferencesChange(userId);
          },
        },
      );
      return {
        ...profile,
        searchPreview: searchPreviewFor(profile.preferences),
      };
    },
    discover: async (command: Omit<DiscoverJobsCommand, "userId">) => {
      if (enabledKeys.length === 0) {
        throw new JobDiscoveryError(
          "SOURCE_UNAUTHORIZED",
          "No job sources are configured. Set JOB_SOURCES and provider credentials (JSEARCH/RAPIDAPI, THEIRSTACK_API_KEY, and/or ITPro).",
        );
      }
      const profile = await repository.getSearchProfile(userId);
      const careerRepo = new SupabaseCareerIntelligenceRepository(
        createSupabaseClient(config),
      );
      const escoResolver = createEscoResolver(config, careerRepo);
      let roleTitles = profile?.preferences.roles ?? [];
      if (profile && profile.preferences.roles.length > 0) {
        const expanded = await expandSearchTitles({
          roles: profile.preferences.roles,
          budget: Math.min(5, Math.max(config.CAREER_SEARCH_QUERY_BUDGET, 3)),
          resolver: escoResolver,
        });
        roleTitles = expanded.titles.map((item) => item.title);
      }
      return discoverJobs(
        { ...command, userId },
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
          roleTitles,
        },
      );
    },
    listJobs: (command: Omit<ListJobsCommand, "userId"> = {}) =>
      listDiscoveredJobs(
        { ...command, userId },
        repository,
      ),
    setJobState: (command: Omit<SetJobStateCommand, "userId">) =>
      setUserJobState(
        { ...command, userId },
        { repository, now },
      ),
    clearJobs: (command: { includeSaved?: boolean } = {}) =>
      clearDiscoveredJobsForUser(
        { userId, includeSaved: command.includeSaved },
        repository,
      ),
  };
}

function createCareerIntelligenceApplication(userId: string) {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const evidenceRepository = new SupabaseEvidenceRepository(supabase);
  const jobRepository = new SupabaseJobDiscoveryRepository(supabase);
  const repository = new SupabaseCareerIntelligenceRepository(supabase);
  const { source, enabledKeys } = createHybridJobSource(config);
  const groqKeys = getGroqKeyPool();
  const extractor = new GroqJobRequirementExtractor(
    groqKeys,
    config.GROQ_MODEL,
    config.groqFallbackModels,
    { maxAttempts: config.CAREER_EXTRACTION_MAX_ATTEMPTS },
  );
  const matcher = new GroqRequirementMatcher(
    groqKeys,
    config.GROQ_MODEL,
    config.groqFallbackModels,
  );
  const escoResolver = createEscoResolver(config, repository);
  const now = () => new Date();
  const deps = {
    evidenceRepository,
    jobRepository,
    repository,
    source,
    extractor,
    matcher,
    escoResolver,
    createId: randomUUID,
    now,
  };

  return {
    userId,
    queryBudget: config.CAREER_SEARCH_QUERY_BUDGET,
    analysisBatchSize: config.CAREER_ANALYSIS_BATCH_SIZE,
    getAssessment: () =>
      repository.getLatestCareerStageAssessment(userId),
    getPlan: () => repository.getLatestSearchPlan(userId),
    assess: (command: Omit<AssessCareerStageCommand, "userId"> = {}) =>
      assessCareerStageForUser(
        { ...command, userId },
        deps,
      ),
    createPlan: (
      command: Omit<CreateCareerAwareSearchPlanCommand, "userId"> = {},
    ) =>
      createCareerAwareSearchPlan(
        {
          ...command,
          userId,
          queryBudget:
            command.queryBudget ?? config.CAREER_SEARCH_QUERY_BUDGET,
        },
        deps,
      ),
    ensurePlan: (
      command: Omit<CreateCareerAwareSearchPlanCommand, "userId"> = {},
    ) =>
      ensureJobSearchPlan(
        {
          ...command,
          userId,
          queryBudget:
            command.queryBudget ?? config.CAREER_SEARCH_QUERY_BUDGET,
        },
        deps,
      ),
    searchForJobs: (
      command: Omit<SearchForJobsCommand, "userId"> = {},
    ) => {
      if (enabledKeys.length === 0) {
        throw new CareerIntelligenceError(
          "SEARCH_FAILED",
          "No job sources are configured. Check JOB_SOURCES and provider credentials.",
        );
      }
      return searchForJobs(
        {
          ...command,
          userId,
          pageSize: config.JSEARCH_PAGE_SIZE,
          queryBudget: config.CAREER_SEARCH_QUERY_BUDGET,
        },
        deps,
      );
    },
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
          userId,
          pageSize: config.JSEARCH_PAGE_SIZE,
        },
        deps,
      );
    },
    analyseAndMatch: (
      command: Omit<AnalyseAndMatchJobCommand, "userId">,
    ) =>
      analyseAndMatchJob(
        { ...command, userId },
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
        { ...command, userId, listingIds },
        {
          ...deps,
          extractionConcurrency: config.CAREER_EXTRACTION_CONCURRENCY,
        },
      );
    },
    listMatches: (
      command: Omit<ListRankedJobMatchesCommand, "userId"> = {},
    ) =>
      listRankedJobMatches(
        { ...command, userId },
        deps,
      ),
    getMatchDetails: (
      command: Omit<GetJobMatchDetailsCommand, "userId">,
    ) =>
      getJobMatchDetails(
        { ...command, userId },
        deps,
      ),
    clearMatches: () =>
      clearMatchAnalysesForUser(
        { userId },
        repository,
      ),
  };
}

function createCvTailoringApplication(userId: string) {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const evidenceRepository = new SupabaseEvidenceRepository(supabase);
  const jobRepository = new SupabaseJobDiscoveryRepository(supabase);
  const careerRepository = new SupabaseCareerIntelligenceRepository(supabase);
  const repository = new SupabaseCvTailoringRepository(supabase);
  const storage = new SupabaseTailoredCvStorage(
    supabase,
    config.SUPABASE_STORAGE_BUCKET,
  );
  const tailorer = new GroqCvLanguageTailorer(
    getGroqKeyPool(),
    config.GROQ_MODEL,
  );
  // Production path: React-pdf. PDFKit remains imported for emergency rollback only.
  const renderer =
    process.env.CV_PDF_RENDERER === "pdfkit"
      ? new PdfKitCvRenderer()
      : new ReactPdfCvRenderer();
  const now = () => new Date();
  const deps = {
    evidenceRepository,
    jobRepository,
    careerRepository,
    repository,
    tailorer,
    renderer,
    storage,
    createId: randomUUID,
    now,
  };

  return {
    userId,
    recommend: (command: { listingId: string }) =>
      recommendModeForListing(
        { ...command, userId },
        deps,
      ),
    generateContent: (
      command: Omit<CreateAndGenerateCvCommand, "userId">,
    ) =>
      createTailoredCvContent(
        { ...command, userId },
        deps,
      ),
    render: (command: { variantId: string }) =>
      renderTailoredCvVariant(
        { userId, variantId: command.variantId },
        { ...deps, jobRepository },
      ),
    getVariant: (command: { variantId: string }) =>
      getCvVariant(
        { userId, variantId: command.variantId },
        deps,
      ),
    listForListing: (command: { listingId: string }) =>
      listCvVariantsForListing(
        { userId, listingId: command.listingId },
        deps,
      ),
    listForUser: (command?: {
      statuses?: Array<
        | "ready"
        | "ready_to_render"
        | "failed"
        | "planning"
        | "generating"
        | "validating"
        | "rendering"
      >;
      limit?: number;
    }) =>
      listCvVariantsForUser(
        {
          userId,
          statuses: command?.statuses,
          limit: command?.limit,
        },
        deps,
      ),
    download: (command: { variantId: string }) =>
      downloadCvVariant(
        { userId, variantId: command.variantId },
        deps,
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
