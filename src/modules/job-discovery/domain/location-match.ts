import type { NormalizedExternalJob } from "./job";

type LocationPreferenceAnalysis = {
  allowRemote: boolean;
  /** Compact place tokens the job must match when geographic prefs exist. */
  placeNeedles: string[];
  /** Preferred country codes inferred from prefs (e.g. lk). */
  countryCodes: string[];
};

/**
 * Post-provider location guard. Providers (especially LinkedIn guest) often
 * ignore or soften geo filters — never trust them alone when the user named a place.
 */
export function jobMatchesLocationPreferences(
  job: Pick<
    NormalizedExternalJob,
    "location" | "city" | "region" | "country" | "work_mode"
  >,
  preferredLocations: string[],
): boolean {
  const analysis = analyseLocationPreferences(preferredLocations);
  if (analysis.placeNeedles.length === 0 && !analysis.allowRemote) {
    return true;
  }

  const haystack = normalizePlace(
    [job.location, job.city, job.region, job.country].filter(Boolean).join(" "),
  );
  const jobCountry = inferCountryCodeFromText(haystack);
  const looksRemote =
    job.work_mode === "remote" ||
    /\bremote\b|\bwfh\b|\bwork from home\b|\banywhere\b/u.test(haystack);

  if (analysis.placeNeedles.length === 0) {
    // Preferences are remote-only.
    return looksRemote || haystack.length === 0;
  }

  const matchesPlace = analysis.placeNeedles.some((needle) =>
    haystack.includes(needle),
  );
  if (matchesPlace) return true;

  // Remote is allowed only when it does not point at a conflicting country.
  if (analysis.allowRemote && looksRemote) {
    if (!jobCountry) return true;
    return analysis.countryCodes.includes(jobCountry);
  }

  // Explicit foreign country while user asked for a specific place → reject.
  if (
    jobCountry &&
    analysis.countryCodes.length > 0 &&
    !analysis.countryCodes.includes(jobCountry)
  ) {
    return false;
  }

  return false;
}

export function analyseLocationPreferences(
  preferredLocations: string[],
): LocationPreferenceAnalysis {
  let allowRemote = false;
  const placeNeedles = new Set<string>();
  const countryCodes = new Set<string>();

  for (const raw of preferredLocations) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isRemoteLocation(trimmed)) {
      allowRemote = true;
      continue;
    }

    const normalized = normalizePlace(trimmed);
    const compact = normalized.replace(/\s+/gu, "");
    placeNeedles.add(normalized);
    placeNeedles.add(compact);

    const code = inferCountryCodeFromText(normalized) ?? inferCountryCodeFromText(compact);
    if (code) {
      countryCodes.add(code);
      for (const alias of countryAliases(code)) {
        placeNeedles.add(alias);
      }
    }

    // City aliases that imply Sri Lanka when used alone.
    if (
      /\bcolombo\b|\bkandy\b|\bgalle\b|\bnegombo\b|\bjaffna\b|\bmatara\b/u.test(
        normalized,
      )
    ) {
      countryCodes.add("lk");
      for (const alias of countryAliases("lk")) placeNeedles.add(alias);
    }
  }

  return {
    allowRemote,
    placeNeedles: [...placeNeedles].filter(Boolean),
    countryCodes: [...countryCodes],
  };
}

export function linkedInGeoIdForLocations(
  preferredLocations: string[],
): string | null {
  const analysis = analyseLocationPreferences(preferredLocations);
  if (analysis.countryCodes.includes("lk")) return "100446352";
  return null;
}

function isRemoteLocation(location: string): boolean {
  return /\bremote\b|\bwfh\b|\bwork\s*from\s*home\b/iu.test(location);
}

function normalizePlace(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/&amp;/gu, "and")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ");
}

function inferCountryCodeFromText(text: string): string | null {
  const normalized = normalizePlace(text);
  const compact = normalized.replace(/\s+/gu, "");

  if (
    /\bsri\s*lanka\b/.test(normalized) ||
    compact === "lk" ||
    compact === "srilanka" ||
    /\bcolombo\b|\bkandy\b|\bgalle\b/.test(normalized)
  ) {
    return "lk";
  }
  if (
    /\bunited states\b|\busa\b|\bu s a\b/.test(normalized) ||
    compact === "us" ||
    /\bnew york\b|\bsan francisco\b|\bseattle\b|\baustin\b|\bchicago\b|\bminnesota\b|\bboston\b|\bbeaverton\b|\bminneapolis\b/.test(
      normalized,
    )
  ) {
    return "us";
  }
  if (
    /\bunited kingdom\b|\bengland\b|\bscotland\b|\blondon\b/.test(normalized) ||
    compact === "gb" ||
    compact === "uk"
  ) {
    return "gb";
  }
  if (/\bindia\b|\bbangalore\b|\bbengaluru\b|\bhyderabad\b|\bpune\b|\bchennai\b/.test(normalized) || compact === "in") {
    return "in";
  }
  if (/\bsingapore\b/.test(normalized) || compact === "sg") return "sg";
  if (/\baustralia\b|\bsydney\b|\bmelbourne\b/.test(normalized) || compact === "au") {
    return "au";
  }
  if (/\bcanada\b|\btoronto\b|\bvancouver\b/.test(normalized) || compact === "ca") {
    return "ca";
  }
  if (/\bgermany\b|\bberlin\b|\bmunich\b/.test(normalized) || compact === "de") {
    return "de";
  }
  return null;
}

function countryAliases(code: string): string[] {
  switch (code) {
    case "lk":
      return [
        "sri lanka",
        "srilanka",
        "lk",
        "colombo",
        "kandy",
        "galle",
        "western province",
        "southern province",
        "central province",
        "northern province",
        "eastern province",
        "north western province",
        "sabaragamuwa",
        "uva",
      ];
    case "us":
      return ["united states", "usa", "us"];
    case "gb":
      return ["united kingdom", "uk", "england", "london"];
    case "in":
      return ["india", "bangalore", "bengaluru", "hyderabad"];
    default:
      return [code];
  }
}
