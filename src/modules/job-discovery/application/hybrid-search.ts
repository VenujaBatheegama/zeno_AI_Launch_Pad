import { JobDiscoveryError } from "../domain/errors";
import { dedupeNormalizedJobs } from "../domain/dedupe";
import { rankJobsByRelevance } from "../domain/relevance";
import type {
  JobSearchCriteria,
  JobSourceResult,
  NormalizedExternalJob,
  ProviderSearchStatus,
} from "../domain/job";
import type { JobSource, JobSourceIdentity } from "./ports";

export type { ProviderSearchStatus };

export type HybridSearchOutcome = {
  jobs: NormalizedExternalJob[];
  nextCursor: string | null;
  partialFailure: boolean;
  providers: Record<string, ProviderSearchStatus>;
  rawCount: number;
  dedupedCount: number;
};

/**
 * Fan-out across independent JobSource adapters with partial-failure isolation.
 * After merge/dedupe, rank by relevance to the search criteria — never by source.
 */
export async function searchHybridSources(
  criteria: JobSearchCriteria,
  sources: JobSource[],
): Promise<HybridSearchOutcome> {
  if (sources.length === 0) {
    throw new JobDiscoveryError(
      "SOURCE_UNAUTHORIZED",
      "No job sources are enabled. Configure JOB_SOURCES and provider credentials.",
    );
  }

  const settled = await Promise.allSettled(
    sources.map(async (source) => ({
      identity: source.identity,
      result: await source.search(criteria),
    })),
  );

  const providers: Record<string, ProviderSearchStatus> = {};
  const collected: Array<{
    job: NormalizedExternalJob;
    providerKey: string;
    providerName: string;
  }> = [];
  const cursors: string[] = [];
  let anyPartial = false;
  let anySuccess = false;

  settled.forEach((outcome, index) => {
    const identity = sources[index]?.identity as JobSourceIdentity;
    if (outcome.status === "rejected") {
      providers[identity.key] = {
        status: "error",
        count: 0,
        message: sanitizeProviderError(outcome.reason),
      };
      anyPartial = true;
      return;
    }

    anySuccess = true;
    const { result } = outcome.value;
    if (result.partialFailure) anyPartial = true;
    if (result.nextCursor) cursors.push(`${identity.key}:${result.nextCursor}`);
    providers[identity.key] = {
      status: result.jobs.length === 0 ? "empty" : "success",
      count: result.jobs.length,
    };
    for (const job of result.jobs) {
      collected.push({
        job,
        providerKey: identity.key,
        providerName: identity.name,
      });
    }
  });

  if (!anySuccess) {
    const firstError = settled.find(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    if (firstError?.reason instanceof JobDiscoveryError) {
      throw firstError.reason;
    }
    throw new JobDiscoveryError(
      "SOURCE_UNAVAILABLE",
      "All job sources failed. Try again shortly.",
      { cause: firstError?.reason },
    );
  }

  const deduped = dedupeNormalizedJobs(collected);
  const ranked = rankJobsByRelevance(deduped.jobs, criteria);
  return {
    jobs: ranked,
    nextCursor: cursors[0] ?? null,
    partialFailure: anyPartial,
    providers,
    rawCount: deduped.rawCount,
    dedupedCount: deduped.dedupedCount,
  };
}

/** JobSource wrapper so existing single-source call sites can fan out. */
export class HybridJobSource implements JobSource {
  readonly identity = { key: "hybrid", name: "Hybrid Search" } as const;

  constructor(private readonly sources: JobSource[]) {}

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    const outcome = await searchHybridSources(criteria, this.sources);
    return {
      jobs: outcome.jobs,
      nextCursor: outcome.nextCursor,
      partialFailure: outcome.partialFailure,
      providers: outcome.providers,
      rawCount: outcome.rawCount,
      dedupedCount: outcome.dedupedCount,
    };
  }
}

function sanitizeProviderError(reason: unknown): string {
  if (reason instanceof JobDiscoveryError) {
    return reason.message;
  }
  if (reason instanceof Error) {
    return reason.message.replace(/(Bearer|api[_-]?key|rapidapi)[^\s]*/giu, "[redacted]");
  }
  return "Provider request failed.";
}
