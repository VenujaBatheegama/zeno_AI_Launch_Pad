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
  isJobSearchMessage,
  executeNaturalLanguageJobSearch,
} from "@/modules/job-discovery/application/natural-language-job-search";
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
import { renderCoverLetterPdf } from "@/modules/career-campaign/infrastructure/react-pdf-cover-letter-renderer";
import { SupabaseCvTailoringRepository } from "@/modules/cv-tailoring/infrastructure/supabase-cv-tailoring-repository";
import { SupabaseTailoredCvStorage } from "@/modules/cv-tailoring/infrastructure/supabase-tailored-cv-storage";
import { buildEvidenceSnapshot } from "@/modules/cv-tailoring/domain/facts";
import {
  buildContentPlan,
  sanitizeJobTitleForCv,
} from "@/modules/cv-tailoring/domain/content-plan";
import { buildDeterministicResume } from "@/modules/cv-tailoring/domain/deterministic-resume";
import { recoverEvidenceFromCvText } from "@/modules/cv-tailoring/domain/recover-evidence-from-cv-text";
import type { CvMode } from "@/modules/cv-tailoring/domain/schemas";

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
  createWhatsAppConnectionCode,
  disconnectWhatsApp,
  getWhatsAppConnection,
} from "@/modules/career-campaign/application/whatsapp-connection";
import {
  createTelegramConnectionCode,
  disconnectTelegram,
  getTelegramConnection,
} from "@/modules/career-campaign/application/telegram-connection";
import {
  aggregateCampaignGaps,
  growthActionCopy,
} from "@/modules/career-campaign/domain/gap-aggregation";
import { applyFeedbackAdjustments } from "@/modules/career-campaign/domain/feedback-adjustment";
import { GroqCoverLetterGenerator } from "@/modules/career-campaign/infrastructure/groq-cover-letter-generator";
import { SupabaseCareerCampaignRepository } from "@/modules/career-campaign/infrastructure/supabase-career-campaign-repository";
import { SupabaseFreshWatchRepository } from "@/modules/career-campaign/infrastructure/supabase-fresh-watch-repository";
import { TelegramBotNotificationSender } from "@/modules/career-campaign/infrastructure/telegram-bot-sender";
import { TwilioWhatsAppSender } from "@/modules/career-campaign/infrastructure/twilio-whatsapp-sender";
import { WhatsAppCloudNotificationSender } from "@/modules/career-campaign/infrastructure/whatsapp-cloud-sender";
import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import type { JobSearchCampaign } from "@/modules/career-campaign/domain/job-campaign";
import {
  enableFreshJobWatch,
  getFreshJobWatchStatus,
  pauseFreshJobWatch,
} from "@/modules/career-campaign/application/manage-fresh-job-watch";
import {
  archiveJobCampaign,
  createJobCampaign,
  getJobCampaignForUser,
  getJobsWorkspaceOverview,
  listJobCampaigns,
  pauseJobCampaign,
  resumeJobCampaign,
  updateJobCampaign,
} from "@/modules/career-campaign/application/manage-job-campaigns";
import { runJobCampaignNow } from "@/modules/career-campaign/application/run-job-campaign";
import { processScheduledDiscoveryTick } from "@/modules/career-campaign/application/process-scheduled-discovery-tick";
import { processLinkedInFreshSearch } from "@/modules/career-campaign/application/process-linkedin-fresh-search";
import type { FreshWatchCaps } from "@/modules/career-campaign/application/fresh-watch-ports";
import { askCareerFriend } from "@/modules/career-friend/application/conversation";
import {
  setSprintMilestone,
  startCareerSprint,
  submitCareerSprintEvidence,
} from "@/modules/career-friend/application/sprints";
import type { CareerSnapshot } from "@/modules/career-friend/domain/schemas";
import { GroqCareerAdvisor } from "@/modules/career-friend/infrastructure/groq-career-advisor";
import { SupabaseCareerFriendRepository } from "@/modules/career-friend/infrastructure/supabase-career-friend-repository";
import {
  getCareerGrowthApplication,
  processDueGrowthAssessments,
  requestGrowthAssessmentSafely,
} from "./career-growth-application";

export { getCareerGrowthApplication, processDueGrowthAssessments };

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
    repository,
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
        {
          ...deps,
          recordInstantSession: async (input) => {
            if (command.origin === "campaign") return;
            const freshRepository = new SupabaseFreshWatchRepository(supabase);
            await freshRepository.archiveInstantSearchSessions(input.userId);
            await freshRepository.createInstantSearchSession({
              id: randomUUID(),
              userId: input.userId,
              status: "active",
              jobsFound: input.jobsFound,
              analysedCount: 0,
              listingIds: input.listingIds,
              startedAt: input.startedAt,
              completedAt: new Date().toISOString(),
            });
          },
        },
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
    getMatchDetails: async (
      command: Omit<GetJobMatchDetailsCommand, "userId">,
    ) => {
      try {
        return await getJobMatchDetails(
          { ...command, userId },
          { ...deps, escoResolver: undefined },
        );
      } catch (err) {
        // Automatically perform analysis & match on-the-fly instead of failing
        try {
          await analyseAndMatchJob(
            { listingId: command.listingId, userId, force: true },
            deps,
          );
          return await getJobMatchDetails(
            { ...command, userId },
            { ...deps, escoResolver: undefined },
          );
        } catch {
          throw err;
        }
      }
    },
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
  sources: JobSource[];
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
    sources,
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

function createTelegramNotificationSender(
  config: ReturnType<typeof getServerConfig>,
  repository: SupabaseCareerCampaignRepository,
): TelegramBotNotificationSender | null {
  const botToken = config.TELEGRAM_BOT_TOKEN;
  const publicBaseUrl = config.PUBLIC_APP_BASE_URL;
  if (!telegramConfigured(config) || !botToken || !publicBaseUrl) return null;
  return new TelegramBotNotificationSender({
    botToken,
    publicBaseUrl,
    resolveChatId: async (uid) =>
      (await repository.getTelegramLink(uid))?.chatId ?? null,
  });
}

function telegramConfigured(
  config: ReturnType<typeof getServerConfig>,
): boolean {
  return Boolean(
    config.TELEGRAM_ENABLED &&
      config.TELEGRAM_BOT_TOKEN &&
      config.PUBLIC_APP_BASE_URL,
  );
}

