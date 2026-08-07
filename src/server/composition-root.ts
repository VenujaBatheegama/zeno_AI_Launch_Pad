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
  type DiscoverJobsCommand,
} from "@/modules/job-discovery/application/discover-jobs";
import {
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
import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";
import { JSearchJobSource } from "@/modules/job-discovery/infrastructure/jsearch-job-source";
import { SupabaseJobDiscoveryRepository } from "@/modules/job-discovery/infrastructure/supabase-job-discovery-repository";

import { getServerConfig } from "./config";
import { createSupabaseClient } from "./supabase-client";

export type CareerEvidenceApplication = ReturnType<
  typeof createCareerEvidenceApplication
>;

let application: CareerEvidenceApplication | undefined;
let jobDiscoveryApplication: JobDiscoveryApplication | undefined;

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
  const source = new JSearchJobSource({
    apiKey: config.jsearchApiKey ?? "",
    baseUrl: config.jsearchBaseUrl,
    timeoutMs: config.JSEARCH_TIMEOUT_MS,
  });
  const now = () => new Date();

  return {
    demoUserId: config.DEMO_USER_ID,
    getProfile: () =>
      getJobSearchProfile(config.DEMO_USER_ID, repository),
    savePreferences: (
      command: Omit<SavePreferencesCommand, "userId">,
    ) =>
      saveJobSearchPreferences(
        { ...command, userId: config.DEMO_USER_ID },
        { repository, createId: randomUUID, now },
      ),
    discover: (command: Omit<DiscoverJobsCommand, "userId">) => {
      if (!config.jsearchApiKey) {
        throw new JobDiscoveryError(
          "SOURCE_UNAUTHORIZED",
          "Add JSEARCH_API_KEY (or RAPIDAPI_KEY) to the server environment before finding jobs.",
        );
      }
      return discoverJobs(
        { ...command, userId: config.DEMO_USER_ID },
        {
          repository,
          source,
          now,
          maxRequests: config.JSEARCH_MAX_REQUESTS,
          maxPages: config.JSEARCH_MAX_PAGES,
          pageSize: config.JSEARCH_PAGE_SIZE,
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
  };
}
