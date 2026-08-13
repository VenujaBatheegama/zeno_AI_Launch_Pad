/**
 * Canonical LinkedIn search keys are built only from fields that change
 * provider retrieval. Profile evidence, alert thresholds, and notification
 * preferences must never appear in the key.
 */

export const LINKEDIN_GUEST_PROVIDER = "linkedin-guest" as const;
export const FRESH_RECENCY_STRATEGY = "fresh-1h" as const;

export type FreshWorkMode = "onsite" | "hybrid" | "remote" | "any";

export type CanonicalSearchCriteria = {
  primaryRole: string;
  location: string;
  workMode: FreshWorkMode;
  employmentType?: string | null;
  recencyStrategy?: string;
};

export function normalizeSearchToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function canonicalLinkedInSearchKey(
  input: CanonicalSearchCriteria,
): string {
  const role = normalizeSearchToken(input.primaryRole);
  const location = normalizeSearchToken(input.location);
  if (!role) {
    throw new Error("A primary role is required for a LinkedIn fresh search.");
  }
  if (!location) {
    throw new Error("A location is required for a LinkedIn fresh search.");
  }
  const workMode = input.workMode || "any";
  const employment = input.employmentType
    ? normalizeSearchToken(input.employmentType)
    : "any";
  const recency = input.recencyStrategy ?? FRESH_RECENCY_STRATEGY;
  return [
    role,
    location,
    workMode,
    employment,
    LINKEDIN_GUEST_PROVIDER,
    recency,
  ].join("|");
}

export function jobIdentityFingerprint(input: {
  company: string | null | undefined;
  title: string;
  location: string | null | undefined;
  publishedAt: string | null | undefined;
}): string {
  const dateBucket = input.publishedAt?.slice(0, 10) || "unknown-date";
  return [
    normalizeSearchToken(input.company ?? "") || "unknown-company",
    normalizeSearchToken(input.title) || "unknown-title",
    normalizeSearchToken(input.location ?? "") || "unknown-location",
    dateBucket,
  ].join("|");
}
