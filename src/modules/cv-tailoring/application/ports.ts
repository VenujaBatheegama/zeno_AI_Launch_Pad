import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobRequirement } from "@/modules/career-intelligence/domain/schemas";

import type { ContentPlan } from "../domain/content-plan";
import type { EvidenceSnapshot } from "../domain/facts";
import type {
  CvMode,
  CvVariantStatus,
  GenerationAssessment,
  KeywordAuditEntry,
} from "../domain/schemas";
import type { GroqResumeDraft, TailoredResume } from "../domain/tailored-resume";
import type { ValidationIssue } from "../domain/validation";

export type CvTailoringVariant = {
  id: string;
  userId: string;
  listingId: string;
  jobId: string;
  jobAnalysisId: string;
  evidenceSetId: string;
  mode: CvMode;
  status: CvVariantStatus;
  recommendedMode: CvMode;
  recommendationReason: string;
  tailoringContext: string | null;
  idempotencyKey: string;
  evidenceFingerprint: string;
  analysisFingerprint: string;
  contentPlanFingerprint: string;
  policyVersion: string;
  promptVersion: string;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  repairCount: number;
  generationDurationMs: number | null;
  evidenceSnapshot: EvidenceSnapshot;
  contentPlan: ContentPlan;
  keywordAudit: KeywordAuditEntry[];
  /** Final validated resume JSON (React-pdf + preview source of truth). */
  tailoredContent: TailoredResume | null;
  assessment: GenerationAssessment | null;
  validationIssues: ValidationIssue[];
  warnings: string[];
  artifactStoragePath: string | null;
  artifactChecksum: string | null;
  artifactPageCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TailoringUsage = {
  modelId: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface CvTailoringRepository {
  saveVariant(variant: CvTailoringVariant): Promise<CvTailoringVariant>;
  getVariant(userId: string, variantId: string): Promise<CvTailoringVariant | null>;
  getVariantByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<CvTailoringVariant | null>;
  listVariantsForListing(
    userId: string,
    listingId: string,
  ): Promise<CvTailoringVariant[]>;
  listVariantsForUser(
    userId: string,
    options?: { statuses?: CvVariantStatus[]; limit?: number },
  ): Promise<CvTailoringVariant[]>;
}

export interface TailoredCvStorage {
  save(input: {
    path: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void>;
  read(path: string): Promise<Uint8Array>;
}

export interface CvLanguageTailorer {
  tailor(input: {
    jobTitle: string;
    company: string | null;
    mode: CvMode;
    tailoringContext: string | null;
    requirements: JobRequirement[];
    selectedEvidence: unknown;
    keywordAudit: KeywordAuditEntry[];
    skillInventory: string[];
    plan: Pick<
      ContentPlan,
      | "mode"
      | "allowSummary"
      | "requireSummary"
      | "targetTitle"
      | "jobAlignment"
      | "summaryMaxChars"
      | "bulletsPerExperience"
      | "bulletsPerProject"
      | "paragraphsPerProject"
      | "projectSourceFacts"
      | "projectParagraphWords"
      | "bulletMaxChars"
      | "projectItemIds"
      | "experienceItemIds"
      | "skillItemIds"
      | "achievementItemIds"
      | "referenceItemIds"
    >;
  }): Promise<{ draft: GroqResumeDraft; usage: TailoringUsage }>;

  repairFragment(input: {
    careerItemId: string;
    kind: "experience" | "project";
    facts: unknown;
    supportedKeywords: KeywordAuditEntry[];
    validationError: string;
    maxBullets: number;
    maxChars: number;
  }): Promise<{
    bullets: GroqResumeDraft["experience"][number]["bullets"];
    usage: TailoringUsage;
  }>;
}

export interface CvPdfRenderer {
  render(input: {
    mode: CvMode;
    content: TailoredResume;
    snapshot: EvidenceSnapshot;
    plan: ContentPlan;
    jobTitle: string;
    resume?: TailoredResume;
  }): Promise<{
    bytes: Uint8Array;
    pageCount: number;
    extractedText: string;
    diagnostics: string[];
    /** Final resume actually rendered (may be reduced to fit page budget). */
    resume?: TailoredResume;
  }>;
}

export type IdGenerator = () => string;
export type Clock = () => Date;

export type VerifiedEvidenceLoader = {
  load(userId: string): Promise<{
    evidenceSetId: string;
    evidence: CareerEvidence;
    updatedAt: string;
  } | null>;
};
