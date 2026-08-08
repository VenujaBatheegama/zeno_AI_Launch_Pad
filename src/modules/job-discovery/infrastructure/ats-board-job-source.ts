import type { JobSource } from "../application/ports";
import type { JobSearchCriteria, JobSourceResult } from "../domain/job";

/**
 * Extension point for selected public company ATS boards (Greenhouse, Lever, etc.).
 *
 * Not enabled in the hybrid MVP. Next coverage lane:
 * - Configure explicit board tokens (never crawl the open web)
 * - Fetch each board's official public jobs API
 * - Normalize into the same NormalizedExternalJob shape
 * - Register via JOB_SOURCES when ready
 *
 * Example future config (not wired yet):
 *   ATS_BOARDS=greenhouse:acme,lever:example
 */
export class AtsBoardJobSource implements JobSource {
  readonly identity = { key: "ats", name: "ATS boards" } as const;

  constructor(
    private readonly boards: ReadonlyArray<{
      provider: "greenhouse" | "lever";
      boardToken: string;
    }> = [],
  ) {}

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    void criteria;
    if (this.boards.length === 0) {
      return { jobs: [], nextCursor: null, partialFailure: false };
    }
    // Board fetchers intentionally deferred — keep hybrid search focused on
    // JSearch + TheirStack + ITPro for the current slice.
    return { jobs: [], nextCursor: null, partialFailure: false };
  }
}
