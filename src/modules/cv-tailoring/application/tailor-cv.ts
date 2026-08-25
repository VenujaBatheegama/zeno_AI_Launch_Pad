import { createHash } from "node:crypto";

import { z } from "zod";

import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";
import { fingerprint } from "@/modules/career-intelligence/domain/fingerprint";
import type { CareerIntelligenceRepository } from "@/modules/career-intelligence/application/ports";

import {
  assembleTailoredResume,
  assessmentFromGeneration,
} from "../domain/assemble-resume";
import {
  assessContentDensity,
  enrichResumeFromSelectedEvidence,
} from "../domain/content-density";
import {
  buildContentPlan,
  hasBasicCvEvidence,
  recommendCvMode,
} from "../domain/content-plan";
import { looksIncompleteProse } from "../domain/content-integrity";
import {
  buildDeterministicResume,
  normalizeGroqDraft,
} from "../domain/deterministic-resume";
import { CvTailoringError } from "../domain/errors";
import { buildEvidenceSnapshot } from "../domain/facts";
import { recoverEvidenceFromCvText } from "../domain/recover-evidence-from-cv-text";
import {
  MAX_FRAGMENT_REPAIRS,
  MAX_TAILORING_CONTEXT_CHARS,
  TAILORING_POLICY_VERSION,
  TAILORING_PROMPT_VERSION,
} from "../domain/policy";
import type { GenerationAssessment, KeywordAuditEntry } from "../domain/schemas";
import { cvModeSchema } from "../domain/schemas";
import { buildSkillInventory } from "../domain/skill-inventory";
import {
  isTailoredResume,
  type GroqResumeDraft,
  type TailoredResume,
} from "../domain/tailored-resume";
import { validateTailoredResume } from "../domain/validate-resume";
import type {
  Clock,
  CvLanguageTailorer,
  CvPdfRenderer,
  CvTailoringRepository,
  CvTailoringVariant,
  IdGenerator,
  TailoredCvStorage,
  TailoringUsage,
} from "./ports";

const createSchema = z.object({
  userId: z.uuid(),
  listingId: z.uuid(),
  mode: cvModeSchema.optional(),
  tailoringContext: z
    .string()
    .max(MAX_TAILORING_CONTEXT_CHARS)
    .optional()
    .nullable(),
  force: z.boolean().optional().default(false),
});

export type CreateAndGenerateCvCommand = z.input<typeof createSchema>;

/**
 * Plan → Groq tailor → assemble TailoredResume → validate.
 * Stops at ready_to_render so the UI can preview before PDF rendering.
 */