function extractRoleAndCompany(text: string): {
  jobTitle: string;
  organizationName: string | null;
} {
  const clean = text.trim();

  // 1. Match patterns like "H2O.ai hiring Software Engineer in Colombo"
  const hiringMatch =
    /([a-zA-Z0-9\s.,&-]+?)\s+(?:is\s+)?hiring\s+(?:a\s+|an\s+)?([a-zA-Z0-9\s.,&/()-]+?)(?:\s+in|\s+at|\s+\||$|\n)/iu.exec(
      clean,
    );
  if (hiringMatch && hiringMatch[1] && hiringMatch[2]) {
    const org = hiringMatch[1].trim().replace(/^Linkedin\s*/iu, "").trim();
    const title = hiringMatch[2].trim();
    if (org.length < 50 && title.length < 60) {
      return { jobTitle: title, organizationName: org };
    }
  }

  // 2. Match patterns like "Software Engineer at H2O.ai" or "Software Engineer — H2O.ai"
  const atMatch =
    /([a-zA-Z0-9\s.,&/()-]+?)\s+(?:at|@|—|-)\s+([a-zA-Z0-9\s.,&-]+?)(?:\s+in|\s+\||$|\n)/iu.exec(
      clean,
    );
  if (atMatch && atMatch[1] && atMatch[2]) {
    const title = atMatch[1].trim();
    const org = atMatch[2].trim();
    if (
      title.length < 60 &&
      org.length < 50 &&
      !/^(here|attached|this|the|my|these)$/iu.test(title)
    ) {
      return { jobTitle: title, organizationName: org };
    }
  }

  // 3. Match common tech roles
  const commonRoles = [
    "software engineer",
    "frontend developer",
    "frontend engineer",
    "backend developer",
    "backend engineer",
    "full stack developer",
    "full stack engineer",
    "mobile developer",
    "flutter developer",
    "devops engineer",
    "cloud engineer",
    "data engineer",
    "qa engineer",
    "ui/ux designer",
  ];
  for (const r of commonRoles) {
    if (clean.toLowerCase().includes(r)) {
      const formatted = r
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      return { jobTitle: formatted, organizationName: null };
    }
  }

  return { jobTitle: "Software Engineer", organizationName: null };
}

export type CareerFriendApplication = ReturnType<
  typeof createCareerFriendApplication
>;

export function getCareerFriendApplication(userId: string) {
  return createCareerFriendApplication(userId);
}

