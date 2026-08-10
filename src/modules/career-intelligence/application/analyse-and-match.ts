import { z } from "zod";

import { mapWithConcurrency } from "@/lib/concurrency";
import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";

import { normalizeJobDescription } from "../domain/description-normalize";
import { CareerIntelligenceError } from "../domain/errors";
import { buildMatchExplanation } from "../domain/explanations";
import {
  classifyExtractionError,
  EXTRACTION_USER_MESSAGES,
  type ExtractionFailureCategory,
} from "../domain/extraction-errors";
import { fingerprint } from "../domain/fingerprint";
import {
  matchRequirementsDeterministically,
  validateMatchReferences,
} from "../domain/matching";
import {
  EXTRACTION_POLICY_VERSION,
  MATCHING_POLICY_VERSION,
  SCORING_POLICY_VERSION,
} from "../domain/policy";
import { evaluateHardConstraints } from "../domain/ranking";
import {
  assessDescriptionQuality,
  classifyCareerLevelSuitability,
  computeAnalysisConfidence,
  computeEvidenceFitScore,
} from "../domain/scoring";
import {
  extractedJobAnalysisSchema,
  jobRequirementSchema,
  type JobRequirement,
  type RequirementMatch,
} from "../domain/schemas";
import { EXTRACTION_SCHEMA_VERSION } from "../domain/strict-extraction-schema";
import { assessCareerStageForUser } from "./assess-career-stage";
import type {
  CachedRequirementExtraction,
  CareerIntelligenceRepository,
  Clock,
  IdGenerator,
  JobAnalysis,
  JobMatchAnalysis,
  JobRequirementExtractor,
  RequirementMatcher,
} from "./ports";

/** In-flight extraction dedupe within a single Node process. */
const inflightExtractions = new Map<string, Promise<CachedRequirementExtraction>>();

const analyseCommandSchema = z.object({
  userId: z.uuid(),
  listingId: z.uuid(),
  force: z.boolean().default(false),
});

const matchCommandSchema = z.object({
  userId: z.uuid(),
  listingId: z.uuid(),
  force: z.boolean().default(false),
});

const batchSchema = z.object({
  userId: z.uuid(),
  listingIds: z.array(z.uuid()).min(1).max(20),
  force: z.boolean().default(false),
});

export type AnalyseJobRequirementsCommand = z.input<typeof analyseCommandSchema>;
export type MatchJobToVerifiedEvidenceCommand = z.input<typeof matchCommandSchema>;
export type AnalyseAndMatchJobCommand = z.input<typeof matchCommandSchema>;
export type AnalyseAndMatchBatchCommand = z.input<typeof batchSchema>;