export async function createTailoredCvContent(
  command: CreateAndGenerateCvCommand,
  dependencies: {
    evidenceRepository: CareerEvidenceRepository;
    jobRepository: JobDiscoveryRepository;
    careerRepository: CareerIntelligenceRepository;
    repository: CvTailoringRepository;
    tailorer: CvLanguageTailorer;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<CvTailoringVariant> {
  const parsed = createSchema.parse(command);
  const context = normalizeContext(parsed.tailoringContext);

  const evidenceSet = await dependencies.evidenceRepository.getCurrent(
    parsed.userId,
  );
  if (!evidenceSet || evidenceSet.status !== "verified") {
    throw new CvTailoringError(
      "EVIDENCE_REQUIRED",
      "Verify your career evidence before tailoring a CV.",
    );
  }

  const job = await findJob(
    parsed.userId,
    parsed.listingId,
    dependencies.jobRepository,
  );
  const analysis = await dependencies.careerRepository.getJobAnalysisByListing(
    parsed.userId,
    parsed.listingId,
  );
  if (!analysis || analysis.status !== "ready") {
    throw new CvTailoringError(
      "ANALYSIS_REQUIRED",
      "Analyse this job before tailoring a CV.",
    );
  }
  const match = await dependencies.careerRepository.getMatchAnalysisByListing(
    parsed.userId,
    parsed.listingId,
  );
  const assessment =
    await dependencies.careerRepository.getLatestCareerStageAssessment(
      parsed.userId,
    );

  const sourceText =
    await dependencies.evidenceRepository.getDocumentExtractedText({
      documentId: evidenceSet.sourceDocumentId,
      userId: parsed.userId,
    });
  const recoveredEvidence = recoverEvidenceFromCvText(
    evidenceSet.evidence,
    sourceText,
  );
  const snapshot = buildEvidenceSnapshot(evidenceSet.id, recoveredEvidence);
  if (!hasBasicCvEvidence(snapshot)) {
    throw new CvTailoringError(
      "INSUFFICIENT_CANDIDATE_DATA",
      "Not enough verified candidate information exists to build a CV.",
    );
  }
  const evidenceFingerprint = fingerprint({
    evidenceSetId: evidenceSet.id,
    updatedAt: evidenceSet.updatedAt,
    evidence: recoveredEvidence,
    recovery: "cv-text-v1",
  });
  const analysisFingerprint = fingerprint({
    analysisId: analysis.id,
    descriptionFingerprint: analysis.descriptionFingerprint,
    requirements: analysis.requirements,
    extractionPolicyVersion: analysis.extractionPolicyVersion,
  });

  const recommendation = recommendCvMode({
    snapshot,
    requestedMode: parsed.mode ?? null,
  });
  const mode = parsed.mode ?? recommendation.recommendedMode;

  const plan = buildContentPlan({
    mode,
    snapshot,
    requirements: analysis.requirements,
    jobTitle: job.title,
    assessment,
    matchEvidenceIds: match?.matches.flatMap((item) => item.evidence_ids) ?? [],
    requestedMode: parsed.mode ?? null,
  });
  const contentPlanFingerprint = fingerprint(plan);
  const idempotencyKey = fingerprint({
    evidenceFingerprint,
    analysisFingerprint,
    contentPlanFingerprint,
    mode,
    context,
    policyVersion: TAILORING_POLICY_VERSION,
    promptVersion: TAILORING_PROMPT_VERSION,
  });

  const existing = await dependencies.repository.getVariantByIdempotencyKey(
    parsed.userId,
    idempotencyKey,
  );
  if (!parsed.force && existing?.status === "ready") {
    return existing;
  }
  if (!parsed.force && existing?.status === "ready_to_render") {
    return existing;
  }
  if (
    !parsed.force &&
    existing &&
    ["planning", "generating", "validating", "rendering"].includes(
      existing.status,
    )
  ) {
    throw new CvTailoringError(
      "GENERATION_IN_PROGRESS",
      "A CV is already being generated for this job and settings.",
    );
  }

  const now = dependencies.now().toISOString();
  // Reuse the same row for the same idempotency key so force-regenerate
  // does not violate unique(user_id, idempotency_key).
  let variant: CvTailoringVariant = {
    id: existing?.id ?? dependencies.createId(),
    userId: parsed.userId,
    listingId: parsed.listingId,
    jobId: job.job_id,
    jobAnalysisId: analysis.id,
    evidenceSetId: evidenceSet.id,
    mode,
    status: "planning",
    recommendedMode: recommendation.recommendedMode,
    recommendationReason: recommendation.reason,
    tailoringContext: context,
    idempotencyKey,
    evidenceFingerprint,
    analysisFingerprint,
    contentPlanFingerprint,
    policyVersion: TAILORING_POLICY_VERSION,
    promptVersion: TAILORING_PROMPT_VERSION,
    modelId: null,
    inputTokens: null,
    outputTokens: null,
    repairCount: 0,
    generationDurationMs: null,
    evidenceSnapshot: snapshot,
    contentPlan: plan,
    keywordAudit: plan.keywordAudit,
    tailoredContent: null,
    assessment: null,
    validationIssues: [],
    warnings: plan.warnings,
    // Keep prior ready artifact until the new render succeeds.
    artifactStoragePath: existing?.status === "ready" ? existing.artifactStoragePath : null,
    artifactChecksum: existing?.status === "ready" ? existing.artifactChecksum : null,
    artifactPageCount: existing?.status === "ready" ? existing.artifactPageCount : null,
    errorMessage: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  variant = await dependencies.repository.saveVariant(variant);

  const started = Date.now();
  try {
    variant = await dependencies.repository.saveVariant({
      ...variant,
      status: "generating",
      updatedAt: dependencies.now().toISOString(),
    });

    const selectedEvidence = compactSelectedEvidence(snapshot, plan);
    const skillInventory = buildSkillInventory(snapshot).displayNames;
    let draft: GroqResumeDraft | null = null;
    let resume: TailoredResume | null = null;
    let usage: TailoringUsage = {
      modelId: "deterministic",
      inputTokens: null,
      outputTokens: null,
    };

    const tailored = await dependencies.tailorer.tailor({
        jobTitle: job.title,
        company: job.organization_name,
        mode,
        tailoringContext: context,
        requirements: analysis.requirements,
        selectedEvidence,
        keywordAudit: plan.keywordAudit.filter(
          (entry) =>
            entry.support_state === "supported" ||
            entry.support_state === "partial",
        ),
        skillInventory,
        plan,
      });
      draft = tailored.draft;
      usage = tailored.usage;

    variant = await dependencies.repository.saveVariant({
      ...variant,
      status: "validating",
      modelId: usage.modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      updatedAt: dependencies.now().toISOString(),
    });

    let repairCount = 0;

    if (draft) {
      const provisional = assessmentFromGeneration(
        provisionalGenerationAssessment(plan),
        plan.keywordAudit,
      );
      draft = normalizeGroqDraft(draft, snapshot);
      resume = assembleTailoredResume({
        draft,
        snapshot,
        plan,
        assessment: provisional,
      });

      let validation = validateTailoredResume({
        resume,
        plan,
        snapshot,
        keywordAudit: plan.keywordAudit,
      });

      while (!validation.ok && repairCount < MAX_FRAGMENT_REPAIRS) {
        const repairable = validation.issues.filter((issue) => issue.repairable);
        if (repairable.length === 0) break;
        const issue = repairable[0]!;
        const repaired = await repairIssue({
          issuePath: issue.path,
          issueMessage: issue.message,
          draft,
          resume,
          plan,
          snapshot,
          keywordAudit: plan.keywordAudit,
          tailorer: dependencies.tailorer,
        });
        draft = normalizeGroqDraft(repaired.draft, snapshot);
        resume = assembleTailoredResume({
          draft,
          snapshot,
          plan,
          assessment: provisional,
        });
        repairCount += 1;
        variant = {
          ...variant,
          inputTokens: sumNullable(variant.inputTokens, repaired.usage.inputTokens),
          outputTokens: sumNullable(
            variant.outputTokens,
            repaired.usage.outputTokens,
          ),
          repairCount,
        };
        validation = validateTailoredResume({
          resume,
          plan,
          snapshot,
          keywordAudit: plan.keywordAudit,
        });
      }

      if (!validation.ok) {
        throw new CvTailoringError(
          "INVALID_AI_OUTPUT",
          "AI failed to produce a valid CV that meets formatting and constraints."
        );
      } else {
        resume = {
          ...resume,
          assessment: {
            ...resume.assessment,
            factuallyValid: validation.factuallyValid,
            generationStatus: "success",
          },
        };
      }
    }

    if (!resume) {
      throw new CvTailoringError(
        "VALIDATION_FAILED",
        "Unable to produce a factually grounded CV from available evidence.",
      );
    }

    resume = scrubIncompleteProse(resume);

    const density = assessContentDensity({ resume, plan, snapshot });
    const densityWarnings: string[] = [];
    if (density.thin) {
      resume = enrichResumeFromSelectedEvidence({ resume, plan, snapshot });
      resume = scrubIncompleteProse(resume);
      densityWarnings.push(...density.reasons);
      densityWarnings.push(
        "Content density looked thin relative to verified evidence; an enrichment pass reused selected verified facts only.",
      );
    }

    // Keyword usage audit still expects legacy TailoredCvContent shape —
    // keep planned audit (used=false) rather than inventing a legacy adapter.
    const keywordAudit = plan.keywordAudit;
    const generationAssessment = toGenerationAssessmentFromResume(
      resume,
      variant.warnings,
    );
    const warnings = [
      ...new Set([
        ...variant.warnings,
        ...densityWarnings,
      ]),
    ];

    return dependencies.repository.saveVariant({
      ...variant,
      status: "ready_to_render",
      tailoredContent: resume,
      keywordAudit,
      assessment: generationAssessment,
      contentPlan: {
        ...plan,
        assessment: generationAssessment,
      },
      validationIssues: [],
      warnings,
      repairCount,
      generationDurationMs: Date.now() - started,
      // Clear prior artifact so UI does not treat old PDF as this content.
      artifactStoragePath: null,
      artifactChecksum: null,
      artifactPageCount: null,
      errorMessage: null,
      updatedAt: dependencies.now().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof CvTailoringError
        ? error.message
        : "CV tailoring failed. Please try again.";
    try {
      await dependencies.repository.saveVariant({
        ...variant,
        status: "failed",
        errorMessage: message,
        validationIssues: variant.validationIssues,
        generationDurationMs: Date.now() - started,
        updatedAt: dependencies.now().toISOString(),
      });
    } catch {
      // Don't mask the original failure behind a secondary persistence error.
    }
    if (error instanceof CvTailoringError) throw error;
    throw new CvTailoringError("AI_UNAVAILABLE", message, { cause: error });
  }
}

export async function renderTailoredCvVariant(
  command: { userId: string; variantId: string },
  dependencies: {
    repository: CvTailoringRepository;
    renderer: CvPdfRenderer;
    storage: TailoredCvStorage;
    now: Clock;
    jobRepository?: JobDiscoveryRepository;
  },
): Promise<CvTailoringVariant> {
  const variant = await dependencies.repository.getVariant(
    command.userId,
    command.variantId,
  );
  if (!variant) {
    throw new CvTailoringError("NOT_FOUND", "CV variant was not found.");
  }
  if (!variant.tailoredContent) {
    throw new CvTailoringError(
      "INVALID_STATE",
      "CV content must be validated before rendering.",
    );
  }
  if (!isTailoredResume(variant.tailoredContent)) {
    throw new CvTailoringError(
      "INVALID_STATE",
      "Stored CV content is in a legacy format. Regenerate content before rendering.",
    );
  }
  if (variant.status === "ready" && variant.artifactStoragePath) {
    return variant;
  }
  // Allow retry from failed when validated content still exists.
  if (
    variant.status !== "ready_to_render" &&
    !(variant.status === "failed" && variant.tailoredContent)
  ) {
    throw new CvTailoringError(
      "INVALID_STATE",
      "CV content must be validated before rendering.",
    );
  }

  const rendering = await dependencies.repository.saveVariant({
    ...variant,
    status: "rendering",
    updatedAt: dependencies.now().toISOString(),
  });

  let jobTitle = "Role";
  if (dependencies.jobRepository) {
    const jobs = await dependencies.jobRepository.listJobs({
      userId: command.userId,
      includeDismissed: true,
      limit: 100,
      offset: 0,
    });
    jobTitle =
      jobs.find((job) => job.listing_id === variant.listingId)?.title ?? jobTitle;
  }

  try {
    const resume: TailoredResume = {
      ...variant.tailoredContent,
      targetTitle:
        variant.tailoredContent.targetTitle.trim() ||
        variant.contentPlan.targetTitle ||
        jobTitle ||
        "Candidate",
    };
    const rendered = await dependencies.renderer.render({
      mode: variant.mode,
      content: resume,
      resume,
      snapshot: variant.evidenceSnapshot,
      plan: variant.contentPlan,
      jobTitle,
    });
    // Renderer may deterministically reduce content to fit the page budget.
    const finalResume = rendered.resume ?? resume;

    const expectedPages = variant.mode === "one_page" ? 1 : 2;
    const pageWarnings: string[] = [];
    if (rendered.pageCount !== expectedPages) {
      // Prefer delivering a usable PDF over hard-failing on layout overflow.
      pageWarnings.push(
        `Rendered ${rendered.pageCount} page(s); ${expectedPages}-page layout was requested. Content was kept truthful without inventing filler.`,
      );
      if (variant.mode === "one_page" && rendered.pageCount > 1) {
        pageWarnings.push(
          "One-page mode overflowed after compact layout retries. Consider two-page mode or shorter project paragraphs in verified evidence.",
        );
      }
      if (variant.mode === "two_page" && rendered.pageCount > 2) {
        pageWarnings.push(
          "Two-page mode still overflowed after compact layout and content reduction. Trim long project paragraphs in verified evidence, then regenerate.",
        );
      }
    }
    if (finalResume.projects.length < resume.projects.length) {
      pageWarnings.push(
        `Reduced selected projects from ${resume.projects.length} to ${finalResume.projects.length} to fit the ${expectedPages}-page layout.`,
      );
    }
    assertExtractedContent(rendered.extractedText, finalResume);

    const checksum = createHash("sha256").update(rendered.bytes).digest("hex");
    const path = `${variant.userId}/tailored/${variant.id}.pdf`;
    await dependencies.storage.save({
      path,
      bytes: rendered.bytes,
      contentType: "application/pdf",
    });

    return dependencies.repository.saveVariant({
      ...rendering,
      status: "ready",
      tailoredContent: finalResume,
      warnings: [...new Set([...rendering.warnings, ...pageWarnings])],
      artifactStoragePath: path,
      artifactChecksum: checksum,
      artifactPageCount: rendered.pageCount,
      errorMessage: null,
      updatedAt: dependencies.now().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof CvTailoringError
        ? error.message
        : error instanceof Error
          ? `PDF rendering failed: ${error.message}`
          : "PDF rendering failed.";
    // Keep validated content retryable — do not trap the variant in failed.
    await dependencies.repository.saveVariant({
      ...rendering,
      status: "ready_to_render",
      errorMessage: message,
      artifactStoragePath: null,
      artifactChecksum: null,
      artifactPageCount: null,
      updatedAt: dependencies.now().toISOString(),
    });
    if (error instanceof CvTailoringError) throw error;
    throw new CvTailoringError("RENDER_FAILED", message, {
      cause: error,
    });
  }
}

export async function getCvVariant(
  command: { userId: string; variantId: string },
  dependencies: { repository: CvTailoringRepository },
): Promise<CvTailoringVariant> {
  const variant = await dependencies.repository.getVariant(
    command.userId,
    command.variantId,
  );
  if (!variant) {
    throw new CvTailoringError("NOT_FOUND", "CV variant was not found.");
  }
  return variant;
}

export async function listCvVariantsForListing(
  command: { userId: string; listingId: string },
  dependencies: { repository: CvTailoringRepository },
): Promise<CvTailoringVariant[]> {
  return dependencies.repository.listVariantsForListing(
    command.userId,
    command.listingId,
  );
}

export async function listCvVariantsForUser(
  command: {
    userId: string;
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
  },
  dependencies: { repository: CvTailoringRepository },
): Promise<CvTailoringVariant[]> {
  return dependencies.repository.listVariantsForUser(command.userId, {
    statuses: command.statuses,
    limit: command.limit,
  });
}

export async function downloadCvVariant(
  command: { userId: string; variantId: string },
  dependencies: {
    repository: CvTailoringRepository;
    storage: TailoredCvStorage;
  },
): Promise<{ bytes: Uint8Array; filename: string; checksum: string | null }> {
  const variant = await dependencies.repository.getVariant(
    command.userId,
    command.variantId,
  );
  if (!variant || variant.status !== "ready" || !variant.artifactStoragePath) {
    throw new CvTailoringError(
      "INVALID_STATE",
      "This CV is not ready to download.",
    );
  }
  const bytes = await dependencies.storage.read(variant.artifactStoragePath);

  const clean = (str: string) =>
    str.trim().replace(/[^a-zA-Z0-9_-]/gu, "_").replace(/_+/gu, "_");

  const targetTitle =
    variant.tailoredContent?.targetTitle ||
    variant.contentPlan?.targetTitle ||
    "Software_Engineer";

  const isGeneral = targetTitle.toLowerCase().includes("general");
  const roleSlug = clean(targetTitle);

  let filename: string;
  if (isGeneral) {
    filename = `General_CV_${roleSlug}.pdf`;
  } else {
    filename = `CV_${roleSlug}.pdf`;
  }

  return {
    bytes,
    filename,
    checksum: variant.artifactChecksum,
  };
}

export async function recommendModeForListing(
  command: { userId: string; listingId: string },
  dependencies: {
    evidenceRepository: CareerEvidenceRepository;
    careerRepository: CareerIntelligenceRepository;
  },
): Promise<{
  recommendedMode: "one_page" | "two_page";
  reason: string;
  warnings: string[];
}> {
  const evidenceSet = await dependencies.evidenceRepository.getCurrent(
    command.userId,
  );
  if (!evidenceSet || evidenceSet.status !== "verified") {
    throw new CvTailoringError(
      "EVIDENCE_REQUIRED",
      "Verify your career evidence before tailoring a CV.",
    );
  }
  const analysis = await dependencies.careerRepository.getJobAnalysisByListing(
    command.userId,
    command.listingId,
  );
  if (!analysis || analysis.status !== "ready") {
    throw new CvTailoringError(
      "ANALYSIS_REQUIRED",
      "Analyse this job before tailoring a CV.",
    );
  }
  const snapshot = buildEvidenceSnapshot(evidenceSet.id, evidenceSet.evidence);
  return recommendCvMode({ snapshot, requestedMode: null });
}

async function findJob(
  userId: string,
  listingId: string,
  jobRepository: JobDiscoveryRepository,
) {
  const jobs = await jobRepository.listJobs({
    userId,
    includeDismissed: true,
    limit: 500,
    offset: 0,
  });
  const job = jobs.find((item) => item.listing_id === listingId);
  if (!job) {
    throw new CvTailoringError("JOB_NOT_FOUND", "Job listing was not found.");
  }
  return job;
}

function normalizeContext(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > MAX_TAILORING_CONTEXT_CHARS) {
    throw new CvTailoringError(
      "INVALID_INPUT",
      `Tailoring context must be at most ${MAX_TAILORING_CONTEXT_CHARS} characters.`,
    );
  }
  return trimmed;
}

function compactSelectedEvidence(
  snapshot: ReturnType<typeof buildEvidenceSnapshot>,
  plan: ReturnType<typeof buildContentPlan>,
) {
  const selected = new Set([
    ...plan.experienceItemIds,
    ...plan.projectItemIds,
    ...plan.educationItemIds,
    ...plan.skillItemIds,
    ...plan.certificationItemIds,
    ...plan.achievementItemIds,
    ...plan.referenceItemIds,
    "profile",
  ]);
  return {
    items: snapshot.items.filter((item) => selected.has(item.id)),
    facts: snapshot.facts.filter((fact) => selected.has(fact.careerItemId)),
  };
}

async function repairIssue(input: {
  issuePath: string;
  issueMessage: string;
  draft: GroqResumeDraft;
  resume: TailoredResume;
  plan: ReturnType<typeof buildContentPlan>;
  snapshot: ReturnType<typeof buildEvidenceSnapshot>;
  keywordAudit: KeywordAuditEntry[];
  tailorer: CvLanguageTailorer;
}): Promise<{ draft: GroqResumeDraft; usage: TailoringUsage }> {
  if (
    input.issuePath === "summary" ||
    input.issuePath === "targetTitle" ||
    input.issuePath === "projects"
  ) {
    return {
      draft: {
        ...input.draft,
        targetTitle: input.plan.targetTitle,
      },
      usage: emptyUsage(),
    };
  }

  const experienceMatch = input.issuePath.match(/^experience\.(\d+)/u);
  const projectMatch = input.issuePath.match(/^projects\.(\d+)/u);
  const supportedKeywords = input.keywordAudit.filter(
    (entry) =>
      entry.support_state === "supported" || entry.support_state === "partial",
  );

  if (experienceMatch) {
    const index = Number(experienceMatch[1]);
    const item = input.resume.experience[index];
    if (!item) {
      return { draft: input.draft, usage: emptyUsage() };
    }
    const careerItemId = item.id;
    const facts = input.snapshot.facts.filter(
      (fact) => fact.careerItemId === careerItemId,
    );
    try {
      const repaired = await input.tailorer.repairFragment({
        careerItemId,
        kind: "experience",
        facts,
        supportedKeywords,
        validationError: input.issueMessage,
        maxBullets: input.plan.bulletsPerExperience,
        maxChars: input.plan.bulletMaxChars,
      });
      return {
        draft: upsertDraftExperience(input.draft, careerItemId, repaired.bullets),
        usage: repaired.usage,
      };
    } catch {
      return {
        draft: upsertDraftExperience(
          input.draft,
          careerItemId,
          fallbackBulletsFromFacts({
            careerItemId,
            snapshot: input.snapshot,
            maxBullets: input.plan.bulletsPerExperience,
            maxChars: input.plan.bulletMaxChars,
          }),
        ),
        usage: emptyUsage(),
      };
    }
  }

  if (projectMatch) {
    const index = Number(projectMatch[1]);
    const item = input.resume.projects[index];
    if (!item) {
      return { draft: input.draft, usage: emptyUsage() };
    }
    const careerItemId = item.id;
    const facts = input.snapshot.facts.filter(
      (fact) => fact.careerItemId === careerItemId,
    );
    try {
      const repaired = await input.tailorer.repairFragment({
        careerItemId,
        kind: "project",
        facts,
        supportedKeywords,
        validationError: input.issueMessage,
        maxBullets: input.plan.bulletsPerProject,
        maxChars: input.plan.bulletMaxChars,
      });
      return {
        draft: upsertDraftProject(input.draft, careerItemId, repaired.bullets),
        usage: repaired.usage,
      };
    } catch {
      return {
        draft: upsertDraftProject(
          input.draft,
          careerItemId,
          fallbackBulletsFromFacts({
            careerItemId,
            snapshot: input.snapshot,
            maxBullets: input.plan.bulletsPerProject,
            maxChars: input.plan.bulletMaxChars,
          }),
        ),
        usage: emptyUsage(),
      };
    }
  }

  return { draft: input.draft, usage: emptyUsage() };
}

function upsertDraftExperience(
  draft: GroqResumeDraft,
  careerItemId: string,
  bullets: GroqResumeDraft["experience"][number]["bullets"],
): GroqResumeDraft {
  const experience = [...draft.experience];
  const index = experience.findIndex((entry) => entry.id === careerItemId);
  if (index >= 0) {
    experience[index] = { ...experience[index]!, bullets };
  } else {
    experience.push({ id: careerItemId, bullets });
  }
  return { ...draft, experience };
}

function upsertDraftProject(
  draft: GroqResumeDraft,
  careerItemId: string,
  bullets: NonNullable<GroqResumeDraft["projects"][number]["bullets"]>,
): GroqResumeDraft {
  const projects = [...draft.projects];
  const index = projects.findIndex((entry) => entry.id === careerItemId);
  if (index >= 0) {
    projects[index] = {
      ...projects[index]!,
      bullets,
      paragraphs: undefined,
    };
  } else {
    projects.push({
      id: careerItemId,
      technologies: [],
      bullets,
    });
  }
  return { ...draft, projects };
}

function fallbackBulletsFromFacts(input: {
  careerItemId: string;
  snapshot: ReturnType<typeof buildEvidenceSnapshot>;
  maxBullets: number;
  maxChars: number;
}): GroqResumeDraft["experience"][number]["bullets"] {
  const item = input.snapshot.items.find(
    (entry) => entry.id === input.careerItemId,
  );
  if (!item || (item.type !== "work" && item.type !== "project")) return [];
  return item.bullets
    .filter((text) => !looksIncompleteProse(text))
    .slice(0, input.maxBullets)
    .map((text, index) => ({
      text,
      factIds: [`${input.careerItemId}:bullet:${index}`],
    }));
}

function scrubIncompleteProse(resume: TailoredResume): TailoredResume {
  const experience = resume.experience
    .map((role) => ({
      ...role,
      bullets: role.bullets.filter((bullet) => !looksIncompleteProse(bullet.text)),
    }))
    .filter((role) => role.bullets.length > 0);
  const projects = resume.projects
    .map((project) => ({
      ...project,
      paragraphs: project.paragraphs.filter(
        (paragraph) => !looksIncompleteProse(paragraph.text),
      ),
    }))
    .filter((project) => project.paragraphs.length > 0);
  const summary = looksIncompleteProse(resume.summary.text)
    ? {
        ...resume.summary,
        text: "Software professional targeting engineering roles with project and internship experience.",
        source: "verified_evidence" as const,
      }
    : resume.summary;
  return {
    ...resume,
    summary,
    experience,
    projects,
    achievements: resume.achievements.filter(
      (item) => !looksIncompleteProse(item.text),
    ),
  };
}

function provisionalGenerationAssessment(
  plan: ReturnType<typeof buildContentPlan>,
): GenerationAssessment {
  return {
    factually_valid: true,
    job_alignment: plan.jobAlignment,
    supported_keywords: plan.keywordAudit
      .filter(
        (entry) =>
          entry.support_state === "supported" ||
          entry.support_state === "partial",
      )
      .map((entry) => entry.keyword),
    missing_keywords: plan.keywordAudit
      .filter((entry) => entry.support_state === "unsupported")
      .map((entry) => entry.keyword),
    unsupported_claims: [],
    warnings: [],
    generation_status: "success",
  };
}

function toGenerationAssessmentFromResume(
  resume: TailoredResume,
  warnings: string[],
): GenerationAssessment {
  const status = resume.assessment.generationStatus;
  const generationStatus =
    status === "success" ||
    status === "success_with_fallback" ||
    status === "failed"
      ? status
      : "success";

  return {
    factually_valid: resume.assessment.factuallyValid,
    job_alignment: resume.assessment.jobAlignment,
    supported_keywords: resume.assessment.supportedKeywords,
    missing_keywords: resume.assessment.missingKeywords,
    unsupported_claims: [],
    warnings,
    generation_status: generationStatus,
  };
}

function assertExtractedContent(text: string, resume: TailoredResume): void {
  const lower = text.toLocaleLowerCase();

  if (
    resume.contact.fullName &&
    !lower.includes(resume.contact.fullName.toLocaleLowerCase())
  ) {
    throw new CvTailoringError(
      "RENDER_FAILED",
      "Rendered PDF is missing the candidate name.",
    );
  }

  if (
    resume.targetTitle &&
    !lower.includes(resume.targetTitle.toLocaleLowerCase())
  ) {
    throw new CvTailoringError(
      "RENDER_FAILED",
      "Rendered PDF is missing the target title.",
    );
  }

  if (resume.summary?.text && !lower.includes("professional summary")) {
    throw new CvTailoringError(
      "RENDER_FAILED",
      "Rendered PDF is missing the Professional Summary section.",
    );
  }

  if (resume.skills.length > 0 && !lower.includes("technical skills")) {
    throw new CvTailoringError(
      "RENDER_FAILED",
      "Rendered PDF is missing the Technical Skills section.",
    );
  }

  for (const project of resume.projects) {
    if (!text.includes(project.name)) {
      throw new CvTailoringError(
        "RENDER_FAILED",
        "Rendered PDF is missing a selected project.",
      );
    }
  }

  for (const experience of resume.experience) {
    if (!text.includes(experience.employer)) {
      throw new CvTailoringError(
        "RENDER_FAILED",
        "Rendered PDF is missing a selected employer.",
      );
    }
  }
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function emptyUsage(): TailoringUsage {
  return { modelId: "none", inputTokens: null, outputTokens: null };
}
