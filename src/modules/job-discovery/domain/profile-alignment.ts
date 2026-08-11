import { PROFILE_ALIGNMENT_WEIGHTS } from "@/modules/career-intelligence/domain/policy";

export type MatchableProfileCategory = "verified" | "preferred" | "excluded";

/**
 * User vocabulary for ranking. Labels are original term + optional same-concept
 * ESCO preferred/alternative labels only (never broader/narrower/related).
 */
export type MatchableProfileTerm = {
  originalTerm: string;
  category: MatchableProfileCategory;
  escoUri?: string;
  labels: string[];
};

export type JobProfileAlignment = {
  verifiedMatches: string[];
  preferredMatches: string[];
  excludedMatches: string[];
  /** Capped contribution suitable to add onto searchRelevance. */
  alignmentScore: number;
  /** Interest-only score (preferred positive, excluded negative); 0 when no interests. */
  interestScore: number;
  reasons: string[];
};

/**
 * Phrase-aware matching of user profile terms against title + description.
 * Domain-independent: only looks for the caller's terms/labels.
 */
export function alignJobToProfile(input: {
  title: string;
  description: string | null | undefined;
  terms: MatchableProfileTerm[];
}): JobProfileAlignment {
  const haystack = normalizeForMatch(
    [input.title, input.description ?? ""].filter(Boolean).join("\n"),
  );
  const verifiedMatches: string[] = [];
  const preferredMatches: string[] = [];
  const excludedMatches: string[] = [];
  const reasons: string[] = [];

  if (!haystack || input.terms.length === 0) {
    return {
      verifiedMatches,
      preferredMatches,
      excludedMatches,
      alignmentScore: 0,
      interestScore: 0,
      reasons,
    };
  }

  const seenConcept = new Set<string>();

  for (const term of input.terms) {
    const conceptKey = `${term.category}:${normalizeKey(term.originalTerm)}`;
    if (seenConcept.has(conceptKey)) continue;

    const labels = uniqueLabels([term.originalTerm, ...term.labels]);
    const matchedLabel = labels.find((label) => phrasePresent(haystack, label));
    if (!matchedLabel) continue;

    seenConcept.add(conceptKey);
    if (term.category === "verified") {
      verifiedMatches.push(term.originalTerm);
      reasons.push(`${term.originalTerm} matches a verified skill`);
    } else if (term.category === "preferred") {
      preferredMatches.push(term.originalTerm);
      reasons.push(`${term.originalTerm} matches an explicitly preferred interest`);
    } else {
      excludedMatches.push(term.originalTerm);
      reasons.push(`${term.originalTerm} matches an explicitly excluded interest`);
    }
  }

  const rawPositive =
    preferredMatches.length * PROFILE_ALIGNMENT_WEIGHTS.preferredMatch +
    verifiedMatches.length * PROFILE_ALIGNMENT_WEIGHTS.verifiedMatch;
  const cappedPositive = Math.min(
    rawPositive,
    PROFILE_ALIGNMENT_WEIGHTS.positiveCap,
  );
  const excludedPenalty =
    excludedMatches.length * PROFILE_ALIGNMENT_WEIGHTS.excludedMatch;
  const alignmentScore = cappedPositive + excludedPenalty;

  const interestRaw =
    preferredMatches.length * PROFILE_ALIGNMENT_WEIGHTS.preferredMatch +
    excludedPenalty;
  const interestScore =
    preferredMatches.length === 0 && excludedMatches.length === 0
      ? 0
      : interestRaw;

  return {
    verifiedMatches,
    preferredMatches,
    excludedMatches,
    alignmentScore,
    interestScore,
    reasons,
  };
}

export function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s.+#]/gu, " ")
    .replace(/\s+/gu, " ");
}

function normalizeKey(value: string): string {
  return normalizeForMatch(value);
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  // Longer phrases first so "spring boot" wins before "spring".
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Token-boundary / phrase match. Avoids "java" matching "javascript"
 * and accidental mid-token hits.
 */
export function phrasePresent(haystackNormalized: string, phrase: string): boolean {
  const needle = normalizeForMatch(phrase);
  if (!needle || !haystackNormalized) return false;
  if (needle.length <= 2) {
    return new RegExp(`(^|\\s)${escapeRegExp(needle)}(?=\\s|$)`, "u").test(
      haystackNormalized,
    );
  }
  const escaped = escapeRegExp(needle).replace(/\\ /gu, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, "iu").test(
    haystackNormalized,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
