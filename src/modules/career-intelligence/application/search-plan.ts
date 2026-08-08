import { z } from "zod";

import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";
import type { JobSource } from "@/modules/job-discovery/application/ports";
import {
  jobSearchCriteriaSchema,
  normalizedExternalJobSchema,
  isJobTitleIncompatibleWithPreferences,
} from "@/modules/job-discovery/domain/job";
import { jobMatchesLocationPreferences } from "@/modules/job-discovery/domain/location-match";
import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";

import { CareerIntelligenceError } from "../domain/errors";
import { fingerprint } from "../domain/fingerprint";
import { DEFAULT_SEARCH_QUERY_BUDGET } from "../domain/policy";
import { expandRoleTitles } from "../domain/role-families";
import type {
  CareerIntelligenceRepository,
  Clock,
  IdGenerator,
  JobSearchPlan,
} from "./ports";

const createPlanSchema = z.object({
  userId: z.uuid(),
  assessmentId: z.uuid().optional(),
  queryBudget: z.number().int().min(1).max(8).default(DEFAULT_SEARCH_QUERY_BUDGET),
  force: z.boolean().default(false),
});

const executePlanSchema = z.object({
  userId: z.uuid(),
  planId: z.uuid().optional(),
  pageSize: z.number().int().min(1).max(20).default(10),
});

export type CreateCareerAwareSearchPlanCommand = z.input<typeof createPlanSchema>;
export type ExecuteCareerAwareJobSearchCommand = z.input<typeof executePlanSchema>;

export async function createCareerAwareSearchPlan(
  command: CreateCareerAwareSearchPlanCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<JobSearchPlan> {
  const parsed = createPlanSchema.parse(command);
  const assessment = parsed.assessmentId
    ? await dependencies.repository.getCareerStageAssessmentById(
        parsed.assessmentId,
        parsed.userId,
      )
    : await dependencies.repository.getLatestCareerStageAssessment(
        parsed.userId,
      );
  if (!assessment) {
    throw new CareerIntelligenceError(
      "INVALID_INPUT",
      "Run a career-stage assessment before creating a search plan.",
    );
  }

  const profile = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  if (!profile || profile.preferences.roles.length === 0) {
    throw new CareerIntelligenceError(
      "PREFERENCES_REQUIRED",
      "Save job-search preferences before creating a search plan.",
    );
  }

  const preferencesFingerprint = fingerprint(profile.preferences);
  const existing = await dependencies.repository.getLatestSearchPlan(
    parsed.userId,
  );
  if (
    !parsed.force &&
    existing &&
    existing.careerStageAssessmentId === assessment.id &&
    existing.preferencesFingerprint === preferencesFingerprint &&
    existing.evidenceFingerprint === assessment.evidenceFingerprint &&
    existing.queryBudget === parsed.queryBudget
  ) {
    return existing;
  }

  const capabilityProfile =
    await dependencies.repository.getLatestCapabilityProfile(parsed.userId);
  const titles = expandRoleTitles({
    preferences: profile.preferences,
    assessment,
    budget: parsed.queryBudget,
    capabilityAggregates: capabilityProfile?.aggregates,
  });
  if (titles.length === 0) {
    throw new CareerIntelligenceError(
      "INVALID_INPUT",
      "No valid search titles could be generated from the current preferences and stage.",
    );
  }

  const now = dependencies.now().toISOString();
  const planId = dependencies.createId();
  return dependencies.repository.saveSearchPlan({
    plan: {
      id: planId,
      userId: parsed.userId,
      careerStageAssessmentId: assessment.id,
      preferencesFingerprint,
      evidenceFingerprint: assessment.evidenceFingerprint,
      queryBudget: parsed.queryBudget,
      status: "draft",
      reasons: [
        `Generated ${titles.length} bounded queries within budget ${parsed.queryBudget}.`,
        ...assessment.preferenceOverrides.map((item) => item.detail),
      ],
      createdAt: now,
      updatedAt: now,
    },
    queries: titles.map((title, index) => ({
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
      "Create a career-aware search plan before executing search.",
    );
  }

  const profile = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  if (!profile) {
    throw new CareerIntelligenceError(
      "PREFERENCES_REQUIRED",
      "Job-search preferences are required to execute search.",
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
        warnings.push(`Query “${query.queryText}” returned a partial provider result.`);
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
      warnings[0] ?? "Career-aware job search failed for every planned query.",
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
      "Search finished without new jobs. Prefer clean role titles on /jobs (for example “Software Engineer”, “DevOps Engineer”) and re-create the plan. Avoid stuffing technologies into role names.",
    );
  }

  return {
    plan: refreshed,
    jobsFound,
    partialFailure: failureCount > 0 || jobsFound === 0,
    warnings,
  };
}
