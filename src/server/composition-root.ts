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

import { getServerConfig } from "./config";
import { createSupabaseClient } from "./supabase-client";

export type CareerEvidenceApplication = ReturnType<
  typeof createCareerEvidenceApplication
>;

let application: CareerEvidenceApplication | undefined;

export function getCareerEvidenceApplication(): CareerEvidenceApplication {
  application ??= createCareerEvidenceApplication();
  return application;
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
