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
 * Merge the user's stored discovered jobs with match cards.
 * Does not invent values or call job providers.
 */
export function buildMatchedJobRows(
  jobs: DiscoveredJob[],
  matches: RankedJobMatchCard[],
): MatchedJobRow[] {
  const matchByListing = new Map(
    matches.map((item) => [item.listingId, item]),
  );
  return jobs
    .filter((job) => job.user_state !== "dismissed")
    .map((job) => {
      const match = matchByListing.get(job.listing_id);
      return {
        listingId: job.listing_id,
        title: job.title,
        company: job.organization_name,
        location: job.location,
        workMode: job.work_mode,
        employmentType: job.employment_type,
        experienceLevel: job.experience_level,
        publishedAt: job.published_at,
        description: job.description,
        fitScore: match?.evidenceFitScore ?? null,
        explanation: match?.explanation ?? null,
        preferredMatches: match?.preferredMatches ?? [],
        verifiedMatches: match?.verifiedMatches ?? [],
        analysed: Boolean(match),
      };
    })
    .sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
}
