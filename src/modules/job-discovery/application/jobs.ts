import { z } from "zod";

import {
  emptyJobSearchPreferences,
  isJobTitleIncompatibleWithPreferences,
  userJobStateSchema,
  type DiscoveredJob,
} from "../domain/job";
import type { MatchableProfileTerm } from "../domain/profile-alignment";
import { rankJobsPersonalized } from "../domain/relevance";
import type { Clock, JobDiscoveryRepository } from "./ports";

const listJobsCommandSchema = z.object({
  userId: z.uuid(),
  includeDismissed: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const setJobStateCommandSchema = z.object({
  userId: z.uuid(),
  listingId: z.uuid(),
  state: userJobStateSchema,
});

const clearJobsCommandSchema = z.object({
  userId: z.uuid(),
  /** When true, also removes saved jobs. Default keeps saved jobs. */
  includeSaved: z.boolean().default(false),
});

export type ListJobsCommand = z.input<typeof listJobsCommandSchema>;
export type SetJobStateCommand = z.input<typeof setJobStateCommandSchema>;
export type ClearDiscoveredJobsCommand = z.input<typeof clearJobsCommandSchema>;

export async function listDiscoveredJobs(
  command: ListJobsCommand,
  repository: JobDiscoveryRepository,
  options?: {
    profileTerms?: MatchableProfileTerm[];
    /** When provided, skips a second profile fetch. */
    profile?: Awaited<
      ReturnType<JobDiscoveryRepository["getSearchProfile"]>
    >;
    /** When provided, skips a second jobs fetch. */
    jobs?: DiscoveredJob[];
  },
): Promise<DiscoveredJob[]> {
  const parsed = listJobsCommandSchema.parse(command);
  const [jobs, profile] = await Promise.all([
    options?.jobs
      ? Promise.resolve(options.jobs)
      : repository.listJobs(parsed),
    options && "profile" in options
      ? Promise.resolve(options.profile ?? null)
      : repository.getSearchProfile(parsed.userId),
  ]);
  const preferences = profile?.preferences ?? emptyJobSearchPreferences;
  const filtered = jobs.filter(
    (job) => !isJobTitleIncompatibleWithPreferences(job.title, preferences),
  );
  return rankJobsPersonalized(
    filtered,
    {
      role_titles: preferences.roles.slice(0, 5),
      locations: preferences.locations.slice(0, 3),
      work_modes: preferences.work_modes,
      employment_types: preferences.employment_types,
      experience_levels: preferences.experience_levels,
    },
    options?.profileTerms ?? [],
  );
}

export async function clearDiscoveredJobsForUser(
  command: ClearDiscoveredJobsCommand,
  repository: JobDiscoveryRepository,
): Promise<{ removed: number }> {
  const parsed = clearJobsCommandSchema.parse(command);
  const removed = await repository.clearDiscoveredJobs({
    userId: parsed.userId,
    includeSaved: parsed.includeSaved,
  });
  return { removed };
}

export async function setUserJobState(
  command: SetJobStateCommand,
  dependencies: {
    repository: JobDiscoveryRepository;
    now: Clock;
  },
): Promise<DiscoveredJob> {
  const parsed = setJobStateCommandSchema.parse(command);
  return dependencies.repository.setUserJobState({
    ...parsed,
    updatedAt: dependencies.now().toISOString(),
  });
}
