import { z } from "zod";

import {
  jobSearchCriteriaSchema,
  normalizedExternalJobSchema,
  isJobTitleIncompatibleWithPreferences,
  type DiscoveryPage,
  type JobSearchCriteria,
  type JobSearchPreferences,
} from "../domain/job";
import { jobMatchesLocationPreferences } from "../domain/location-match";
import { rankJobsByRelevance } from "../domain/relevance";
import { JobDiscoveryError } from "../domain/errors";
import {
  buildSearchUrl,
  describeJSearchParams,
  type JSearchRequestPreview,
} from "../infrastructure/jsearch-job-source";
import type {
  Clock,
  JobDiscoveryRepository,
  JobSource,
} from "./ports";

export type JobSearchRequestPreview = {
  method: "GET";
  /** Absolute URL including query string — paste into Postman. */
  url: string;
  headers: Record<string, string>;
  params: JSearchRequestPreview;
};

const discoverJobsCommandSchema = z.object({
  userId: z.uuid(),
  cursor: z.string().min(1).nullable().default(null),
  depth: z.number().int().min(1).default(1),
});
const cursorStateSchema = z.array(z.string().min(1).nullable()).max(5);

export type DiscoverJobsCommand = z.input<typeof discoverJobsCommandSchema>;

export async function discoverJobs(
  command: DiscoverJobsCommand,
  dependencies: {
    repository: JobDiscoveryRepository;
    source: JobSource;
    now: Clock;
    maxRequests: number;
    maxPages: number;
    pageSize: number;
    batchTitles?: boolean;
    /** Optional ESCO-expanded titles; defaults to preference roles. */
    roleTitles?: string[];
  },
): Promise<DiscoveryPage> {
  const parsed = discoverJobsCommandSchema.parse(command);
  const profile = await dependencies.repository.getSearchProfile(parsed.userId);
  if (!profile || profile.preferences.roles.length === 0) {
    throw new JobDiscoveryError(
      "SEARCH_NOT_CONFIGURED",
      "Add at least one desired role before finding jobs.",
    );
  }
  if (parsed.depth > dependencies.maxPages) {
    throw new JobDiscoveryError(
      "INVALID_PREFERENCES",
      "The requested job-search page is outside the configured search depth.",
    );
  }

  const preferencesForSearch = {
    ...profile.preferences,
    roles:
      dependencies.roleTitles && dependencies.roleTitles.length > 0
        ? dependencies.roleTitles
        : profile.preferences.roles,
  };

  const criteria = buildSearchCriteria(preferencesForSearch, {
    maxRequests: dependencies.maxRequests,
    pageSize: dependencies.pageSize,
    cursors: decodeCursorState(parsed.cursor),
    batchTitles: dependencies.batchTitles ?? false,
  });
  const outcomes: Array<PromiseSettledResult<Awaited<ReturnType<JobSource["search"]>>>> =
    [];
  for (const request of criteria) {
    try {
      outcomes.push({
        status: "fulfilled",
        value: await dependencies.source.search(request),
      });
    } catch (reason) {
      outcomes.push({ status: "rejected", reason });
    }
  }
  const successful = outcomes.flatMap((outcome, index) =>
    outcome.status === "fulfilled"
      ? [{ index, result: outcome.value }]
      : [],
  );

  if (successful.length === 0 && outcomes.length > 0) {
    const firstFailure = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );
    if (firstFailure?.reason instanceof JobDiscoveryError) {
      throw firstFailure.reason;
    }
    throw new JobDiscoveryError(
      "SOURCE_UNAVAILABLE",
      "We couldn't search for jobs right now. Try again.",
      { cause: firstFailure?.reason },
    );
  }

  const uniqueJobs = [
    ...new Map(
      successful
        .flatMap(({ result }) => result.jobs)
        .filter(
          (job) =>
            !isJobTitleIncompatibleWithPreferences(
              job.title,
              profile.preferences,
            ) &&
            jobMatchesLocationPreferences(job, profile.preferences.locations),
        )
        .map((job) => {
          const parsedJob = normalizedExternalJobSchema.parse(job);
          return [parsedJob.external_id, parsedJob] as const;
        }),
    ).values(),
  ];
  const rankedJobs = rankJobsByRelevance(uniqueJobs, {
    role_titles: preferencesForSearch.roles.slice(0, 5),
    locations: profile.preferences.locations.slice(0, 3),
    work_modes: profile.preferences.work_modes,
    employment_types: profile.preferences.employment_types,
    experience_levels: profile.preferences.experience_levels,
  });
  const jobs =
    rankedJobs.length === 0
      ? []
      : await dependencies.repository.upsertDiscoveredJobs({
          userId: parsed.userId,
          source: dependencies.source.identity,
          jobs: rankedJobs,
          seenAt: dependencies.now().toISOString(),
        });

  const providerStatuses = Object.assign(
    {},
    ...successful.map(({ result }) => result.providers ?? {}),
  );
  const rawCount = successful.reduce(
    (sum, { result }) => sum + (result.rawCount ?? result.jobs.length),
    0,
  );
  const dedupedCount = successful.reduce(
    (sum, { result }) => sum + (result.dedupedCount ?? result.jobs.length),
    0,
  );

  return {
    jobs,
    partialFailure:
      successful.length < outcomes.length ||
      successful.some(({ result }) => result.partialFailure),
    nextCursor:
      parsed.depth < dependencies.maxPages
        ? encodeCursorState(
            criteria.map(
              (_, index) =>
                successful.find((item) => item.index === index)?.result
                  .nextCursor ?? null,
            ),
          )
        : null,
    requestsMade: outcomes.length,
    providers:
      Object.keys(providerStatuses).length > 0 ? providerStatuses : undefined,
    rawCount: rawCount || undefined,
    dedupedCount: dedupedCount || undefined,
  };
}

