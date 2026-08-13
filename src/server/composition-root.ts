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
import { buildMatchableProfileTerms } from "@/modules/career-intelligence/application/build-profile-terms";
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
import {
  updateTailoredCvContent,
  type UpdateTailoredCvContentCommand,
} from "@/modules/cv-tailoring/application/update-tailored-content";
import { GroqCvLanguageTailorer } from "@/modules/cv-tailoring/infrastructure/groq-cv-tailorer";
import { PdfKitCvRenderer } from "@/modules/cv-tailoring/infrastructure/pdfkit-cv-renderer";
import { ReactPdfCvRenderer } from "@/modules/cv-tailoring/infrastructure/react-pdf-cv-renderer";
import { SupabaseCvTailoringRepository } from "@/modules/cv-tailoring/infrastructure/supabase-cv-tailoring-repository";
import { SupabaseTailoredCvStorage } from "@/modules/cv-tailoring/infrastructure/supabase-tailored-cv-storage";

import { getServerConfig } from "./config";
import { getGroqKeyPool } from "./groq";
import { createSupabaseClient } from "./supabase-client";
import { getCampaignDashboard } from "@/modules/career-campaign/application/dashboard";
import {
  markApplicationSubmitted,
  prepareApplicationPacket,
  updateApplicationStatus,
} from "@/modules/career-campaign/application/application-lifecycle";
import {
  deliverPendingNotifications,
  InAppNotificationSender,
} from "@/modules/career-campaign/application/notifications";
import { recordRecommendationDecision } from "@/modules/career-campaign/application/recommendation-decisions";
import { runCampaignCheck } from "@/modules/career-campaign/application/run-campaign-check";
import {
  aggregateCampaignGaps,
  growthActionCopy,
} from "@/modules/career-campaign/domain/gap-aggregation";
import { applyFeedbackAdjustments } from "@/modules/career-campaign/domain/feedback-adjustment";
import { GroqCoverLetterGenerator } from "@/modules/career-campaign/infrastructure/groq-cover-letter-generator";
import { SupabaseCareerCampaignRepository } from "@/modules/career-campaign/infrastructure/supabase-career-campaign-repository";
import { SupabaseFreshWatchRepository } from "@/modules/career-campaign/infrastructure/supabase-fresh-watch-repository";
import { WhatsAppCloudNotificationSender } from "@/modules/career-campaign/infrastructure/whatsapp-cloud-sender";
import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import {
  enableFreshJobWatch,
  getFreshJobWatchStatus,
  pauseFreshJobWatch,
} from "@/modules/career-campaign/application/manage-fresh-job-watch";
import { processScheduledDiscoveryTick } from "@/modules/career-campaign/application/process-scheduled-discovery-tick";
import type { FreshWatchCaps } from "@/modules/career-campaign/application/fresh-watch-ports";

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
    listJobs: async (command: Omit<ListJobsCommand, "userId"> = {}) => {
      const evidenceRepository = new SupabaseEvidenceRepository(
        createSupabaseClient(config),
      );
      const parsed = {
        userId,
        includeDismissed: command.includeDismissed ?? false,
        limit: command.limit ?? 50,
        offset: command.offset ?? 0,
      };
      const [jobs, profile, evidence] = await Promise.all([
        repository.listJobs(parsed),
        repository.getSearchProfile(userId),
        evidenceRepository.getCurrent(userId).catch(() => null),
      ]);
      // Skip live ESCO expansion on list — it was adding multi-second sequential
      // network calls to every /api/jobs request. Ranking still uses local terms.
      const profileTerms = await buildMatchableProfileTerms({
        preferences: profile?.preferences ?? {
          roles: [],
          locations: [],
          work_modes: [],
          employment_types: [],
          experience_levels: [],
          excluded_keywords: [],
          preferred_interests: [],
          excluded_interests: [],
        },
        evidence: evidence?.status === "verified" ? evidence.evidence : null,
        escoResolver: null,
      });
      return listDiscoveredJobs({ ...command, userId }, repository, {
        profileTerms,
        profile,
        jobs,
      });
    },
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
        // Listing matches must stay fast — live ESCO expansion belongs to
        // plan/search flows, not every Jobs page render.
        { ...deps, escoResolver: undefined },
      ),
    getMatchDetails: (
      command: Omit<GetJobMatchDetailsCommand, "userId">,
    ) =>
      getJobMatchDetails(
        { ...command, userId },
        { ...deps, escoResolver: undefined },
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
    updateContent: (
      command: Omit<UpdateTailoredCvContentCommand, "userId">,
    ) =>
      updateTailoredCvContent(
        { ...command, userId },
        { repository, now },
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

export type CareerCampaignApplication = ReturnType<
  typeof createCareerCampaignApplication
>;

export function getCareerCampaignApplication(
  userId: string,
): CareerCampaignApplication {
  return createCareerCampaignApplication(userId);
}

function createCareerCampaignApplication(userId: string) {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const repository = new SupabaseCareerCampaignRepository(supabase);
  const jobRepository = new SupabaseJobDiscoveryRepository(supabase);
  const evidenceRepository = new SupabaseEvidenceRepository(supabase);
  const coverLetterGenerator = new GroqCoverLetterGenerator(
    getGroqKeyPool(),
    config.GROQ_MODEL,
    config.groqFallbackModels,
  );
  const now = () => new Date();
  const careerApp = createCareerIntelligenceApplication(userId);
  const cvApp = createCvTailoringApplication(userId);

  return {
    userId,
    runCheck: async (input: {
      trigger: "manual" | "cron";
      idempotencyKey: string;
    }) =>
      runCampaignCheck(
        {
          userId,
          trigger: input.trigger,
          idempotencyKey: input.idempotencyKey,
        },
        {
          repository,
          createId: randomUUID,
          now,
          caps: {
            analysisBatchSize: Math.min(
              config.CAMPAIGN_ANALYSIS_BATCH_SIZE,
              config.CAREER_ANALYSIS_BATCH_SIZE,
            ),
            maxRecommendations: config.CAMPAIGN_MAX_RECOMMENDATIONS_PER_RUN,
            minScore: config.CAMPAIGN_RECOMMENDATION_MIN_SCORE,
          },
          whatsappOptedIn: async (uid) => {
            if (!config.WHATSAPP_ENABLED) return false;
            const link = await repository.getWhatsAppLink(uid);
            return Boolean(link?.optedInAt && !link.optedOutAt);
          },
          executeSearch: async (uid) => {
            const search = await careerApp.searchForJobs({});
            const jobs = await jobRepository.listJobs({
              userId: uid,
              includeDismissed: false,
              limit: 100,
              offset: 0,
            });
            const profile = await jobRepository.getSearchProfile(uid);
            const signals = await repository.listFeedbackSignals(uid);
            const rankable = jobs.map((job) => ({
              listingId: job.listing_id,
              finalScore: 50,
              workMode: job.work_mode,
              location: job.location,
              title: job.title,
              organizationName: job.organization_name,
            }));
            const adjusted = applyFeedbackAdjustments(rankable, signals);
            const orderedIds = adjusted.map((item) => item.listingId);
            const fallbackIds = jobs.map((job) => job.listing_id);
            return {
              jobsFound: search.jobsFound,
              listingIds: orderedIds.length ? orderedIds : fallbackIds,
              searchProfileId: profile?.id ?? null,
              partialFailure: search.partialFailure,
              warnings: search.warnings,
            };
          },
          analyseListings: async (uid, listingIds) => {
            if (listingIds.length === 0) return [];
            const batch = await careerApp.analyseBatch({ listingIds });
            const jobs = await jobRepository.listJobs({
              userId: uid,
              includeDismissed: true,
              limit: 200,
              offset: 0,
            });
            const byListing = new Map(
              jobs.map((job) => [job.listing_id, job]),
            );
            return batch.map((item) => {
              const job = byListing.get(item.listingId);
              const match = item.match;
              if (!match) {
                return {
                  listingId: item.listingId,
                  ok: false,
                  error: item.error ?? "Analysis failed",
                };
              }
              const reqById = new Map(
                (item.analysis?.requirements ?? []).map((req) => [
                  req.id,
                  req.statement,
                ]),
              );
              const topMatched = match.matches
                .filter((row) => row.status === "matched")
                .map((row) => reqById.get(row.requirement_id) ?? row.reason)
                .slice(0, 5);
              const primaryGaps = match.matches
                .filter((row) => row.status === "gap")
                .map((row) => reqById.get(row.requirement_id) ?? row.reason)
                .slice(0, 5);
              return {
                listingId: item.listingId,
                ok: true,
                matchAnalysisId: match.id,
                evidenceFitScore: match.evidenceFitScore,
                careerLevel: match.careerLevel,
                hardConstraintEligible: match.hardConstraintEligible,
                analysisConfidence: match.analysisConfidence,
                scoringPolicyVersion: match.scoringPolicyVersion,
                matchingPolicyVersion: match.matchingPolicyVersion,
                explanation: match.explanation,
                topMatched,
                primaryGaps,
                rankingReasons: [],
                title: job?.title,
                organizationName: job?.organization_name ?? null,
                applicationUrl: job?.application_url ?? null,
                location: job?.location ?? null,
                workMode: job?.work_mode ?? null,
              };
            });
          },
        },
      ),
    listRecommendations: (input?: {
      statuses?: Array<
        "pending_review" | "saved" | "accepted" | "rejected" | "expired"
      >;
      limit?: number;
    }) =>
      repository.listRecommendations({
        userId,
        statuses: input?.statuses,
        limit: input?.limit,
      }),
    recordDecision: (
      input: Omit<
        Parameters<typeof recordRecommendationDecision>[0],
        "userId"
      >,
    ) =>
      recordRecommendationDecision(
        { ...input, userId },
        { repository, createId: randomUUID, now },
      ),
    getPacket: (packetId: string) => repository.getPacket(userId, packetId),
    preparePacket: async (packetId: string) =>
      prepareApplicationPacket(
        { userId, packetId },
        {
          repository,
          coverLetterGenerator,
          now,
          createTailoredCv: async ({ listingId }) => {
            const variant = await cvApp.generateContent({ listingId });
            return { id: variant.id };
          },
          loadPacketContext: async ({ listingId, recommendationId }) => {
            const evidence = await evidenceRepository.getCurrent(userId);
            if (!evidence || evidence.status !== "verified") {
              throw new CareerCampaignError(
                "EVIDENCE_REQUIRED",
                "Verify your career profile before preparing an application packet.",
              );
            }
            const details = await careerApp.getMatchDetails({ listingId });
            const recommendation = await repository.getRecommendation(
              userId,
              recommendationId,
            );
            return {
              evidenceSetId: evidence.id,
              evidenceVersion: evidence.evidence.schema_version,
              evidenceJson: evidence.evidence,
              jobTitle: details.card.title,
              organizationName: details.card.organizationName,
              jobDescription:
                details.analysis.requirements
                  .map((req) => req.statement)
                  .join("\n") || details.card.explanation,
              matchedRequirements: details.card.topMatched,
              missingRequirements: details.card.primaryGaps,
              applicationUrl:
                details.card.applicationUrl ??
                recommendation?.fitSummarySnapshot.applicationUrl ??
                null,
              jobMatchAnalysisId: details.match.id,
            };
          },
        },
      ),
    listApplications: (input?: {
      statuses?: Array<
        "ready" | "applied" | "interview" | "rejected" | "offer" | "withdrawn"
      >;
      limit?: number;
    }) =>
      repository.listApplications({
        userId,
        statuses: input?.statuses,
        limit: input?.limit,
      }),
    getApplication: (applicationId: string) =>
      repository.getApplication(userId, applicationId),
    listApplicationEvents: (applicationId: string) =>
      repository.listApplicationEvents(userId, applicationId),
    markApplied: (
      input: Omit<
        Parameters<typeof markApplicationSubmitted>[0],
        "userId"
      >,
    ) =>
      markApplicationSubmitted(
        { ...input, userId },
        {
          repository,
          createId: randomUUID,
          now,
          followUpDays: config.CAMPAIGN_FOLLOW_UP_DAYS,
        },
      ),
    updateStatus: (
      input: Omit<Parameters<typeof updateApplicationStatus>[0], "userId">,
    ) =>
      updateApplicationStatus(
        { ...input, userId },
        { repository, createId: randomUUID, now },
      ),
    findDueFollowUps: () =>
      repository.findDueFollowUps({
        userId,
        asOf: now().toISOString(),
        limit: 50,
      }),
    listNotifications: (limit?: number) =>
      repository.listNotifications({ userId, limit }),
    deliverNotifications: () =>
      deliverPendingNotifications({
        repository,
        now,
        senders: {
          in_app: new InAppNotificationSender(),
          ...(config.WHATSAPP_ENABLED &&
          config.WHATSAPP_ACCESS_TOKEN &&
          config.WHATSAPP_PHONE_NUMBER_ID
            ? {
                whatsapp: new WhatsAppCloudNotificationSender({
                  accessToken: config.WHATSAPP_ACCESS_TOKEN,
                  phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
                  templateName:
                    config.WHATSAPP_TEMPLATE_RECOMMENDATION ??
                    "zeno_recommendation",
                  templateLanguage: config.WHATSAPP_TEMPLATE_LANGUAGE,
                  publicBaseUrl: config.PUBLIC_APP_BASE_URL,
                }),
              }
            : {}),
        },
      }),
    getDashboard: () =>
      getCampaignDashboard(userId, {
        repository,
        now,
        countDiscoveredJobs: async (uid) => {
          const jobs = await jobRepository.listJobs({
            userId: uid,
            includeDismissed: false,
            limit: 100,
            offset: 0,
          });
          return jobs.length;
        },
      }),
    aggregateGaps: async () => {
      const recs = await repository.listRecommendations({
        userId,
        statuses: ["pending_review", "saved", "accepted"],
        limit: 50,
      });
      const evidence = await evidenceRepository.getCurrent(userId);
      const supported = new Set(
        (evidence?.evidence.skills ?? []).map((skill) =>
          skill.name.trim().toLocaleLowerCase(),
        ),
      );
      const gaps = aggregateCampaignGaps({
        observations: recs.map((rec) => ({
          listingId: rec.listingId,
          gaps: rec.fitSummarySnapshot.primaryGaps,
          evidenceFitScore: rec.scoreSnapshot.evidenceFitScore,
        })),
        supportedSkillKeys: supported,
        minScore: config.CAMPAIGN_RECOMMENDATION_MIN_SCORE,
        maxActions: 2,
      });
      const actions = [];
      for (const gap of gaps) {
        const copy = growthActionCopy(gap);
        actions.push(
          await repository.upsertGrowthAction({
            id: randomUUID(),
            userId,
            gapKey: gap.gapKey,
            gapLabel: gap.gapLabel,
            frequency: gap.frequency,
            affectedListingIds: gap.affectedListingIds,
            ...copy,
            status: "active",
            createdAt: now().toISOString(),
          }),
        );
      }
      return actions;
    },
    listGrowthActions: () => repository.listGrowthActions(userId),
    listRecentRuns: (limit = 5) => repository.listRecentRuns(userId, limit),
    getFreshJobWatch: () =>
      getFreshJobWatchStatus(userId, {
        repository: new SupabaseFreshWatchRepository(supabase),
      }),
    enableFreshJobWatch: (input: {
      primaryRole: string;
      location: string;
      workMode?: "onsite" | "hybrid" | "remote" | "any";
      minScore?: number;
    }) =>
      enableFreshJobWatch(
        { userId, ...input },
        {
          repository: new SupabaseFreshWatchRepository(supabase),
          createId: randomUUID,
          now,
          caps: freshWatchCapsFromConfig(config),
        },
      ),
    pauseFreshJobWatch: () =>
      pauseFreshJobWatch(
        { userId },
        {
          repository: new SupabaseFreshWatchRepository(supabase),
          now,
        },
      ),
    repository,
  };
}

function freshWatchCapsFromConfig(
  config: ReturnType<typeof getServerConfig>,
): FreshWatchCaps {
  return {
    linkedInIntervalMs: config.FRESH_LINKEDIN_INTERVAL_MINUTES * 60_000,
    linkedInRecencySeconds: config.FRESH_LINKEDIN_RECENCY_SECONDS,
    broadIntervalMs: config.FRESH_BROAD_INTERVAL_HOURS * 60 * 60_000,
    maxCanonicalSearchesPerTick: config.FRESH_MAX_CANONICAL_SEARCHES_PER_TICK,
    linkedInMaxPages: config.FRESH_LINKEDIN_MAX_PAGES,
    linkedInMaxResults: config.FRESH_LINKEDIN_MAX_RESULTS,
    maxDescriptionFetchesPerTick: config.FRESH_MAX_DESCRIPTION_FETCHES_PER_TICK,
    maxGroqAnalysesPerTick: config.FRESH_MAX_GROQ_ANALYSES_PER_TICK,
    maxAnalysesPerUser: config.FRESH_MAX_ANALYSES_PER_USER,
    providerCooldownMs: config.FRESH_PROVIDER_COOLDOWN_MINUTES * 60_000,
    schedulerLeaseMs: config.FRESH_SCHEDULER_LEASE_SECONDS * 1000,
    initialAlertCap: config.FRESH_INITIAL_ALERT_CAP,
    minScore: config.CAMPAIGN_RECOMMENDATION_MIN_SCORE,
  };
}

/** Cron-only helper: enumerate users and run checks with shared repository. */
export function getCareerCampaignCronServices() {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const repository = new SupabaseCareerCampaignRepository(supabase);
  const freshRepository = new SupabaseFreshWatchRepository(supabase);
  return { config, repository, freshRepository };
}

export async function runScheduledDiscoveryTick() {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const campaignRepository = new SupabaseCareerCampaignRepository(supabase);
  const freshRepository = new SupabaseFreshWatchRepository(supabase);
  const linkedInEnabled =
    config.LINKEDIN_FRESH_ENABLED !== false &&
    config.jobSources.includes("linkedin");
  const linkedIn = new LinkedInGuestJobSource({
    baseUrl: config.LINKEDIN_BASE_URL,
    timeoutMs: config.LINKEDIN_TIMEOUT_MS,
    maxPages: config.FRESH_LINKEDIN_MAX_PAGES,
    pageSize: config.FRESH_LINKEDIN_MAX_RESULTS,
    enrichDescriptions: false,
  });

  return processScheduledDiscoveryTick({
    repository: freshRepository,
    campaignRepository,
    createId: randomUUID,
    now: () => new Date(),
    caps: freshWatchCapsFromConfig(config),
    linkedInEnabled,
    linkedIn: {
      searchFreshCards: (input) => linkedIn.searchFreshCards(input),
      fetchJobDescription: (id) => linkedIn.fetchJobDescription(id),
    },
    analyseListing: async ({ userId, listingId }) => {
      const careerApp = createCareerIntelligenceApplication(userId);
      const [item] = await careerApp.analyseBatch({ listingIds: [listingId] });
      if (!item?.match) {
        return {
          listingId,
          ok: false,
          extractionCacheHit: item?.cacheHit,
          llmCalls: item?.cacheHit ? 0 : 1,
          error: item?.error,
        };
      }
      return {
        listingId,
        ok: true,
        matchAnalysisId: item.match.id,
        evidenceFitScore: item.match.evidenceFitScore,
        careerLevel: item.match.careerLevel,
        hardConstraintEligible: item.match.hardConstraintEligible,
        analysisConfidence: item.match.analysisConfidence,
        scoringPolicyVersion: item.match.scoringPolicyVersion,
        matchingPolicyVersion: item.match.matchingPolicyVersion,
        explanation: item.match.explanation,
        extractionCacheHit: item.cacheHit,
        llmCalls: item.cacheHit ? 0 : 1,
      };
    },
    runBroadCampaign: async ({ userId, runId }) => {
      const day = new Date().toISOString().slice(0, 10);
      const result = await getCareerCampaignApplication(userId).runCheck({
        trigger: "cron",
        idempotencyKey: `broad_watch:${day}:${userId}:${runId.slice(0, 8)}`,
      });
      return {
        recommended: result.run.recommendedCount,
        status: result.run.status,
      };
    },
    deliverNotifications: async () => {
      const result = await deliverPendingNotifications(
        {
          repository: campaignRepository,
          senders: { in_app: new InAppNotificationSender() },
          now: () => new Date(),
        },
      );
      return result.delivered;
    },
  });
}
