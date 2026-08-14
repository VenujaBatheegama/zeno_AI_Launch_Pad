import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";

export type MatchedJobRow = {
  listingId: string;
  title: string;
  company: string | null;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  publishedAt: string | null;
  description: string | null;
  fitScore: number | null;
  explanation: string | null;
  preferredMatches: string[];
  verifiedMatches: string[];
  analysed: boolean;
};

/**
 * Merge discovered jobs with match cards for the CV tailor picker.
 * Only includes jobs that have been analysed/matched — same set the Jobs
 * page surfaces after "Find new jobs", not every raw discovery row.
 */
export function buildMatchedJobRows(
  jobs: DiscoveredJob[],
  matches: RankedJobMatchCard[],
): MatchedJobRow[] {
  const jobByListing = new Map(
    jobs
      .filter((job) => job.user_state !== "dismissed")
      .map((job) => [job.listing_id, job]),
  );

  return matches
    .filter((match) => match.userState !== "dismissed")
    .map((match) => {
      const job = jobByListing.get(match.listingId);
      return {
        listingId: match.listingId,
        title: job?.title ?? match.title,
        company: job ? job.organization_name : match.organizationName,
        location: job ? job.location : null,
        workMode: job ? job.work_mode : null,
        employmentType: job ? job.employment_type : null,
        experienceLevel: job ? job.experience_level : null,
        publishedAt: job ? job.published_at : null,
        description: job ? job.description : null,
        fitScore: match.evidenceFitScore,
        explanation: match.explanation,
        preferredMatches: match.preferredMatches ?? [],
        verifiedMatches: match.verifiedMatches ?? [],
        analysed: true,
      } satisfies MatchedJobRow;
    })
    .sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
}
