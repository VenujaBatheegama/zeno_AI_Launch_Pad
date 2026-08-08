/**
 * Cross-domain title seniority inference.
 *
 * Titles like "Principal Platform Engineer", "Head of People", or "VP Sales"
 * often omit the word "Senior" yet are not junior roles. Signals are
 * occupation-agnostic (HR, sales, IT, ops, etc.).
 */
export type TitleSeniorityTier =
  | "entry"
  | "mid"
  | "senior"
  | "lead"
  | "executive";

type PreferredExperienceLevel = TitleSeniorityTier;

const TIER_RANK: Record<TitleSeniorityTier, number> = {
  entry: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  executive: 5,
};

/** Infer elevated seniority from a job title, or null when no clear signal. */
export function inferTitleSeniorityTier(
  title: string,
): TitleSeniorityTier | null {
  const normalized = title.trim().toLocaleLowerCase();
  if (!normalized) return null;

  // Avoid false positives in common junior/adjacent phrases.
  if (
    /\b(lead generation|lead gen|sales development|sdr|bdr|intern|internship|apprentice|graduate|junior|associate|assistant)\b/u.test(
      normalized,
    )
  ) {
    // Still catch explicit senior+ markers inside otherwise junior-ish titles
    // (e.g. "Senior Intern Program Manager" is rare; "Junior" wins only when
    // no elevated marker is present).
    if (!hasExplicitElevatedMarker(normalized)) {
      return null;
    }
  }

  if (
    /\b(chief\s+\w+|c[efiot]o|vp|v\.p\.|vice[\s-]?president|president|managing director|general manager|founder|co-founder)\b/u.test(
      normalized,
    )
  ) {
    return "executive";
  }

  if (
    /\b(head of|director|director of|people manager|engineering manager|hiring manager)\b/u.test(
      normalized,
    )
  ) {
    return "lead";
  }

  if (
    /\b(principal|distinguished|fellow)\b/u.test(normalized) ||
    /\bstaff(?:\s+\w+){0,2}\s+(engineer|scientist|designer|researcher|architect|sre|developer)\b/u.test(
      normalized,
    ) ||
    /\b(tech lead|team lead|engineering lead|practice lead)\b/u.test(
      normalized,
    ) ||
    /\blead (engineer|developer|designer|consultant|architect|analyst|scientist|recruiter|counsel|attorney|nurse|teacher|accountant)\b/u.test(
      normalized,
    ) ||
    /\b(senior|sr\.?|snr)\b/u.test(normalized)
  ) {
    return "senior";
  }

  return null;
}

function hasExplicitElevatedMarker(normalized: string): boolean {
  return (
    /\b(principal|distinguished|fellow|director|head of|vice[\s-]?president|vp|chief\s+\w+|c[efiot]o|senior|sr\.?|snr)\b/u.test(
      normalized,
    ) ||
    /\bstaff(?:\s+\w+){0,2}\s+(engineer|scientist|designer|researcher|architect)\b/u.test(
      normalized,
    )
  );
}

/**
 * True when the title's inferred seniority is above what the seeker asked for.
 *
 * Empty `experience_levels` is treated as entry-oriented (Zeno's default
 * early-career posture): elevated titles are filtered unless the user
 * explicitly opts into senior/lead/executive.
 */
export function titleExceedsPreferredExperience(
  title: string,
  experienceLevels: PreferredExperienceLevel[],
): boolean {
  const inferred = inferTitleSeniorityTier(title);
  if (!inferred) return false;

  const maxPreferred = maxPreferredTier(experienceLevels);
  return TIER_RANK[inferred] > TIER_RANK[maxPreferred];
}

function maxPreferredTier(
  experienceLevels: PreferredExperienceLevel[],
): TitleSeniorityTier {
  if (experienceLevels.length === 0) return "entry";
  let max: TitleSeniorityTier = "entry";
  for (const level of experienceLevels) {
    if (TIER_RANK[level] > TIER_RANK[max]) {
      max = level;
    }
  }
  return max;
}
