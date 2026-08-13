import { z } from "zod";

import { ensureConversationDraft } from "@/modules/career-evidence/application/ensure-conversation-draft";
import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";
import type { JobSource } from "@/modules/job-discovery/application/ports";
import {
  jobSearchCriteriaSchema,
  isJobTitleIncompatibleWithPreferences,
  normalizedExternalJobSchema,
} from "@/modules/job-discovery/domain/job";
import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";
import { jobMatchesLocationPreferences } from "@/modules/job-discovery/domain/location-match";
import { emptyCareerEvidence } from "@/modules/onboarding/domain/conversation-machine";

import { CareerIntelligenceError } from "../domain/errors";
import { fingerprint } from "../domain/fingerprint";
import {
  CAREER_STAGE_POLICY_VERSION,
  DEFAULT_SEARCH_QUERY_BUDGET,
  escoPolicyFingerprint,
} from "../domain/policy";
import { expandSearchTitles } from "./expand-search-titles";
import type {
  CareerIntelligenceRepository,
  Clock,
  EscoOccupationResolver,
  IdGenerator,
  JobSearchPlan,
  PersistedCareerStageAssessment,
} from "./ports";

const createPlanSchema = z.object({
  userId: z.uuid(),
  assessmentId: z.uuid().optional(),
  queryBudget: z.number().int().min(1).max(8).default(DEFAULT_SEARCH_QUERY_BUDGET),
  force: z.boolean().default(false),
  excludedTitles: z.array(z.string().trim().min(1)).max(20).default([]),
});

const executePlanSchema = z.object({
  userId: z.uuid(),
  planId: z.uuid().optional(),
  pageSize: z.number().int().min(1).max(20).default(10),
});

const searchForJobsSchema = z.object({
  userId: z.uuid(),
  pageSize: z.number().int().min(1).max(20).default(10),
  queryBudget: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(DEFAULT_SEARCH_QUERY_BUDGET),
  excludedTitles: z.array(z.string().trim().min(1)).max(20).default([]),
});

export type CreateCareerAwareSearchPlanCommand = z.input<typeof createPlanSchema>;
export type ExecuteCareerAwareJobSearchCommand = z.input<typeof executePlanSchema>;
export type SearchForJobsCommand = z.input<typeof searchForJobsSchema>;

export type EnsureSearchPlanResult = {
  plan: JobSearchPlan;
  regenerated: boolean;
  softNotice: string | null;
  alsoSearchFor: string[];
};

/**
 * Ensure a usable search plan exists for the latest preferences + ESCO titles.
 * Verified career evidence is not used for title expansion.
 */
