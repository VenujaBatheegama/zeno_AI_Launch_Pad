import {
  jobSearchCriteriaSchema,
  type JobSearchCriteria,
  type NormalizedExternalJob,
} from "../domain/job";
import { searchHybridSources } from "./hybrid-search";
import type { JobDiscoveryRepository, JobSource } from "./ports";

export function isRelevantMatch(
  criteria: JobSearchCriteria,
  job: NormalizedExternalJob,
): boolean {
  if (criteria.locations && criteria.locations.length > 0) {
    const jobLoc = (job.location ?? "").toLowerCase();
    const city = (job.city ?? "").toLowerCase();
    const region = (job.region ?? "").toLowerCase();
    const country = (job.country ?? "").toLowerCase();

    const wantsRemote = criteria.work_modes?.includes("remote") || criteria.locations.some(l => l.toLowerCase() === "remote");
    const isJobRemote = job.work_mode === "remote" || jobLoc.includes("remote");

    if (isJobRemote && wantsRemote) {
       // Passes location check via remote
    } else {
      const matchesLocation = criteria.locations.some((target) => {
        const t = target.toLowerCase();
        if (t === "remote") return false; // Handled above
        return jobLoc.includes(t) || city.includes(t) || region.includes(t) || country.includes(t);
      });

      if (!matchesLocation) {
        return false;
      }
    }
  }

  if (criteria.role_titles && criteria.role_titles.length > 0) {
    const combined = `${job.title} ${job.description ?? ""}`.toLowerCase();
    const matchesRole = criteria.role_titles.some((role) => {
      const tokens = role.toLowerCase().split(/[\s,/-]+/).filter(t => t.length > 2);
      const specificTokens = tokens.filter(t => !["engineer", "developer", "manager", "specialist", "expert", "senior", "junior", "lead", "software"].includes(t));
      
      const tokensToMatch = specificTokens.length > 0 ? specificTokens : tokens;
      
      return tokensToMatch.some(t => combined.includes(t));
    });

    if (!matchesRole) {
      return false;
    }
  }

  return true;
}

export function summarizeJobsForLlm(jobs: NormalizedExternalJob[]): string {
  return JSON.stringify(jobs.slice(0, 5).map(j => ({
    title: j.title,
    company: j.organization?.name,
    location: j.location,
    mode: j.work_mode,
    url: j.application_url || j.source_url,
    snippet: j.description?.slice(0, 200)
  })));
}

export async function executeStructuredJobSearch(
  input: {
    userId: string;
    criteria: JobSearchCriteria;
  },
  dependencies: {
    sources: JobSource[];
    repository: JobDiscoveryRepository;
  },
): Promise<{
  jobs: NormalizedExternalJob[];
  summaryText: string;
}> {
  const outcome = await searchHybridSources(input.criteria, dependencies.sources);

  const jobs = [...outcome.jobs]
    .filter(job => isRelevantMatch(input.criteria, job))
    .sort((a, b) => {
      const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
      return timeB - timeA;
    });

  if (jobs.length > 0) {
    await dependencies.repository
      .upsertDiscoveredJobs({
        userId: input.userId,
        source: { key: "chat_search", name: "Chat Search" },
        jobs,
        seenAt: new Date().toISOString(),
      })
      .catch(() => undefined);
  }

  const summaryText = summarizeJobsForLlm(jobs);

  return {
    jobs,
    summaryText,
  };
}
