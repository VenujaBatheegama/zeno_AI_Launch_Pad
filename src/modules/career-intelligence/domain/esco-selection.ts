import { z } from "zod";

import { DEFAULT_ESCO_MAX_ALTERNATIVE_TITLES } from "./policy";

export const escoResolutionStatusSchema = z.enum([
  "resolved",
  "ambiguous",
  "unresolved",
]);
export type EscoResolutionStatus = z.infer<typeof escoResolutionStatusSchema>;

export const plannedQuerySourceSchema = z.enum([
  "exact_role",
  "esco_preferred",
  "esco_alternative",
]);
export type PlannedQuerySource = z.infer<typeof plannedQuerySourceSchema>;

export type EscoOccupationHit = {
  uri: string;
  title: string;
  /** Optional alternate labels from the same occupation. */
  alternativeLabels?: string[];
};

export type EscoRoleResolution = {
  originalRole: string;
  occupationId?: string;
  preferredTitle?: string;
  searchTitles: string[];
  status: EscoResolutionStatus;
  notice?: string;
};

const SENIORITY_TOKENS = [
  "trainee",
  "intern",
  "internship",
  "graduate",
  "junior",
  "associate",
  "mid",
  "senior",
  "lead",
  "principal",
  "staff",
  "head",
  "director",
] as const;

export function normalizeRoleTitle(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeRoleKey(value: string): string {
  return normalizeRoleTitle(value).toLocaleLowerCase();
}

function seniorityTokens(title: string): Set<string> {
  const normalized = normalizeRoleKey(title);
  const tokens = new Set<string>();
  for (const token of SENIORITY_TOKENS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "iu").test(normalized)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function seniorityCompatible(userRole: string, candidate: string): boolean {
  const user = seniorityTokens(userRole);
  const other = seniorityTokens(candidate);
  if (user.size === 0) return true;
  if (other.size === 0) return true;
  for (const token of user) {
    if (other.has(token)) return true;
  }
  return false;
}

function titlesClose(a: string, b: string): boolean {
  const left = normalizeRoleKey(a);
  const right = normalizeRoleKey(b);
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftParts = new Set(left.split(/\s+/u).filter(Boolean));
  const rightParts = right.split(/\s+/u).filter(Boolean);
  const overlap = rightParts.filter((part) => leftParts.has(part)).length;
  return overlap >= Math.min(2, rightParts.length);
}

/**
 * Deterministic ESCO title selection. Never pulls broader/narrower/related
 * occupations — only labels from the chosen top occupation hit (or exact role).
 */
export function selectSearchTitlesFromEscoHits(input: {
  originalRole: string;
  hits: EscoOccupationHit[];
  maxAlternatives?: number;
}): EscoRoleResolution {
  const originalRole = normalizeRoleTitle(input.originalRole);
  const maxAlternatives =
    input.maxAlternatives ?? DEFAULT_ESCO_MAX_ALTERNATIVE_TITLES;
  const exactKey = normalizeRoleKey(originalRole);

  if (!originalRole) {
    return {
      originalRole,
      searchTitles: [],
      status: "unresolved",
      notice: "Role title was empty.",
    };
  }

  if (input.hits.length === 0) {
    return {
      originalRole,
      searchTitles: [originalRole],
      status: "unresolved",
      notice: `No ESCO occupation matched “${originalRole}”; searching the exact title only.`,
    };
  }

  const top = input.hits[0]!;
  const second = input.hits[1];
  const topKey = normalizeRoleKey(top.title);
  const secondKey = second ? normalizeRoleKey(second.title) : null;

  // Ambiguous when two strong, distinct top hits look equally plausible.
  const ambiguous =
    Boolean(second) &&
    topKey !== secondKey &&
    !titlesClose(top.title, originalRole) &&
    !titlesClose(second!.title, originalRole) &&
    titlesClose(top.title, second!.title) === false &&
    Math.abs(topKey.length - secondKey!.length) < 8;

  if (ambiguous) {
    return {
      originalRole,
      occupationId: top.uri,
      searchTitles: [originalRole],
      status: "ambiguous",
      notice: `ESCO returned multiple occupations for “${originalRole}”; searching the exact title only.`,
    };
  }

  const searchTitles: string[] = [originalRole];
  const seen = new Set<string>([exactKey]);

  const preferred = normalizeRoleTitle(top.title);
  const preferredKey = normalizeRoleKey(preferred);
  if (
    preferredKey &&
    !seen.has(preferredKey) &&
    seniorityCompatible(originalRole, preferred) &&
    (titlesClose(originalRole, preferred) ||
      seniorityTokens(originalRole).size > 0)
  ) {
    searchTitles.push(preferred);
    seen.add(preferredKey);
  }

  const alternatives = [
    ...(top.alternativeLabels ?? []),
    ...input.hits
      .slice(1)
      .flatMap((hit) => [hit.title, ...(hit.alternativeLabels ?? [])]),
  ]
    .map(normalizeRoleTitle)
    .filter(Boolean);

  let addedAlternatives = 0;
  for (const alt of alternatives) {
    if (addedAlternatives >= maxAlternatives) break;
    const key = normalizeRoleKey(alt);
    if (!key || seen.has(key)) continue;
    if (!seniorityCompatible(originalRole, alt)) continue;
    // Prefer alternatives that share vocabulary with the user role or preferred title.
    if (
      !titlesClose(originalRole, alt) &&
      !(preferred && titlesClose(preferred, alt))
    ) {
      continue;
    }
    searchTitles.push(alt);
    seen.add(key);
    addedAlternatives += 1;
  }

  return {
    originalRole,
    occupationId: top.uri,
    preferredTitle:
      preferredKey && preferredKey !== exactKey ? preferred : undefined,
    searchTitles,
    status: "resolved",
  };
}

export function sourceForExpandedTitle(input: {
  title: string;
  resolution: EscoRoleResolution;
}): PlannedQuerySource {
  const key = normalizeRoleKey(input.title);
  if (key === normalizeRoleKey(input.resolution.originalRole)) {
    return "exact_role";
  }
  if (
    input.resolution.preferredTitle &&
    key === normalizeRoleKey(input.resolution.preferredTitle)
  ) {
    return "esco_preferred";
  }
  return "esco_alternative";
}