export function buildSearchCriteria(
  preferences: JobSearchPreferences,
  options: {
    maxRequests: number;
    pageSize: number;
    cursors?: Array<string | null>;
    batchTitles?: boolean;
  },
): JobSearchCriteria[] {
  const parsed = z
    .object({
      preferences: z.object({
        roles: z.array(z.string().min(1)).min(1),
        locations: z.array(z.string()),
        work_modes: z.array(z.string()),
        employment_types: z.array(z.string()),
        experience_levels: z.array(z.string()),
        excluded_keywords: z.array(z.string()),
      }),
      maxRequests: z.number().int().min(1).max(5),
      pageSize: z.number().int().min(1).max(25),
      cursors: cursorStateSchema.optional(),
      batchTitles: z.boolean().optional(),
    })
    .parse({
      preferences,
      ...options,
    });
  const roles = [...new Set(parsed.preferences.roles)].slice(
    0,
    parsed.batchTitles && parsed.maxRequests === 1 ? 5 : parsed.maxRequests,
  );

  if (parsed.batchTitles) {
    return [
      jobSearchCriteriaSchema.parse({
        role_titles: roles,
        locations: [...new Set(preferences.locations)].slice(0, 3),
        work_modes: preferences.work_modes,
        employment_types: preferences.employment_types,
        experience_levels: preferences.experience_levels,
        excluded_keywords: preferences.excluded_keywords,
        page_size: parsed.pageSize,
        cursor: parsed.cursors?.[0] ?? null,
      }),
    ];
  }

  return roles.map((role, index) =>
    jobSearchCriteriaSchema.parse({
      role_titles: [role],
      locations: [...new Set(preferences.locations)].slice(0, 3),
      work_modes: preferences.work_modes,
      employment_types: preferences.employment_types,
      experience_levels: preferences.experience_levels,
      excluded_keywords: preferences.excluded_keywords,
      page_size: parsed.pageSize,
      cursor: parsed.cursors?.[index] ?? null,
    }),
  );
}

/**
 * Preview of the JSearch request(s) Find jobs would make from saved preferences.
 * Defaults match server config (1 role request / page).
 */
export function previewJobSearchQueries(
  preferences: JobSearchPreferences,
  options: {
    maxRequests?: number;
    pageSize?: number;
    baseUrl: string;
  },
): JobSearchRequestPreview[] {
  if (preferences.roles.length === 0) return [];
  const criteria = buildSearchCriteria(preferences, {
    maxRequests: options.maxRequests ?? 1,
    pageSize: options.pageSize ?? 10,
  });
  return criteria.map((item) => {
    const params = describeJSearchParams(item);
    const url = buildSearchUrl(options.baseUrl, item);
    const hostname = url.hostname;
    const headers: Record<string, string> = hostname.includes("rapidapi.com")
      ? {
          "x-rapidapi-key": "<YOUR_RAPIDAPI_KEY>",
          "x-rapidapi-host": hostname,
        }
      : {
          "x-api-key": "<YOUR_JSEARCH_API_KEY>",
        };
    return {
      method: "GET" as const,
      url: url.toString(),
      headers,
      params,
    };
  });
}

function decodeCursorState(cursor: string | null): Array<string | null> {
  if (cursor === null) return [];
  try {
    return cursorStateSchema.parse(JSON.parse(cursor));
  } catch (error) {
    throw new JobDiscoveryError(
      "INVALID_PREFERENCES",
      "The job-search continuation token is invalid.",
      { cause: error },
    );
  }
}

function encodeCursorState(cursors: Array<string | null>): string | null {
  return cursors.some(Boolean) ? JSON.stringify(cursors) : null;
}