export async function ensureJobSearchPlan(
  command: CreateCareerAwareSearchPlanCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    evidenceRepository?: CareerEvidenceRepository;
    escoResolver: EscoOccupationResolver;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<EnsureSearchPlanResult> {
  const parsed = createPlanSchema.parse(command);
  const profile = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  if (!profile || profile.preferences.roles.length === 0) {
    throw new CareerIntelligenceError(
      "PREFERENCES_REQUIRED",
      "Set a few job preferences so Zeno knows what to look for.",
    );
  }

  const preferencesFingerprint = fingerprint(profile.preferences);
  const preferenceRevision = profile.preferenceRevision;
  const evidenceFingerprint = escoPolicyFingerprint();
  const profileRevision = 0;

  let assessment =
    parsed.assessmentId
      ? await dependencies.repository.getCareerStageAssessmentById(
          parsed.assessmentId,
          parsed.userId,
        )
      : await dependencies.repository.getLatestCareerStageAssessment(
          parsed.userId,
        );

  // Lightweight assessment anchor so older DBs requiring assessment id can save.
  assessment = await ensurePreferenceOnlyAssessmentAnchor({
    userId: parsed.userId,
    preferencesFingerprint,
    existing: assessment,
    evidenceRepository: dependencies.evidenceRepository,
    repository: dependencies.repository,
    createId: dependencies.createId,
    now: dependencies.now,
  });

  const existing = await dependencies.repository.getLatestSearchPlan(
    parsed.userId,
  );
  if (
    !parsed.force &&
    existing &&
    existing.generationStatus === "ready" &&
    existing.preferencesFingerprint === preferencesFingerprint &&
    existing.evidenceFingerprint === evidenceFingerprint &&
    existing.preferenceRevision === preferenceRevision &&
    existing.profileRevision === profileRevision &&
    existing.queryBudget === parsed.queryBudget &&
    parsed.excludedTitles.length === 0
  ) {
    return {
      plan: existing,
      regenerated: false,
      softNotice: null,
      alsoSearchFor: alsoSearchTitles(existing),
    };
  }

  const expanded = await expandSearchTitles({
    roles: profile.preferences.roles,
    budget: parsed.queryBudget,
    resolver: dependencies.escoResolver,
    opportunityBand: assessment?.targetOpportunityBands[0] ?? "early_career",
    excludedTitles: parsed.excludedTitles,
  });
  if (expanded.titles.length === 0) {
    throw new CareerIntelligenceError(
      "INVALID_INPUT",
      "No valid search titles could be generated from the current preferences.",
    );
  }

  const softNotice =
    expanded.notices.length > 0 ? expanded.notices.join(" ") : null;

  const now = dependencies.now().toISOString();
  const planId = dependencies.createId();
  const planRevision = (existing?.planRevision ?? 0) + 1;
  const reasons = [
    "Prepared using your saved job preferences and ESCO occupation titles.",
    `Generated ${expanded.titles.length} search queries.`,
  ];
  if (softNotice) reasons.push(softNotice);

  try {
    const plan = await dependencies.repository.saveSearchPlan({
      plan: {
        id: planId,
        userId: parsed.userId,
        careerStageAssessmentId: assessment?.id ?? null,
        preferencesFingerprint,
        evidenceFingerprint,
        queryBudget: parsed.queryBudget,
        status: "draft",
        generationStatus: "ready",
        preferenceRevision,
        profileRevision,
        planRevision,
        reasons,
        createdAt: now,
        updatedAt: now,
      },
      queries: expanded.titles.map((title, index) => ({
        id: dependencies.createId(),
        roleFamily: title.familyLabel,
        queryText: title.title,
        opportunityBand: title.opportunityBand,
        priority: index + 1,
        reason: title.reason,
        source: title.source,
        executionStatus: "pending" as const,
        createdAt: now,
      })),
    });
    return {
      plan,
      regenerated: true,
      softNotice,
      alsoSearchFor: alsoSearchTitles(plan),
    };
  } catch (error) {
    if (existing && existing.generationStatus === "ready") {
      return {
        plan: existing,
        regenerated: false,
        softNotice:
          "Zeno could not refresh the latest job search setup, so the previous one was kept.",
        alsoSearchFor: alsoSearchTitles(existing),
      };
    }
    throw error;
  }
}

/** @deprecated Prefer ensureJobSearchPlan — kept for existing callers/tests. */
export async function createCareerAwareSearchPlan(
  command: CreateCareerAwareSearchPlanCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    evidenceRepository?: CareerEvidenceRepository;
    escoResolver: EscoOccupationResolver;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<JobSearchPlan> {
  const result = await ensureJobSearchPlan(command, dependencies);
  return result.plan;
}

export async function executeCareerAwareJobSearch(
  command: ExecuteCareerAwareJobSearchCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    source: JobSource;
    repository: CareerIntelligenceRepository;
    now: Clock;
  },
): Promise<{
  plan: JobSearchPlan;
  jobsFound: number;
  partialFailure: boolean;
  warnings: string[];
}> {
  const parsed = executePlanSchema.parse(command);
  const plan = parsed.planId
    ? await dependencies.repository.getSearchPlanById(
        parsed.planId,
        parsed.userId,
      )
    : await dependencies.repository.getLatestSearchPlan(parsed.userId);
  if (!plan) {
    throw new CareerIntelligenceError(
      "INVALID_INPUT",
      "Zeno is preparing your latest job search… try again in a moment.",
    );
  }

  const profile = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  if (!profile) {
    throw new CareerIntelligenceError(
      "PREFERENCES_REQUIRED",
      "Set a few job preferences so Zeno knows what to look for.",
    );
  }

  const warnings: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  const seenExternalIds = new Set<string>();
  let jobsFound = 0;

  const ordered = [...plan.queries].sort((a, b) => a.priority - b.priority);
  for (const query of ordered) {
    try {
      const criteria = jobSearchCriteriaSchema.parse({
        role_titles: [query.queryText],
        locations: profile.preferences.locations.slice(0, 3),
        work_modes: profile.preferences.work_modes,
        employment_types: profile.preferences.employment_types,
        experience_levels: profile.preferences.experience_levels,
        excluded_keywords: profile.preferences.excluded_keywords,
        page_size: parsed.pageSize,
        cursor: null,
      });
      const result = await dependencies.source.search(criteria);
      const uniqueJobs = result.jobs
        .filter(
          (job) =>
            !isJobTitleIncompatibleWithPreferences(
              job.title,
              profile.preferences,
            ) &&
            jobMatchesLocationPreferences(job, profile.preferences.locations),
        )
        .map((job) => normalizedExternalJobSchema.parse(job))
        .filter((job) => {
          if (seenExternalIds.has(job.external_id)) return false;
          seenExternalIds.add(job.external_id);
          return true;
        });

      const upserted =
        uniqueJobs.length === 0
          ? []
          : await dependencies.jobRepository.upsertDiscoveredJobs({
              userId: parsed.userId,
              source: dependencies.source.identity,
              jobs: uniqueJobs,
              seenAt: dependencies.now().toISOString(),
            });
      jobsFound += upserted.length;
      for (const job of upserted) {
        await dependencies.repository.linkJobToQuery({
          listingId: job.listing_id,
          plannedQueryId: query.id,
          discoveredAt: dependencies.now().toISOString(),
        });
      }
      await dependencies.repository.updatePlannedQueryStatus({
        id: query.id,
        searchPlanId: plan.id,
        status: "succeeded",
      });
      successCount += 1;
      if (uniqueJobs.length === 0) {
        warnings.push(
          `Query “${query.queryText}” succeeded but returned no new listings.`,
        );
      }
      if (result.partialFailure) {
        warnings.push(
          `Query “${query.queryText}” returned a partial provider result.`,
        );
      }
    } catch (error) {
      failureCount += 1;
      await dependencies.repository.updatePlannedQueryStatus({
        id: query.id,
        searchPlanId: plan.id,
        status: "failed",
      });
      if (error instanceof JobDiscoveryError) {
        warnings.push(`Query “${query.queryText}” failed: ${error.message}`);
      } else {
        warnings.push(`Query “${query.queryText}” failed unexpectedly.`);
      }
    }
  }

  if (successCount === 0) {
    await dependencies.repository.updateSearchPlanStatus({
      id: plan.id,
      userId: parsed.userId,
      status: "failed",
      updatedAt: dependencies.now().toISOString(),
    });
    throw new CareerIntelligenceError(
      "SEARCH_FAILED",
      warnings[0] ?? "Job search failed for every planned query.",
    );
  }

  const status = failureCount > 0 ? "partial" : "executed";
  await dependencies.repository.updateSearchPlanStatus({
    id: plan.id,
    userId: parsed.userId,
    status,
    updatedAt: dependencies.now().toISOString(),
  });
  const refreshed = await dependencies.repository.getSearchPlanById(
    plan.id,
    parsed.userId,
  );
  if (!refreshed) {
    throw new CareerIntelligenceError(
      "PERSISTENCE_FAILED",
      "Search plan could not be reloaded after execution.",
    );
  }

  if (jobsFound === 0) {
    warnings.push(
      "Search finished without new jobs. Try adjusting roles, locations, or work arrangement.",
    );
  }

  return {
    plan: refreshed,
    jobsFound,
    partialFailure: failureCount > 0 || jobsFound === 0,
    warnings,
  };
}

/**
 * Product entrypoint: ensure the plan is current, then search.
 */
export async function searchForJobs(
  command: SearchForJobsCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    source: JobSource;
    repository: CareerIntelligenceRepository;
    evidenceRepository?: CareerEvidenceRepository;
    escoResolver: EscoOccupationResolver;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<{
  plan: JobSearchPlan;
  jobsFound: number;
  partialFailure: boolean;
  warnings: string[];
  softNotice: string | null;
  preparingMessage: string | null;
  alsoSearchFor: string[];
}> {
  const parsed = searchForJobsSchema.parse(command);

  // Fresh search: drop previous discovered listings (keep saved) and old match
  // cards so the Jobs page does not stack / duplicate prior results.
  await dependencies.jobRepository.clearDiscoveredJobs({
    userId: parsed.userId,
    includeSaved: false,
  });
  await dependencies.repository.clearMatchAnalyses(parsed.userId);

  const ensured = await ensureJobSearchPlan(
    {
      userId: parsed.userId,
      queryBudget: parsed.queryBudget,
      force: false,
      excludedTitles: parsed.excludedTitles,
    },
    dependencies,
  );

  const result = await executeCareerAwareJobSearch(
    {
      userId: parsed.userId,
      planId: ensured.plan.id,
      pageSize: parsed.pageSize,
    },
    dependencies,
  );

  return {
    ...result,
    softNotice: ensured.softNotice,
    preparingMessage: ensured.regenerated
      ? "Zeno prepared your latest job search."
      : null,
    alsoSearchFor: ensured.alsoSearchFor,
  };
}

function alsoSearchTitles(plan: JobSearchPlan): string[] {
  return plan.queries
    .filter((query) => query.source !== "exact_role")
    .map((query) => query.queryText);
}

/**
 * Creates or reuses a minimal career-stage assessment row so preference-only
 * plans can be saved on databases that still require career_stage_assessment_id.
 */
async function ensurePreferenceOnlyAssessmentAnchor(input: {
  userId: string;
  preferencesFingerprint: string;
  existing: PersistedCareerStageAssessment | null;
  evidenceRepository?: CareerEvidenceRepository;
  repository: CareerIntelligenceRepository;
  createId: IdGenerator;
  now: Clock;
}): Promise<PersistedCareerStageAssessment | null> {
  if (
    input.existing &&
    input.existing.evidenceFingerprint === "preferences-only" &&
    input.existing.preferencesFingerprint === input.preferencesFingerprint
  ) {
    return input.existing;
  }

  if (!input.evidenceRepository) {
    return input.existing;
  }

  let evidenceSet = await input.evidenceRepository.getCurrent(input.userId);
  if (!evidenceSet) {
    evidenceSet = await ensureConversationDraft({
      userId: input.userId,
      evidence: emptyCareerEvidence(),
      createId: input.createId,
      repository: input.evidenceRepository,
      extractionModel: "preferences-only-anchor",
    });
  }

  const assessedAt = input.now().toISOString();
  return input.repository.saveCareerStageAssessment({
    id: input.createId(),
    userId: input.userId,
    evidenceSetId: evidenceSet.id,
    assessment: {
      inferredStage: "unknown",
      confidence: "low",
      experienceSummary: {
        totalRelevantMonths: 0,
        internshipMonths: 0,
        employmentMonths: 0,
        projectCount: 0,
        educationCount: 0,
        certificationCount: 0,
        skillCount: 0,
        intervals: [],
        evidenceIds: [],
      },
      targetOpportunityBands: ["early_career"],
      stretchOpportunityBands: [],
      unsuitableBands: [],
      reasons: ["Preference + ESCO search plan anchor."],
      preferenceOverrides: [],
      evidenceIds: [],
      policyVersion: CAREER_STAGE_POLICY_VERSION,
      assessedAt,
      evidenceFingerprint: "preferences-only",
      preferencesFingerprint: input.preferencesFingerprint,
    },
    createdAt: assessedAt,
  });
}