export async function analyseJobRequirements(
  command: AnalyseJobRequirementsCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    extractor: JobRequirementExtractor;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<JobAnalysis> {
  const parsed = analyseCommandSchema.parse(command);
  const job = await findJob(parsed.userId, parsed.listingId, dependencies.jobRepository);
  const normalizedDescription = normalizeJobDescription(job.description);
  const descriptionFingerprint = fingerprint({
    title: job.title,
    description: normalizedDescription,
  });
  const descriptionHash = fingerprint(normalizedDescription);
  const existing = await dependencies.repository.getJobAnalysisByListing(
    parsed.userId,
    parsed.listingId,
  );
  if (
    !parsed.force &&
    existing &&
    existing.descriptionFingerprint === descriptionFingerprint &&
    existing.extractionPolicyVersion === EXTRACTION_POLICY_VERSION &&
    existing.status === "ready"
  ) {
    return existing;
  }

  const quality = assessDescriptionQuality(normalizedDescription);
  const now = dependencies.now().toISOString();
  if (quality === "unusable" || !normalizedDescription) {
    const cached = await persistNegativeExtractionCache({
      jobId: job.job_id,
      descriptionHash,
      createId: dependencies.createId,
      now,
      repository: dependencies.repository,
    });
    return dependencies.repository.saveJobAnalysis({
      id: existing?.id ?? dependencies.createId(),
      userId: parsed.userId,
      jobId: job.job_id,
      listingId: job.listing_id,
      descriptionFingerprint,
      descriptionQuality: quality,
      opportunityBand: "unknown",
      opportunityConfidence: "low",
      opportunityReasons: [
        "Job description is missing or too short to analyse safely.",
      ],
      extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
      status: "not_analysable",
      warnings: [
        "Description quality is unusable.",
        `extraction_cache:${cached.id}`,
      ],
      requirements: [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const cached = await getOrExtractRequirements({
    jobId: job.job_id,
    title: job.title,
    normalizedDescription,
    descriptionHash,
    force: parsed.force,
    dependencies,
  });

  if (cached.status === "insufficient_description") {
    return dependencies.repository.saveJobAnalysis({
      id: existing?.id ?? dependencies.createId(),
      userId: parsed.userId,
      jobId: job.job_id,
      listingId: job.listing_id,
      descriptionFingerprint,
      descriptionQuality: quality,
      opportunityBand: "unknown",
      opportunityConfidence: "low",
      opportunityReasons: cached.opportunityReasons,
      extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
      status: "not_analysable",
      warnings: cached.warnings,
      requirements: [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const descriptionLower = normalizedDescription.toLocaleLowerCase();
  // Always mint fresh requirement IDs per listing. The shared extraction cache
  // reuses content across vacancies; job_requirements.id is globally unique.
  const requirements = cached.requirements
    .map((requirement) =>
      jobRequirementSchema.parse({
        ...requirement,
        id: dependencies.createId(),
      }),
    )
    .filter((requirement) => {
      const quote = requirement.source_quote.trim().toLocaleLowerCase();
      if (!quote) return false;
      if (descriptionLower.includes(quote.slice(0, 40))) return true;
      const statement = requirement.statement.trim().toLocaleLowerCase();
      return statement.length >= 3 && descriptionLower.includes(statement);
    });
  const deduped = dedupeRequirements(requirements);

  return dependencies.repository.saveJobAnalysis({
    id: existing?.id ?? dependencies.createId(),
    userId: parsed.userId,
    jobId: job.job_id,
    listingId: job.listing_id,
    descriptionFingerprint,
    descriptionQuality: quality,
    opportunityBand: cached.opportunityBand,
    opportunityConfidence: cached.opportunityConfidence,
    opportunityReasons: cached.opportunityReasons,
    extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    status: deduped.length === 0 ? "failed" : "ready",
    warnings: [
      ...cached.warnings,
      ...(deduped.length === 0
        ? ["No atomic requirements could be validated from the description."]
        : []),
    ],
    requirements: deduped,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function matchJobToVerifiedEvidence(
  command: MatchJobToVerifiedEvidenceCommand,
  dependencies: {
    evidenceRepository: CareerEvidenceRepository;
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    matcher: RequirementMatcher;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<JobMatchAnalysis> {
  const parsed = matchCommandSchema.parse(command);
  const evidenceSet = await dependencies.evidenceRepository.getCurrent(
    parsed.userId,
  );
  if (!evidenceSet || evidenceSet.status !== "verified") {
    throw new CareerIntelligenceError(
      "EVIDENCE_REQUIRED",
      "Verify career evidence before matching jobs.",
    );
  }
  const profile = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  if (!profile) {
    throw new CareerIntelligenceError(
      "PREFERENCES_REQUIRED",
      "Job-search preferences are required before matching.",
    );
  }
  // Matching needs a real career-stage assessment. Preference-only plan anchors
  // are placeholders and must not block Analyse.
  let assessment =
    await dependencies.repository.getLatestCareerStageAssessment(parsed.userId);
  if (!assessment || assessment.evidenceFingerprint === "preferences-only") {
    assessment = await assessCareerStageForUser(
      { userId: parsed.userId, force: true },
      dependencies,
    );
  }
  const analysis = await dependencies.repository.getJobAnalysisByListing(
    parsed.userId,
    parsed.listingId,
  );
  if (!analysis || analysis.status !== "ready") {
    throw new CareerIntelligenceError(
      "ANALYSIS_REQUIRED",
      "Analyse the job description before matching verified evidence.",
    );
  }

  const job = await findJob(
    parsed.userId,
    parsed.listingId,
    dependencies.jobRepository,
  );
  const evidenceFingerprint = fingerprint({
    evidenceSetId: evidenceSet.id,
    updatedAt: evidenceSet.updatedAt,
    evidence: evidenceSet.evidence,
  });
  const preferencesFingerprint = fingerprint(profile.preferences);
  const existing = await dependencies.repository.getMatchAnalysisByListing(
    parsed.userId,
    parsed.listingId,
  );
  if (
    !parsed.force &&
    existing &&
    existing.status === "current" &&
    existing.evidenceFingerprint === evidenceFingerprint &&
    existing.preferencesFingerprint === preferencesFingerprint &&
    existing.descriptionFingerprint === analysis.descriptionFingerprint &&
    existing.scoringPolicyVersion === SCORING_POLICY_VERSION &&
    existing.matchingPolicyVersion === MATCHING_POLICY_VERSION &&
    existing.careerStageAssessmentId === assessment.id
  ) {
    return existing;
  }

  const deterministic = matchRequirementsDeterministically({
    requirements: analysis.requirements,
    evidence: evidenceSet.evidence,
    internshipMonths: assessment.experienceSummary.internshipMonths,
    employmentMonths: assessment.experienceSummary.employmentMonths,
  });
  const classifiedIds = new Set(deterministic.map((item) => item.requirement_id));
  const unclassified = analysis.requirements
    .map((item) => item.id)
    .filter((id) => !classifiedIds.has(id));

  let aiMatches: RequirementMatch[] = [];
  if (unclassified.length > 0) {
    try {
      aiMatches = await dependencies.matcher.classify({
        requirements: analysis.requirements,
        evidence: evidenceSet.evidence,
        unclassifiedRequirementIds: unclassified,
      });
    } catch (error) {
      aiMatches = unclassified.map((requirementId) => ({
        requirement_id: requirementId,
        status: "unknown" as const,
        evidence_ids: [],
        reason:
          "Semantic matching was unavailable; requirement left as unknown.",
        confidence: "low" as const,
        classifier: "ai_assisted" as const,
      }));
      void error;
    }
  }

  const evidenceIds = collectEvidenceIds(evidenceSet.evidence);
  const requirementIds = new Set(analysis.requirements.map((item) => item.id));
  const validated = validateMatchReferences({
    matches: [...deterministic, ...aiMatches],
    requirementIds,
    evidenceIds,
  });
  const complete = ensureEveryRequirementMatched(
    analysis.requirements,
    validated,
  );

  const score = computeEvidenceFitScore({
    requirements: analysis.requirements,
    matches: complete,
  });
  const hard = evaluateHardConstraints({
    excludedKeywords: profile.preferences.excluded_keywords,
    experienceLevels: profile.preferences.experience_levels,
    title: job.title,
    employmentType: job.employment_type,
    preferredEmploymentTypes: profile.preferences.employment_types,
  });
  const careerLevel = classifyCareerLevelSuitability({
    assessment,
    opportunityBand: analysis.opportunityBand,
    preferencesForceAlignment:
      assessment.preferenceOverrides.some(
        (item) => item.kind === "explicit_internship_preference",
      ) && analysis.opportunityBand === "internship_ready",
  });
  const confidence = computeAnalysisConfidence({
    descriptionQuality: analysis.descriptionQuality,
    score,
    requirementCount: analysis.requirements.length,
  });
  const explanation = buildMatchExplanation({
    title: job.title,
    company: job.organization_name,
    score,
    careerLevel,
    confidence,
    requirements: analysis.requirements,
    matches: complete,
    hardConstraintReasons: hard.reasons,
  });

  const now = dependencies.now().toISOString();

  return dependencies.repository.saveMatchAnalysis({
    id: existing?.id ?? dependencies.createId(),
    userId: parsed.userId,
    jobAnalysisId: analysis.id,
    listingId: parsed.listingId,
    jobId: job.job_id,
    careerStageAssessmentId: assessment.id,
    evidenceFingerprint,
    preferencesFingerprint,
    descriptionFingerprint: analysis.descriptionFingerprint,
    evidenceFitScore: score.evidence_fit_score,
    careerLevel,
    hardConstraintEligible: hard.eligible,
    hardConstraintReasons: hard.reasons,
    analysisConfidence: confidence,
    scoringPolicyVersion: SCORING_POLICY_VERSION,
    matchingPolicyVersion: MATCHING_POLICY_VERSION,
    scoreBreakdown: score,
    explanation,
    status: "current",
    matches: complete,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function analyseAndMatchJob(
  command: AnalyseAndMatchJobCommand,
  dependencies: {
    evidenceRepository: CareerEvidenceRepository;
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    extractor: JobRequirementExtractor;
    matcher: RequirementMatcher;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<{ analysis: JobAnalysis; match: JobMatchAnalysis | null }> {
  const analysis = await analyseJobRequirements(command, dependencies);
  if (analysis.status !== "ready") {
    return { analysis, match: null };
  }
  const match = await matchJobToVerifiedEvidence(command, dependencies);
  return { analysis, match };
}

export type AnalyseBatchItemResult = {
  listingId: string;
  analysis?: JobAnalysis;
  match: JobMatchAnalysis | null;
  error?: string;
  errorCategory?: ExtractionFailureCategory;
  cacheHit?: boolean;
};

export async function analyseAndMatchBatch(
  command: AnalyseAndMatchBatchCommand,
  dependencies: {
    evidenceRepository: CareerEvidenceRepository;
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    extractor: JobRequirementExtractor;
    matcher: RequirementMatcher;
    createId: IdGenerator;
    now: Clock;
    extractionConcurrency?: number;
  },
): Promise<AnalyseBatchItemResult[]> {
  const parsed = batchSchema.parse(command);
  const runId = dependencies.createId().slice(0, 8);
  const started = Date.now();
  const concurrency = Math.max(1, dependencies.extractionConcurrency ?? 2);

  const jobs = await dependencies.jobRepository.listJobs({
    userId: parsed.userId,
    includeDismissed: true,
    limit: 200,
    offset: 0,
  });
  const byListing = new Map(jobs.map((job) => [job.listing_id, job]));

  type WorkItem = {
    listingId: string;
    job: DiscoveredJob;
    descriptionHash: string;
  };
  const work: WorkItem[] = [];
  const resultsByListing = new Map<string, AnalyseBatchItemResult>();

  for (const listingId of parsed.listingIds) {
    const job = byListing.get(listingId);
    if (!job) {
      resultsByListing.set(listingId, {
        listingId,
        match: null,
        error: EXTRACTION_USER_MESSAGES.analysis_failed,
        errorCategory: "analysis_failed",
      });
      continue;
    }
    work.push({
      listingId,
      job,
      descriptionHash: fingerprint(normalizeJobDescription(job.description)),
    });
  }

  // Unique hashes → one extraction shared across duplicate descriptions.
  const byHash = new Map<string, WorkItem[]>();
  for (const item of work) {
    const list = byHash.get(item.descriptionHash) ?? [];
    list.push(item);
    byHash.set(item.descriptionHash, list);
  }

  let cacheHits = 0;
  let cacheMisses = 0;
  const extractionErrors = new Map<string, { category: ExtractionFailureCategory; message: string }>();

  await mapWithConcurrency([...byHash.keys()], concurrency, async (descriptionHash) => {
    const group = byHash.get(descriptionHash) ?? [];
    const sample = group[0];
    if (!sample) return;

    const before = await dependencies.repository.getRequirementExtraction({
      descriptionHash,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    });
    if (before && !parsed.force) {
      cacheHits += 1;
      return;
    }

    cacheMisses += 1;
    try {
      await getOrExtractRequirements({
        jobId: sample.job.job_id,
        title: sample.job.title,
        normalizedDescription: normalizeJobDescription(sample.job.description),
        descriptionHash,
        force: parsed.force,
        dependencies,
      });
    } catch (error) {
      const category = classifyExtractionError(error);
      extractionErrors.set(descriptionHash, {
        category,
        message:
          error instanceof CareerIntelligenceError
            ? error.message
            : EXTRACTION_USER_MESSAGES[category],
      });
    }
  });

  // Persist per-listing analyses + deterministic/AI matching (extractions already done).
  for (const item of work) {
    const extractError = extractionErrors.get(item.descriptionHash);
    if (extractError) {
      resultsByListing.set(item.listingId, {
        listingId: item.listingId,
        match: null,
        error: extractError.message,
        errorCategory: extractError.category,
        cacheHit: false,
      });
      continue;
    }
    try {
      const cached = await dependencies.repository.getRequirementExtraction({
        descriptionHash: item.descriptionHash,
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
        extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
      });
      const result = await analyseAndMatchJob(
        {
          userId: parsed.userId,
          listingId: item.listingId,
          // Extraction already warmed; never force a second provider call here.
          force: false,
        },
        dependencies,
      );
      if (result.analysis.status === "not_analysable") {
        resultsByListing.set(item.listingId, {
          listingId: item.listingId,
          ...result,
          error: EXTRACTION_USER_MESSAGES.insufficient_description,
          errorCategory: "insufficient_description",
          cacheHit: Boolean(cached),
        });
        continue;
      }
      if (!result.match) {
        resultsByListing.set(item.listingId, {
          listingId: item.listingId,
          ...result,
          error: "Requirements were extracted, but matching failed.",
          errorCategory: "analysis_failed",
          cacheHit: Boolean(cached),
        });
        continue;
      }
      resultsByListing.set(item.listingId, {
        listingId: item.listingId,
        ...result,
        cacheHit: Boolean(cached),
      });
    } catch (error) {
      const category = classifyExtractionError(error);
      resultsByListing.set(item.listingId, {
        listingId: item.listingId,
        match: null,
        error:
          error instanceof CareerIntelligenceError
            ? error.message
            : EXTRACTION_USER_MESSAGES[category],
        errorCategory: category,
      });
    }
  }

  const ordered = parsed.listingIds.map(
    (listingId) =>
      resultsByListing.get(listingId) ?? {
        listingId,
        match: null,
        error: EXTRACTION_USER_MESSAGES.analysis_failed,
        errorCategory: "analysis_failed" as const,
      },
  );
  const ok = ordered.filter((item) => item.match).length;
  const failed = ordered.length - ok;
  console.info(
    `[analyse-run ${runId}] listings=${ordered.length} uniqueHashes=${byHash.size} cacheHits=${cacheHits} cacheMisses=${cacheMisses} ok=${ok} failed=${failed} concurrency=${concurrency} durationMs=${Date.now() - started}`,
  );
  return ordered;
}

async function findJob(
  userId: string,
  listingId: string,
  jobRepository: JobDiscoveryRepository,
): Promise<DiscoveredJob> {
  const jobs = await jobRepository.listJobs({
    userId,
    includeDismissed: true,
    limit: 200,
    offset: 0,
  });
  const job = jobs.find((item) => item.listing_id === listingId);
  if (!job) {
    throw new CareerIntelligenceError(
      "JOB_NOT_FOUND",
      "That discovered job was not found for the current user.",
    );
  }
  return job;
}

function dedupeRequirements(requirements: JobRequirement[]): JobRequirement[] {
  const seen = new Set<string>();
  const result: JobRequirement[] = [];
  for (const requirement of requirements) {
    const key = `${requirement.category}:${requirement.statement.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(requirement);
  }
  return result;
}

function collectEvidenceIds(evidence: CareerEvidence): Set<string> {
  return new Set([
    ...evidence.work_experience.map((item) => item.id),
    ...evidence.projects.map((item) => item.id),
    ...evidence.skills.map((item) => item.id),
    ...evidence.education.map((item) => item.id),
    ...evidence.certifications.map((item) => item.id),
  ]);
}

async function getOrExtractRequirements(input: {
  jobId: string;
  title: string;
  normalizedDescription: string;
  descriptionHash: string;
  force: boolean;
  dependencies: {
    repository: CareerIntelligenceRepository;
    extractor: JobRequirementExtractor;
    createId: IdGenerator;
    now: Clock;
  };
}): Promise<CachedRequirementExtraction> {
  const cacheKey = `${input.descriptionHash}:${EXTRACTION_SCHEMA_VERSION}:${EXTRACTION_POLICY_VERSION}`;
  if (!input.force) {
    const existing = await input.dependencies.repository.getRequirementExtraction({
      descriptionHash: input.descriptionHash,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    });
    if (existing) return existing;
  }

  const inflight = inflightExtractions.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const requirementIds = Array.from({ length: 20 }, () =>
      input.dependencies.createId(),
    );
    const extracted = extractedJobAnalysisSchema.parse(
      await input.dependencies.extractor.extract({
        title: input.title,
        description: input.normalizedDescription,
        requirementIds,
      }),
    );
    const now = input.dependencies.now().toISOString();
    const model =
      "lastStats" in input.dependencies.extractor
        ? (input.dependencies.extractor as { lastStats?: { model?: string } | null })
            .lastStats?.model ?? null
        : null;
    return input.dependencies.repository.saveRequirementExtraction({
      id: input.dependencies.createId(),
      jobId: input.jobId,
      descriptionHash: input.descriptionHash,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
      status: "ready",
      opportunityBand: extracted.opportunity_band,
      opportunityConfidence: extracted.opportunity_confidence,
      opportunityReasons: extracted.opportunity_reasons,
      requirements: extracted.requirements,
      warnings: extracted.warnings,
      model,
      lastErrorCategory: null,
      extractedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  })();

  inflightExtractions.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflightExtractions.delete(cacheKey);
  }
}

async function persistNegativeExtractionCache(input: {
  jobId: string;
  descriptionHash: string;
  createId: IdGenerator;
  now: string;
  repository: CareerIntelligenceRepository;
}): Promise<CachedRequirementExtraction> {
  const existing = await input.repository.getRequirementExtraction({
    descriptionHash: input.descriptionHash,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
  });
  if (existing) return existing;
  return input.repository.saveRequirementExtraction({
    id: input.createId(),
    jobId: input.jobId,
    descriptionHash: input.descriptionHash,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    status: "insufficient_description",
    opportunityBand: "unknown",
    opportunityConfidence: "low",
    opportunityReasons: [
      "Job description is missing or too short to analyse safely.",
    ],
    requirements: [],
    warnings: ["Description quality is unusable."],
    model: null,
    lastErrorCategory: "insufficient_description",
    extractedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

function ensureEveryRequirementMatched(
  requirements: JobRequirement[],
  matches: RequirementMatch[],
): RequirementMatch[] {
  const byId = new Map(matches.map((item) => [item.requirement_id, item]));
  return requirements.map((requirement) => {
    const existing = byId.get(requirement.id);
    if (existing) return existing;
    return {
      requirement_id: requirement.id,
      status: "unknown",
      evidence_ids: [],
      reason: "No classification was produced for this requirement.",
      confidence: "low",
      classifier: "deterministic",
    };
  });
}
