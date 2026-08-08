import { z } from "zod";

import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";

import { CareerIntelligenceError } from "../domain/errors";
import { buildMatchExplanation } from "../domain/explanations";
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
import type {
  CareerIntelligenceRepository,
  Clock,
  IdGenerator,
  JobAnalysis,
  JobMatchAnalysis,
  JobRequirementExtractor,
  RequirementMatcher,
} from "./ports";

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
  const descriptionFingerprint = fingerprint({
    title: job.title,
    description: job.description,
  });
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

  const quality = assessDescriptionQuality(job.description);
  const now = dependencies.now().toISOString();
  if (quality === "unusable" || !job.description) {
    return dependencies.repository.saveJobAnalysis({
      id: existing?.id ?? dependencies.createId(),
      userId: parsed.userId,
      jobId: job.job_id,
      listingId: job.listing_id,
      descriptionFingerprint,
      descriptionQuality: quality,
      opportunityBand: "unknown",
      opportunityConfidence: "low",
      opportunityReasons: ["Job description is missing or too short to analyse safely."],
      extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
      status: "not_analysable",
      warnings: ["Description quality is unusable."],
      requirements: [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const requirementIds = Array.from({ length: 40 }, () => dependencies.createId());
  let extracted;
  try {
    extracted = extractedJobAnalysisSchema.parse(
      await dependencies.extractor.extract({
        title: job.title,
        description: job.description,
        requirementIds,
      }),
    );
  } catch (error) {
    throw new CareerIntelligenceError(
      "INVALID_AI_OUTPUT",
      "Job requirements could not be extracted safely from the description.",
      { cause: error },
    );
  }

  const description = job.description;
  const requirements = extracted.requirements
    .map((requirement) =>
      jobRequirementSchema.parse({
        ...requirement,
        id: requirementIds.includes(requirement.id)
          ? requirement.id
          : dependencies.createId(),
      }),
    )
    .filter((requirement) =>
      description.toLocaleLowerCase().includes(
        requirement.source_quote.trim().toLocaleLowerCase().slice(0, 40),
      ),
    );

  const deduped = dedupeRequirements(requirements);

  return dependencies.repository.saveJobAnalysis({
    id: existing?.id ?? dependencies.createId(),
    userId: parsed.userId,
    jobId: job.job_id,
    listingId: job.listing_id,
    descriptionFingerprint,
    descriptionQuality: quality,
    opportunityBand: extracted.opportunity_band,
    opportunityConfidence: extracted.opportunity_confidence,
    opportunityReasons: extracted.opportunity_reasons,
    extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
    status: deduped.length === 0 ? "failed" : "ready",
    warnings: [
      ...extracted.warnings,
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
  const assessment =
    await dependencies.repository.getLatestCareerStageAssessment(parsed.userId);
  if (!assessment) {
    throw new CareerIntelligenceError(
      "INVALID_INPUT",
      "Assess career stage before matching jobs.",
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

  const evidenceIds = new Set(assessment.evidenceIds);
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
  },
): Promise<
  Array<{
    listingId: string;
    analysis?: JobAnalysis;
    match: JobMatchAnalysis | null;
    error?: string;
  }>
> {
  const parsed = batchSchema.parse(command);
  const results: Array<{
    listingId: string;
    analysis?: JobAnalysis;
    match: JobMatchAnalysis | null;
    error?: string;
  }> = [];
  for (const listingId of parsed.listingIds) {
    try {
      const result = await analyseAndMatchJob(
        { userId: parsed.userId, listingId, force: parsed.force },
        dependencies,
      );
      if (result.analysis.status === "not_analysable") {
        results.push({
          listingId,
          ...result,
          error:
            "Job description is missing or too short to analyse. Prefer listings with a description, or re-run Find jobs so LinkedIn details can be enriched.",
        });
        continue;
      }
      if (!result.match) {
        results.push({
          listingId,
          ...result,
          error: "Requirements were extracted, but matching failed.",
        });
        continue;
      }
      results.push({ listingId, ...result });
    } catch (error) {
      results.push({
        listingId,
        match: null,
        error:
          error instanceof CareerIntelligenceError
            ? error.message
            : "Analysis failed for this listing.",
      });
    }
  }
  return results;
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
