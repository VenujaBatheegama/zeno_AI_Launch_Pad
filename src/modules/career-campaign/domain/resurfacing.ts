/**
 * Re-surfacing policy for dismissed job recommendations.
 *
 * Scope: Jobs-tab only. Re-surfacing is keyed on `campaign_listing_sightings`
 * (a new row where `seen_at > dismissed_at`), which only exists for job listings
 * discovered through campaigns. There is no equivalent for dismissed Growth
 * recommendations — that is deferred as FU-5.
 */

export type ResurfaceCandidate = {
  recommendationId: string;
  listingId: string;
  /** ISO 8601 timestamp when the recommendation was rejected/dismissed. */
  dismissedAt: string;
  /** ISO 8601 timestamp of the most-recent campaign sighting for this listing. */
  lastSeenAt: string | null;
};

/**
 * Returns true when a dismissed job recommendation is eligible to be
 * re-surfaced as pending_review.
 *
 * Conditions (all must hold):
 *  1. `windowDays` have passed since dismissal.
 *  2. The listing has been newly sighted by a campaign since dismissal
 *     (i.e. `lastSeenAt > dismissedAt`).
 */
export function canResurface(candidate: {
  dismissedAt: string;
  lastSeenAt: string | null;
  windowDays: number;
  asOf?: string;
}): boolean {
  const { dismissedAt, lastSeenAt, windowDays, asOf } = candidate;
  if (!lastSeenAt) return false;

  const now = asOf ? new Date(asOf) : new Date();
  const dismissed = new Date(dismissedAt);
  const lastSeen = new Date(lastSeenAt);

  const daysSinceDismissal =
    (now.getTime() - dismissed.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceDismissal < windowDays) return false;
  if (lastSeen <= dismissed) return false;

  return true;
}