function createCareerFriendApplication(userId: string) {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  const repository = new SupabaseCareerFriendRepository(supabase);
  const campaign = createCareerCampaignApplication(userId);
  const evidenceRepository = new SupabaseEvidenceRepository(supabase);
  const advisor = new GroqCareerAdvisor(getGroqKeyPool(), config.GROQ_MODEL);
  const now = () => new Date();

  const getSnapshot = async (): Promise<CareerSnapshot> => {
    const [dashboard, evidence, sprints] = await Promise.all([
      campaign.getDashboard(),
      evidenceRepository.getCurrent(userId),
      repository.listSprints(userId),
    ]);
    const verified = evidence?.status === "verified" ? evidence.evidence : null;
    return {
      profile: {
        name: verified?.profile.full_name ?? null,
        headline: verified?.profile.summary ?? null,
        skills: (verified?.skills ?? []).map((item) => item.name),
        projects: (verified?.projects ?? []).map((item) => item.name),
      },
      opportunities: {
        pendingRecommendations: dashboard.needsAttention.pendingRecommendations,
        discoveredJobs: dashboard.funnel.jobsDiscovered,
        applications: dashboard.funnel.applied,
        interviews: dashboard.funnel.interviews,
      },
      growthSignals: dashboard.growthActions.map((item) => ({
        id: item.id,
        label: item.gapLabel,
        frequency: item.frequency,
        whyItMatters: item.whyItMatters,
      })),
      activeSprints: sprints
        .filter((item) => item.status === "active" || item.status === "paused")
        .map((item) => ({
          id: item.id,
          title: item.title,
          gapType: item.gapType,
          completedMilestones: item.milestones.filter((milestone) => milestone.completed).length,
          totalMilestones: item.milestones.length,
        })),
    };
  };

  return {
    userId,
    getSnapshot,
    listSprints: () => repository.listSprints(userId),
    startSprint: async (growthActionId: string) => {
      const action = (await campaign.listGrowthActions()).find(
        (item) => item.id === growthActionId,
      );
      if (!action) {
        throw new CareerCampaignError("NOT_FOUND", "Growth signal was not found.");
      }
      return startCareerSprint(
        { userId, action },
        { repository, createId: randomUUID, now },
      );
    },
    setMilestone: (input: {
      sprintId: string;
      milestoneId: string;
      completed: boolean;
    }) => setSprintMilestone({ userId, ...input }, { repository, now }),
    submitEvidence: (input: {
      sprintId: string;
      evidenceUrl?: string;
      evidenceNote?: string;
    }) => submitCareerSprintEvidence({ userId, ...input }, { repository, now }),
    ask: async (input: {
      conversationId?: string;
      clientMessageId: string;
      message: string;
    }) => {
      const snapshot = await getSnapshot();
      const lowerMsg = input.message.toLowerCase();
      const isCoverLetter =
        /(?:write|generate|give|send|create|make|tailor|draft|get\s+a|need\s+a|want\s+a).*(?:cover\s*letter|coverletter)|\b(?:cover\s*letter|coverletter)\b/iu.test(
          lowerMsg,
        );
      const isCv =
        !isCoverLetter &&
        /(?:send|give|download|export|tailor|my\s+cv|my\s+resume|customized\s+cv|customised\s+cv|get\s+a\s+cv|need\s+a\s+cv|want\s+a\s+cv).*(?:cv|resume)|\b(?:my\s+cv|my\s+resume|send\s+cv|download\s+cv)\b/iu.test(
          lowerMsg,
        );
      const isJobSearch =
        isJobSearchMessage(input.message) && !isCoverLetter && !isCv;

      const ensureConversation = async (): Promise<string> => {
        if (input.conversationId) {
          const exists = await repository
            .conversationBelongsToUser(userId, input.conversationId)
            .catch(() => false);
          if (exists) return input.conversationId;
        }
        const newId = input.conversationId ?? randomUUID();
        await repository
          .createConversation({
            id: newId,
            userId,
            title: input.message.slice(0, 80),
            createdAt: new Date().toISOString(),
          })
          .catch(() => {});
        return newId;
      };

      if (isJobSearch) {
        try {
          const { sources } = createHybridJobSource(config);
          const jobDiscoveryRepo = new SupabaseJobDiscoveryRepository(supabase);
          const searchResult = await executeNaturalLanguageJobSearch(
            {
              userId,
              message: input.message,
              userSkills: snapshot.profile.skills,
              userHeadline: snapshot.profile.headline,
            },
            {
              sources,
              repository: jobDiscoveryRepo,
              keyPool: getGroqKeyPool(),
              model: config.GROQ_MODEL,
            },
          );
          if (searchResult.formattedText) {
            const conversationId = await ensureConversation();
            const nowIso = new Date().toISOString();
            await repository.addMessage({
              id: input.clientMessageId,
              userId,
              conversationId,
              role: "user",
              content: input.message,
              metadata: {},
              createdAt: nowIso,
            });
            await repository.addMessage({
              id: randomUUID(),
              userId,
              conversationId,
              role: "assistant",
              content: searchResult.formattedText,
              metadata: { isJobSearch: true },
              createdAt: new Date().toISOString(),
            });
            return {
              conversationId,
              messageId: randomUUID(),
              clientMessageId: input.clientMessageId,
              answer: searchResult.formattedText,
              suggestedActions: ["tailor_cv", "growth_sprint"],
              createdAt: nowIso,
            };
          }
        } catch {
          // fallback
        }
      }

      if (isCoverLetter) {
        const hasUrl = /https?:\/\/[^\s]+/iu.test(input.message);
        const isLongDescription = input.message.trim().length > 180;
        const isGeneralDoc =
          /\b(?:general|standard|generic|any\s+role|any\s+job|template)\b/iu.test(
            lowerMsg,
          );
        const extractedInfo = extractRoleAndCompany(input.message);
        const hasSpecificCompany = Boolean(extractedInfo.organizationName);

        const roleKeywords = [
          "software engineer",
          "full stack",
          "frontend",
          "backend",
          "devops",
          "data scientist",
          "machine learning",
          "ai engineer",
          "qa",
          "tester",
          "ui/ux",
          "designer",
          "product manager",
        ];
        let roleCount = 0;
        for (const rk of roleKeywords) {
          if (lowerMsg.includes(rk)) roleCount++;
        }
        const hasMultipleRoles =
          roleCount >= 2 && !hasSpecificCompany && !hasUrl && !isLongDescription;

        if (hasMultipleRoles) {
          const answerText =
            "Cover letters need to be addressed to a specific company and role. Which company and role should this be for? Or would you prefer a general cover letter?";
          const nowIso = new Date().toISOString();
          const conversationId = await ensureConversation();
          await repository.addMessage({
            id: input.clientMessageId,
            userId,
            conversationId,
            role: "user",
            content: input.message,
            metadata: {},
            createdAt: nowIso,
          });
          await repository.addMessage({
            id: randomUUID(),
            userId,
            conversationId,
            role: "assistant",
            content: answerText,
            metadata: {},
            createdAt: new Date().toISOString(),
          });
          return {
            conversationId,
            messageId: randomUUID(),
            clientMessageId: input.clientMessageId,
            answer: answerText,
            suggestedActions: ["tailor_cv", "growth_sprint"],
            createdAt: nowIso,
          };
        } else if (!isGeneralDoc && !hasUrl && !isLongDescription && !hasSpecificCompany) {
          const answerText =
            "Cover letters need to address a specific company and role. Please share the company name, role, or job link you're applying to — or let me know if you'd like a general cover letter.";
          const nowIso = new Date().toISOString();
          const conversationId = await ensureConversation();
          await repository.addMessage({
            id: input.clientMessageId,
            userId,
            conversationId,
            role: "user",
            content: input.message,
            metadata: {},
            createdAt: nowIso,
          });
          await repository.addMessage({
            id: randomUUID(),
            userId,
            conversationId,
            role: "assistant",
            content: answerText,
            metadata: {},
            createdAt: new Date().toISOString(),
          });
          return {
            conversationId,
            messageId: randomUUID(),
            clientMessageId: input.clientMessageId,
            answer: answerText,
            suggestedActions: ["tailor_cv", "growth_sprint"],
            createdAt: nowIso,
          };
        } else {
          try {
            const targetRole =
              extractedInfo.jobTitle ||
              snapshot.profile.headline ||
              "Software Engineer";
            const targetOrg = extractedInfo.organizationName ?? (isGeneralDoc ? "General" : undefined);
            const coverResult = await campaign.generateCustomCoverLetter({
              jobTitle: targetRole,
              organizationName: targetOrg !== "General" ? targetOrg : undefined,
              jobDescription: isGeneralDoc
                ? "General cover letter template highlighting proven track record, core competencies, and career impact."
                : input.message,
            });

            const nowIso = new Date().toISOString();
            const externalId = `cover_letter_${randomUUID()}`;
            const jobDiscovery = getJobDiscoveryApplication(userId);
            const [savedJob] = await jobDiscovery.repository.upsertDiscoveredJobs({
              userId,
              source: { key: "manual", name: isGeneralDoc ? "General Application" : "Cover Letter Opportunity" },
              jobs: [
                {
                  external_id: externalId,
                  title: isGeneralDoc ? `${targetRole} (General)` : targetRole,
                  organization: targetOrg && targetOrg !== "General" ? { name: targetOrg, logo_url: null, website_url: null } : null,
                  description: isGeneralDoc ? "General cover letter" : input.message,
                  location: null,
                  city: null,
                  region: null,
                  country: null,
                  employment_type: null,
                  work_mode: null,
                  experience_level: null,
                  salary_min: null,
                  salary_max: null,
                  salary_currency: null,
                  salary_period: null,
                  closing_at: null,
                  publisher: null,
                  source_url: null,
                  application_url: null,
                  application_is_direct: true,
                  published_at: nowIso,
                  raw_payload: {},
                },
              ],
              seenAt: nowIso,
            });

            if (savedJob) {
              await campaign.generateCoverLetterForListing(savedJob.listing_id).catch(() => {});
            }

            const headerSnippet = isGeneralDoc
              ? "Here is your general cover letter based on your verified career profile:"
              : `Here is your tailored cover letter for ${targetRole}${targetOrg ? ` at ${targetOrg}` : ""}:`;

            const answerText = `${headerSnippet}\n\n${coverResult.draft}\n\nThis has been saved to your **Cover Letters** library. You can view, copy, or download the PDF anytime under **CVs & Cover Letters**.`;
            const conversationId = await ensureConversation();
            await repository.addMessage({
              id: input.clientMessageId,
              userId,
              conversationId,
              role: "user",
              content: input.message,
              metadata: {},
              createdAt: nowIso,
            });
            await repository.addMessage({
              id: randomUUID(),
              userId,
              conversationId,
              role: "assistant",
              content: answerText,
              metadata: { isCoverLetter: true },
              createdAt: new Date().toISOString(),
            });
            return {
              conversationId,
              messageId: randomUUID(),
              clientMessageId: input.clientMessageId,
              answer: answerText,
              suggestedActions: ["tailor_cv", "growth_sprint"],
              createdAt: nowIso,
            };
          } catch {
            // fallback
          }
        }
      }

      const reply = await askCareerFriend(
        { userId, ...input, snapshot },
        { repository, advisor, createId: randomUUID, now },
      );

      return reply;
    },
    askTelegram: async (message: string) => {
      const conversationId =
        await repository.findOrCreateTelegramConversation(userId);
      const snapshot = await getSnapshot();

      let attachment: { bytes: Uint8Array; filename: string } | undefined;
      let answerText = "";

      const lowerMsg = message.toLowerCase();

      const recentMessages = await repository
        .listMessages({ userId, conversationId, limit: 6 })
        .catch(() => []);
      const lastAssistantMsg = [...recentMessages]
        .reverse()
        .find((m) => m.role === "assistant");
      const lastTurnWasCvPrompt = Boolean(
        lastAssistantMsg?.metadata?.isCv ||
          lastAssistantMsg?.metadata?.askedDocumentType === "cv" ||
          (lastAssistantMsg?.content &&
            /tailor your cv|general cv based on your|give me a cv|send me my cv/iu.test(
              lastAssistantMsg.content,
            )),
      );
      const lastTurnWasCoverLetterPrompt = Boolean(
        lastAssistantMsg?.metadata?.isCoverLetter ||
          lastAssistantMsg?.metadata?.askedDocumentType === "cover_letter" ||
          (lastAssistantMsg?.content &&
            /cover letter template|tailor.*cover letter/iu.test(
              lastAssistantMsg.content,
            )),
      );

      const isAffirmativeOrGeneral =
        /\b(?:general|generic|base|standard|default|profile\s+cv|profile\s+cover\s*letter)\b/iu.test(
          lowerMsg,
        ) ||
        /^(?:yes|sure|ok|okay|yep|yeah|yes\s+please|yes\s+general|general\s+is\s+fine|fine|go\s+ahead|do\s+it|please|send\s+it|where|where\s*\?)\b/iu.test(
          lowerMsg.trim(),
        );

      const isCoverLetter =
        /(?:write|generate|give|send|create|make|tailor|draft|get\s+a|need\s+a|want\s+a).*(?:cover\s*letter|coverletter)|\b(?:cover\s*letter|coverletter)\b/iu.test(
          lowerMsg,
        ) ||
        (lastTurnWasCoverLetterPrompt && isAffirmativeOrGeneral);

      const isCvRequest =
        !isCoverLetter &&
        (/(?:send|give|download|export|tailor|my\s+cv|my\s+resume|customized\s+cv|customised\s+cv|get\s+a\s+cv|need\s+a\s+cv|want\s+a\s+cv).*(?:cv|resume)|\b(?:my\s+cv|my\s+resume|send\s+cv|download\s+cv|cv|resume)\b/iu.test(
          lowerMsg,
        ) ||
          (lastTurnWasCvPrompt && isAffirmativeOrGeneral));

      const isJobSearch =
        isJobSearchMessage(message) && !isCoverLetter && !isCvRequest;

      // 1. Natural Language Job Search Flow
      if (isJobSearch) {
        try {
          const { sources } = createHybridJobSource(config);
          const jobDiscoveryRepo = new SupabaseJobDiscoveryRepository(supabase);
          const searchResult = await executeNaturalLanguageJobSearch(
            {
              userId,
              message,
              userSkills: snapshot.profile.skills,
              userHeadline: snapshot.profile.headline,
            },
            {
              sources,
              repository: jobDiscoveryRepo,
              keyPool: getGroqKeyPool(),
              model: config.GROQ_MODEL,
            },
          );
          if (searchResult.formattedText) {
            answerText = searchResult.formattedText;
            const nowIso = new Date().toISOString();
            await repository.addMessage({
              id: randomUUID(),
              userId,
              conversationId,
              role: "user",
              content: message,
              metadata: {},
              createdAt: nowIso,
            });
            await repository.addMessage({
              id: randomUUID(),
              userId,
              conversationId,
              role: "assistant",
              content: searchResult.formattedText,
              metadata: { isJobSearch: true },
              createdAt: new Date().toISOString(),
            });
            return {
              conversationId,
              messageId: randomUUID(),
              clientMessageId: randomUUID(),
              answer: answerText,
              suggestedActions: ["tailor_cv", "growth_sprint"],
              createdAt: nowIso,
            };
          }
        } catch {
          // fallback
        }
      }

      // Helper to classify request context
      const isGeneralDoc =
        isAffirmativeOrGeneral ||
        /\b(?:general|generic|base|standard|default|profile\s+cv|profile\s+cover\s*letter)\b/iu.test(
          lowerMsg,
        );

      const hasUrl = /https?:\/\/[^\s]+/iu.test(message);
      const isLongDescription = message.trim().length > 120;
      const extractedInfo = extractRoleAndCompany(message);
      const hasSpecificCompany = Boolean(extractedInfo.organizationName);

      const roleKeywords = [
        "frontend",
        "backend",
        "fullstack",
        "full stack",
        "devops",
        "cloud",
        "sre",
        "software engineer",
        "mobile",
        "ios",
        "android",
        "data engineer",
        "data scientist",
        "machine learning",
        "ai engineer",
        "qa",
        "tester",
        "ui/ux",
        "designer",
        "product manager",
      ];
      let roleCount = 0;
      for (const rk of roleKeywords) {
        if (lowerMsg.includes(rk)) roleCount++;
      }
      const hasMultipleRoles =
        roleCount >= 2 && !hasSpecificCompany && !hasUrl && !isLongDescription;

      // 2. Cover Letter Flow
      if (isCoverLetter) {
        if (hasMultipleRoles) {
          answerText =
            "Cover letters need to be addressed to a specific company and role. Which company and role should this be for? Or would you prefer a general cover letter template?";
        } else {
          try {
            const coverResult = await campaign.generateCustomCoverLetter({
              jobTitle: extractedInfo.jobTitle || "Software Engineer",
              organizationName: extractedInfo.organizationName ?? undefined,
              jobDescription:
                isGeneralDoc || (!hasUrl && !isLongDescription && !hasSpecificCompany)
                  ? "General cover letter template highlighting proven track record, core competencies, and career impact."
                  : message,
            });

            const coverDraftText = coverResult.draft;
            const coverJobTitle = coverResult.jobTitle || extractedInfo.jobTitle || "Professional";
            const coverOrg = coverResult.organizationName || extractedInfo.organizationName;

            if (coverDraftText) {
              const nowIso = new Date().toISOString();
              const externalId = `cover_letter_${randomUUID()}`;
              const jobDiscovery = getJobDiscoveryApplication(userId);
              const [savedJob] = await jobDiscovery.repository.upsertDiscoveredJobs({
                userId,
                source: { key: "telegram", name: isGeneralDoc ? "General Application (Telegram)" : "Cover Letter (Telegram)" },
                jobs: [
                  {
                    external_id: externalId,
                    title: isGeneralDoc ? `${coverJobTitle} (General)` : coverJobTitle,
                    organization: coverOrg && coverOrg !== "General" ? { name: coverOrg, logo_url: null, website_url: null } : null,
                    description: isGeneralDoc ? "General cover letter" : message,
                    location: null,
                    city: null,
                    region: null,
                    country: null,
                    employment_type: null,
                    work_mode: null,
                    experience_level: null,
                    salary_min: null,
                    salary_max: null,
                    salary_currency: null,
                    salary_period: null,
                    closing_at: null,
                    publisher: null,
                    source_url: null,
                    application_url: null,
                    application_is_direct: true,
                    published_at: nowIso,
                    raw_payload: {},
                  },
                ],
                seenAt: nowIso,
              });

              if (savedJob) {
                await campaign.generateCoverLetterForListing(savedJob.listing_id).catch(() => {});
              }

              const evidenceSet = await evidenceRepository.getCurrent(userId);
              const prof = evidenceSet?.evidence?.profile;
              const pdfBytes = await renderCoverLetterPdf({
                candidateName:
                  prof?.full_name || snapshot.profile.name || "Candidate",
                contact: {
                  email: prof?.email ?? null,
                  phone: prof?.phone ?? null,
                  location: prof?.location ?? null,
                  linkedinUrl: prof?.linkedin_url ?? null,
                  githubUrl: prof?.github_url ?? null,
                },
                jobTitle: coverJobTitle,
                organizationName: coverOrg,
                letterText: coverDraftText,
              });

              const coverRole = coverJobTitle.replace(/[^a-zA-Z0-9_-]/gu, "_");
              const coverCompany = (coverOrg || "").trim().replace(/[^a-zA-Z0-9_-]/gu, "_");
              const letterFilename =
                isGeneralDoc || !coverCompany
                  ? `Cover_Letter_General_${coverRole}.pdf`
                  : `Cover_Letter_${coverRole}_${coverCompany}.pdf`;
              attachment = {
                bytes: pdfBytes,
                filename: letterFilename,
              };

              if (isGeneralDoc || !coverOrg) {
                answerText =
                  "Here is your general cover letter template based on your profile, attached below as a PDF. Whenever you have a specific role or company, let me know and I'll tailor it!";
              } else {
                const companySnippet = coverOrg ? ` for ${coverOrg}` : "";
                answerText = `Here is your tailored cover letter for ${coverJobTitle}${companySnippet}, attached below as a PDF. Let me know if you'd like any tweaks!`;
              }
            }
          } catch {
            answerText =
              "I couldn't generate the cover letter right now. Please share the job description or company name and try again.";
          }
        }

        const nowIso = new Date().toISOString();
        await repository.addMessage({
          id: randomUUID(),
          userId,
          conversationId,
          role: "user",
          content: message,
          metadata: {},
          createdAt: nowIso,
        });
        await repository.addMessage({
          id: randomUUID(),
          userId,
          conversationId,
          role: "assistant",
          content: answerText,
          metadata: { isCoverLetter: true, askedDocumentType: "cover_letter" },
          createdAt: new Date().toISOString(),
        });

        return {
          conversationId,
          messageId: randomUUID(),
          clientMessageId: randomUUID(),
          answer: answerText,
          suggestedActions: ["tailor_cv", "growth_sprint"],
          createdAt: nowIso,
          attachment,
        };
      }

      // 3. CV Flow
      if (isCvRequest) {
        if (hasMultipleRoles) {
          answerText =
            "Which specific role and company would you like this CV tailored for? Please share the job description or link — or let me know if you would prefer a general CV instead.";
        } else {
          try {
            const evidenceSet = await evidenceRepository.getCurrent(userId);
            if (evidenceSet && evidenceSet.evidence) {
              const sourceText = await evidenceRepository
                .getDocumentExtractedText({
                  documentId: evidenceSet.sourceDocumentId,
                  userId,
                })
                .catch(() => "");
              const recovered = recoverEvidenceFromCvText(
                evidenceSet.evidence,
                sourceText,
              );
              const evidenceSnapshot = buildEvidenceSnapshot(
                evidenceSet.id,
                recovered,
              );
              const jobTitle = sanitizeJobTitleForCv(
                extractedInfo.jobTitle ||
                  snapshot.profile.headline ||
                  evidenceSet.evidence.work_experience[0]?.role ||
                  "Software Engineer",
              );
              const isTwoPage =
                /\b(?:two\s*pages?|2\s*pages?|detailed|extended|comprehensive|long)\b/iu.test(
                  lowerMsg,
                );
              const cvMode: CvMode = isTwoPage ? "two_page" : "one_page";

              const plan = buildContentPlan({
                mode: cvMode,
                snapshot: evidenceSnapshot,
                requirements: [],
                jobTitle,
              });
              const resume = buildDeterministicResume({
                plan,
                snapshot: evidenceSnapshot,
                keywordAudit: [],
              });
              const renderer =
                process.env.CV_PDF_RENDERER === "pdfkit"
                  ? new PdfKitCvRenderer()
                  : new ReactPdfCvRenderer();
              const rendered = await renderer.render({
                mode: cvMode,
                content: resume,
                snapshot: evidenceSnapshot,
                plan,
                jobTitle,
              });
              const roleClean = jobTitle.trim().replace(/[^a-zA-Z0-9_-]/gu, "_");
              const compClean = (extractedInfo.organizationName || "")
                .trim()
                .replace(/[^a-zA-Z0-9_-]/gu, "_");
              const pageSuffix = isTwoPage ? "_2Page" : "";
              const cvFilename =
                isGeneralDoc || !compClean
                  ? `General_CV_${roleClean}${pageSuffix}.pdf`
                  : `CV_${roleClean}_${compClean}${pageSuffix}.pdf`;
              attachment = {
                bytes: rendered.bytes,
                filename: cvFilename,
              };

              const isDraft = evidenceSet.status !== "verified";
              const pageText = isTwoPage ? "2-page " : "";
              if (isGeneralDoc || (!hasUrl && !isLongDescription && !hasSpecificCompany)) {
                answerText = isDraft
                  ? `Here is your ${pageText}CV based on your current profile, attached below as a PDF. Whenever you have a specific job description or link, share it with me and I'll tailor a targeted version for you!`
                  : `Here is your general ${pageText}CV based on your verified profile, attached below as a PDF. Whenever you have a specific job description or link, share it with me and I’ll tailor a targeted version for you!`;
              } else {
                answerText = `Here is your tailored ${pageText}CV for ${jobTitle}, attached below as a PDF. Let me know if you'd like any adjustments!`;
              }
            } else {
              answerText =
                "I'd love to generate your CV, but you haven't added your experience yet! Please upload your resume or complete your profile at /onboarding (or /app/career-profile) and I'll generate your CV anytime.";
            }
          } catch {
            answerText =
              "I ran into an issue generating the CV PDF. Please verify your profile in the app or try again.";
          }
        }

        const nowIso = new Date().toISOString();
        await repository.addMessage({
          id: randomUUID(),
          userId,
          conversationId,
          role: "user",
          content: message,
          metadata: {},
          createdAt: nowIso,
        });
        await repository.addMessage({
          id: randomUUID(),
          userId,
          conversationId,
          role: "assistant",
          content: answerText,
          metadata: { isCv: true, askedDocumentType: "cv" },
          createdAt: new Date().toISOString(),
        });

        return {
          conversationId,
          messageId: randomUUID(),
          clientMessageId: randomUUID(),
          answer: answerText,
          suggestedActions: ["tailor_cv", "growth_sprint"],
          createdAt: nowIso,
          attachment,
        };
      }

      // 4. Conversational / Gap Analysis / Advice Flow
      const reply = await askCareerFriend(
        {
          userId,
          conversationId,
          clientMessageId: randomUUID(),
          message,
          snapshot,
        },
        { repository, advisor, createId: randomUUID, now },
      );

      return {
        ...reply,
        answer: reply.answer,
        attachment: undefined,
      };
    },
  };
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
          telegramOptedIn: async (uid) => {
            if (!telegramConfigured(config)) return false;
            const link = await repository.getTelegramLink(uid);
            return Boolean(link?.optedInAt && !link.optedOutAt);
          },
          resurfacingWindowDays: config.RESURFACING_WINDOW_DAYS ?? 30,
          executeSearch: async (uid) => {
            const search = await careerApp.searchForJobs({ origin: "campaign" });
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
    getPacketByRecommendation: (recommendationId: string) =>
      repository.getPacketByRecommendation(userId, recommendationId),
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
            const matchedReqs = details.analysis.requirements
              .filter((r) =>
                details.match.matches.some(
                  (m) =>
                    m.requirement_id === r.id &&
                    (m.status === "matched" || m.status === "partial"),
                ),
              )
              .map((r) => r.statement);
            const missingReqs = details.analysis.requirements
              .filter((r) =>
                details.match.matches.some(
                  (m) => m.requirement_id === r.id && m.status === "gap",
                ),
              )
              .map((r) => r.statement);

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
              matchedRequirements:
                matchedReqs.length > 0
                  ? matchedReqs
                  : details.analysis.requirements.map((r) => r.statement),
              missingRequirements: missingReqs,
              applicationUrl:
                details.card.applicationUrl ??
                recommendation?.fitSummarySnapshot.applicationUrl ??
                null,
              jobMatchAnalysisId: details.match.id,
            };
          },
        },
      ),
    generateCoverLetterForListing: async (listingId: string) => {
      const evidence = await evidenceRepository.getCurrent(userId);
      const evidenceJson = evidence?.evidence ?? {
        schema_version: 1,
        profile: { full_name: "Candidate" },
        work_experience: [],
        skills: [],
        projects: [],
        education: [],
      };

      const details = await careerApp.getMatchDetails({ listingId });
      const jobs = await jobRepository.listJobs({
        userId,
        includeDismissed: true,
        limit: 500,
        offset: 0,
      });
      const job = jobs.find((j) => j.listing_id === listingId);
      const fullJobDescription =
        job?.description ||
        details.analysis.requirements
          .map((req) => req.statement)
          .join("\n") ||
        details.card.explanation;

      const matchedReqs = details.analysis.requirements
        .filter((r) =>
          details.match.matches.some(
            (m) =>
              m.requirement_id === r.id &&
              (m.status === "matched" || m.status === "partial"),
          ),
        )
        .map((r) => r.statement);
      const missingReqs = details.analysis.requirements
        .filter((r) =>
          details.match.matches.some(
            (m) => m.requirement_id === r.id && m.status === "gap",
          ),
        )
        .map((r) => r.statement);

      const cover = await coverLetterGenerator.generate({
        evidenceJson,
        jobTitle: details.card.title,
        organizationName: details.card.organizationName,
        jobDescription: fullJobDescription,
        matchedRequirements:
          matchedReqs.length > 0
            ? matchedReqs
            : details.analysis.requirements.map((r) => r.statement),
        missingRequirements: missingReqs,
        applicationUrl: details.card.applicationUrl ?? null,
      });

      // Persist to application_packets so it appears in the Cover Letters library
      try {
        const nowIso = new Date().toISOString();
        const { recommendation } = await repository.upsertRecommendation({
          id: randomUUID(),
          userId,
          listingId,
          jobMatchAnalysisId: details.match.id,
          campaignRunId: randomUUID(),
          scoreSnapshot: {
            evidenceFitScore: details.match.evidenceFitScore,
            careerLevel: details.match.careerLevel,
            hardConstraintEligible: details.match.hardConstraintEligible,
            analysisConfidence: details.match.analysisConfidence,
            scoringPolicyVersion: details.match.scoringPolicyVersion,
          },
          fitSummarySnapshot: {
            explanation: details.match.explanation,
            topMatched: details.card.topMatched ?? [],
            primaryGaps: details.card.primaryGaps ?? [],
            rankingReasons: details.card.rankingReasons ?? [],
            title: details.card.title,
            organizationName: details.card.organizationName,
            applicationUrl: details.card.applicationUrl ?? null,
          },
          scoringPolicyVersion: "v1",
          recommendedAt: nowIso,
        });

        const { packet } = await repository.createOrGetPacket({
          id: randomUUID(),
          userId,
          recommendationId: recommendation.id,
          listingId,
          evidenceSetId: evidence?.id ?? null,
          evidenceVersion: evidence?.evidence?.schema_version ?? null,
          jobMatchAnalysisId: details.match.id,
          applicationUrl: details.card.applicationUrl ?? null,
          requestedAt: nowIso,
        });

        await repository.updatePacket(userId, packet.id, {
          status: "ready",
          coverLetterDraft: cover.draft,
          coverLetterMeta: {
            ...cover.meta,
            jobTitle: details.card.title,
            organizationName: details.card.organizationName,
          },
          readyAt: nowIso,
        });
      } catch (saveErr) {
        console.warn("Could not persist cover letter to application packet:", saveErr);
      }

      return {
        draft: cover.draft,
        meta: cover.meta,
        jobTitle: details.card.title,
        organizationName: details.card.organizationName,
      };
    },
    generateCustomCoverLetter: async (input: {
      jobTitle?: string;
      organizationName?: string;
      jobDescription: string;
    }) => {
      const evidence = await evidenceRepository.getCurrent(userId);
      const evidenceJson = evidence?.evidence ?? {
        schema_version: 1,
        profile: { full_name: "Candidate" },
        work_experience: [],
        skills: [],
        projects: [],
        education: [],
      };
      const cover = await coverLetterGenerator.generate({
        evidenceJson,
        jobTitle: input.jobTitle || "Software Engineer",
        organizationName: input.organizationName || null,
        jobDescription: input.jobDescription,
        matchedRequirements: [],
        missingRequirements: [],
        applicationUrl: null,
      });
      return {
        draft: cover.draft,
        meta: cover.meta,
        jobTitle: input.jobTitle || "Software Engineer",
        organizationName: input.organizationName || null,
      };
    },
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
    getWhatsAppConnection: () => getWhatsAppConnection(userId, repository),
    createWhatsAppConnectionCode: () =>
      createWhatsAppConnectionCode({ userId, repository, now }),
    disconnectWhatsApp: () => disconnectWhatsApp(userId, repository),
    getTelegramConnection: () => getTelegramConnection(userId, repository),
    createTelegramConnectionCode: () =>
      createTelegramConnectionCode({ userId, repository, now }),
    disconnectTelegram: () => disconnectTelegram(userId, repository),
    deliverNotifications: (input?: {
      channel?: "in_app" | "whatsapp" | "telegram";
      userId?: string;
    }) => {
      let whatsappSender:
        | TwilioWhatsAppSender
        | WhatsAppCloudNotificationSender
        | null = null;
      const resolveWaId = async (uid: string) =>
        (await repository.getWhatsAppLink(uid))?.waId ?? null;
      const telegramSender = createTelegramNotificationSender(
        config,
        repository,
      );

      if (config.WHATSAPP_ENABLED && config.WHATSAPP_PROVIDER === "twilio") {
        const from =
          config.TWILIO_WHATSAPP_NUMBER ??
          config.WHATSAPP_BUSINESS_PHONE_E164;
        if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && from) {
          whatsappSender = new TwilioWhatsAppSender({
            accountSid: config.TWILIO_ACCOUNT_SID,
            authToken: config.TWILIO_AUTH_TOKEN,
            from,
            publicBaseUrl: config.PUBLIC_APP_BASE_URL,
            resolveWaId,
          });
        }
      } else if (
        config.WHATSAPP_ENABLED &&
        config.WHATSAPP_ACCESS_TOKEN &&
        config.WHATSAPP_PHONE_NUMBER_ID
      ) {
        whatsappSender = new WhatsAppCloudNotificationSender({
          accessToken: config.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
          templateName:
            config.WHATSAPP_TEMPLATE_RECOMMENDATION ?? "zeno_recommendation",
          templateLanguage: config.WHATSAPP_TEMPLATE_LANGUAGE,
          graphApiVersion: config.WHATSAPP_GRAPH_API_VERSION,
          publicBaseUrl: config.PUBLIC_APP_BASE_URL,
          resolveWaId,
        });
      }

      return deliverPendingNotifications({
        repository,
        now,
        ...(input?.channel ? { channel: input.channel } : {}),
        ...(input?.userId ? { userId: input.userId } : {}),
        senders: {
          in_app: new InAppNotificationSender(),
          ...(whatsappSender ? { whatsapp: whatsappSender } : {}),
          ...(telegramSender ? { telegram: telegramSender } : {}),
        },
      });
    },
    getDashboard: () =>
      getCampaignDashboard(userId, {
        repository,
        now,
        countDiscoveredJobs: (uid) =>
          jobRepository.countJobs({
            userId: uid,
            includeDismissed: false,
          }),
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
    listJobCampaigns: () =>
      listJobCampaigns(userId, {
        repository: new SupabaseFreshWatchRepository(supabase),
      }),
    getJobsOverview: () =>
      getJobsWorkspaceOverview(userId, {
        repository: new SupabaseFreshWatchRepository(supabase),
      }),
    createJobCampaign: async (input: {
      name?: string;
      primaryRole: string;
      location: string;
      workMode?: "onsite" | "hybrid" | "remote" | "any";
      employmentTypes?: JobSearchCampaign["employmentTypes"];
      experienceLevels?: JobSearchCampaign["experienceLevels"];
      minimumScore?: number;
      preferredTechnologies?: string[];
      targetReadyDate?: string | null;
      weeklyHoursAvailable?: JobSearchCampaign["weeklyHoursAvailable"];
    }) => {
      const campaign = await createJobCampaign(
        { userId, ...input },
        {
          repository: new SupabaseFreshWatchRepository(supabase),
          createId: randomUUID,
          now,
          caps: freshWatchCapsFromConfig(config),
        },
      );
      await requestGrowthAssessmentSafely({
        userId,
        campaignId: campaign.id,
        mode: "preliminary",
      });
      return campaign;
    },
    getJobCampaign: (campaignId: string) =>
      getJobCampaignForUser(
        { userId, campaignId },
        { repository: new SupabaseFreshWatchRepository(supabase) },
      ),
    updateJobCampaign: async (
      campaignId: string,
      input: {
        name?: string;
        primaryRole?: string;
        location?: string;
        workMode?: "onsite" | "hybrid" | "remote" | "any";
        employmentTypes?: JobSearchCampaign["employmentTypes"];
        experienceLevels?: JobSearchCampaign["experienceLevels"];
        minimumScore?: number;
        preferredTechnologies?: string[];
        targetReadyDate?: string | null;
        weeklyHoursAvailable?: JobSearchCampaign["weeklyHoursAvailable"];
      },
    ) => {
      const campaign = await updateJobCampaign(
        { userId, campaignId, ...input },
        {
          repository: new SupabaseFreshWatchRepository(supabase),
          createId: randomUUID,
          now,
          caps: freshWatchCapsFromConfig(config),
        },
      );
      await requestGrowthAssessmentSafely({
        userId,
        campaignId: campaign.id,
        mode: "preliminary",
      });
      return campaign;
    },
    pauseJobCampaign: (campaignId: string) =>
      pauseJobCampaign(
        { userId, campaignId },
        { repository: new SupabaseFreshWatchRepository(supabase), now },
      ),
    resumeJobCampaign: (campaignId: string) =>
      resumeJobCampaign(
        { userId, campaignId },
        {
          repository: new SupabaseFreshWatchRepository(supabase),
          createId: randomUUID,
          now,
          caps: freshWatchCapsFromConfig(config),
        },
      ),
    archiveJobCampaign: (campaignId: string) =>
      archiveJobCampaign(
        { userId, campaignId },
        { repository: new SupabaseFreshWatchRepository(supabase), now },
      ),
    listCampaignListings: (campaignId: string) =>
      new SupabaseFreshWatchRepository(supabase).listCampaignListings(campaignId),
    listCampaignRuns: (campaignId: string) =>
      new SupabaseFreshWatchRepository(supabase).listCampaignRuns(campaignId),
    getLatestInstantSearch: () =>
      new SupabaseFreshWatchRepository(supabase).getLatestInstantSearchSession(
        userId,
      ),
    updateInstantSearchAnalysed: (sessionId: string, analysedCount: number) =>
      new SupabaseFreshWatchRepository(supabase).updateInstantSearchSession(
        sessionId,
        { analysedCount },
      ),
    runJobCampaignNow: async (campaignId: string) => {
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
      const result = await runJobCampaignNow(
        { userId, campaignId },
        {
          repository: freshRepository,
          campaignRepository: repository,
          createId: randomUUID,
          now,
          caps: freshWatchCapsFromConfig(config),
          linkedInEnabled,
          telegramEnabled: telegramConfigured(config),
          linkedIn: {
            searchFreshCards: (input) => linkedIn.searchFreshCards(input),
            fetchJobDescription: (id) => linkedIn.fetchJobDescription(id),
          },
          analyseListing: async ({ userId: uid, listingId }) => {
            const career = createCareerIntelligenceApplication(uid);
            const [item] = await career.analyseBatch({ listingIds: [listingId] });
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
          runBroadSearch: async ({ userId: uid, campaignId: id, runId }) => {
            const check = await getCareerCampaignApplication(uid).runCheck({
              trigger: "cron",
              idempotencyKey: `campaign_broad:${id}:${runId.slice(0, 8)}`,
            });
            return {
              recommended: check.run.recommendedCount,
              status: check.run.status,
              listingIds: [],
            };
          },
        },
      );
      await requestGrowthAssessmentSafely({
        userId,
        campaignId,
        mode: "market_refined",
      });
      await getCareerCampaignApplication(userId).deliverNotifications({
        userId,
        channel: "telegram",
      });
      return result;
    },
    listCampaigns: () =>
      new SupabaseFreshWatchRepository(supabase).listCampaignsByUserId(userId),
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

  const analyseListing = async ({
    userId,
    listingId,
  }: {
    userId: string;
    listingId: string;
  }) => {
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
  };

  const discovery = await processScheduledDiscoveryTick({
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
    analyseListing,
    processLinkedInSearch: async ({ canonicalSearchId, runId }) => {
      const result = await processLinkedInFreshSearch(
        { canonicalSearchId, runId },
        {
          repository: freshRepository,
          campaignRepository,
          linkedIn: {
            searchFreshCards: (input) => linkedIn.searchFreshCards(input),
            fetchJobDescription: (id) => linkedIn.fetchJobDescription(id),
          },
          analyseListing,
          createId: randomUUID,
          now: () => new Date(),
          caps: freshWatchCapsFromConfig(config),
          linkedInEnabled,
          telegramEnabled: telegramConfigured(config),
        },
      );
      if (
        result.llmCalls > 0 ||
        result.recommendationsCreated > 0 ||
        result.newlyPersisted > 0
      ) {
        const members = await freshRepository.listMembers(canonicalSearchId);
        await Promise.all(
          members.map((member) =>
            requestGrowthAssessmentSafely({
              userId: member.userId,
              campaignId: member.campaignId,
              mode: "market_refined",
            }),
          ),
        );
      }
      return result;
    },
    runBroadCampaign: async ({ userId, campaignId, runId }) => {
      const day = new Date().toISOString().slice(0, 10);
      const result = await getCareerCampaignApplication(userId).runCheck({
        trigger: "cron",
        idempotencyKey: `broad_watch:${day}:${campaignId}:${runId.slice(0, 8)}`,
      });
      const jobs = await new SupabaseJobDiscoveryRepository(supabase).listJobs({
        userId,
        includeDismissed: false,
        limit: 50,
        offset: 0,
      });
      for (const job of jobs.slice(0, 20)) {
        await freshRepository.attachCampaignListing({
          campaignId,
          listingId: job.listing_id,
          discoverySource: "broad_hybrid",
          seenAt: new Date().toISOString(),
          originatingRunId: runId,
        });
      }
      await requestGrowthAssessmentSafely({
        userId,
        campaignId,
        mode: "market_refined",
      });
      return {
        recommended: result.run.recommendedCount,
        status: result.run.status,
      };
    },
    deliverNotifications: async () => {
      const telegramSender = createTelegramNotificationSender(
        config,
        campaignRepository,
      );
      const result = await deliverPendingNotifications(
        {
          repository: campaignRepository,
          senders: {
            in_app: new InAppNotificationSender(),
            ...(telegramSender ? { telegram: telegramSender } : {}),
          },
          now: () => new Date(),
        },
      );
      return result.delivered;
    },
  });
  const growth = await processDueGrowthAssessments(8);
  return { ...discovery, growth };
}
