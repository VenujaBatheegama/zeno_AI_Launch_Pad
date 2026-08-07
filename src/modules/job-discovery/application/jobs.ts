import { z } from "zod";

import {
  titleMatchesExcludedKeyword,
  userJobStateSchema,
  type DiscoveredJob,
} from "../domain/job";
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

export type ListJobsCommand = z.input<typeof listJobsCommandSchema>;
export type SetJobStateCommand = z.input<typeof setJobStateCommandSchema>;

export async function listDiscoveredJobs(
  command: ListJobsCommand,
  repository: JobDiscoveryRepository,
): Promise<DiscoveredJob[]> {
  const parsed = listJobsCommandSchema.parse(command);
  const [jobs, profile] = await Promise.all([
    repository.listJobs(parsed),
    repository.getSearchProfile(parsed.userId),
  ]);
  const excluded = profile?.preferences.excluded_keywords ?? [];
  return jobs.filter(
    (job) => !titleMatchesExcludedKeyword(job.title, excluded),
  );
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
