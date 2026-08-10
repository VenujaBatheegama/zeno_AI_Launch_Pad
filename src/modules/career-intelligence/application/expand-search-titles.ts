import type { OpportunityBand } from "../domain/schemas";
import {
  sourceForExpandedTitle,
  type EscoRoleResolution,
  type PlannedQuerySource,
} from "../domain/esco-selection";
import type { EscoOccupationResolver } from "./ports";

export type ExpandedSearchTitle = {
  title: string;
  originalRole: string;
  familyLabel: string;
  opportunityBand: OpportunityBand;
  priorityHint: number;
  reason: string;
  source: PlannedQuerySource;
};

export type ExpandSearchTitlesResult = {
  titles: ExpandedSearchTitle[];
  resolutions: EscoRoleResolution[];
  notices: string[];
};

/**
 * Expand explicit preference roles via ESCO. Exact user roles always come first;
 * preferred + capped alternatives fill remaining budget. Never uses a hardcoded
 * role-family catalog or career evidence.
 */
export async function expandSearchTitles(input: {
  roles: string[];
  budget: number;
  resolver: EscoOccupationResolver;
  opportunityBand?: OpportunityBand;
  excludedTitles?: string[];
}): Promise<ExpandSearchTitlesResult> {
  const roles = [
    ...new Set(
      input.roles.map((role) => role.trim()).filter((role) => role.length > 0),
    ),
  ];
  const excluded = new Set(
    (input.excludedTitles ?? []).map((title) => title.trim().toLocaleLowerCase()),
  );
  const band = input.opportunityBand ?? "early_career";
  const notices: string[] = [];
  const resolutions: EscoRoleResolution[] = [];
  const exactTitles: ExpandedSearchTitle[] = [];
  const preferredTitles: ExpandedSearchTitle[] = [];
  const alternativeTitles: ExpandedSearchTitle[] = [];

  for (const role of roles) {
    const resolution = await input.resolver.resolveRole(role);
    resolutions.push(resolution);
    if (resolution.notice) notices.push(resolution.notice);
    if (resolution.status !== "resolved" && !resolution.notice) {
      notices.push(
        resolution.status === "ambiguous"
          ? `ESCO was ambiguous for “${role}”; using the exact title only.`
          : `ESCO could not resolve “${role}”; using the exact title only.`,
      );
    }

    for (const title of resolution.searchTitles) {
      if (excluded.has(title.trim().toLocaleLowerCase())) continue;
      const source = sourceForExpandedTitle({ title, resolution });
      const entry: ExpandedSearchTitle = {
        title,
        originalRole: role,
        familyLabel: role,
        opportunityBand: band,
        priorityHint: 0,
        reason: reasonForSource(source, role),
        source,
      };
      if (source === "exact_role") exactTitles.push(entry);
      else if (source === "esco_preferred") preferredTitles.push(entry);
      else alternativeTitles.push(entry);
    }
  }

  const ordered = [...exactTitles, ...preferredTitles, ...alternativeTitles];
  const seen = new Set<string>();
  const titles: ExpandedSearchTitle[] = [];
  for (const entry of ordered) {
    const key = entry.title.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    titles.push({ ...entry, priorityHint: titles.length + 1 });
    if (titles.length >= input.budget) break;
  }

  return { titles, resolutions, notices: [...new Set(notices)] };
}

function reasonForSource(source: PlannedQuerySource, role: string): string {
  switch (source) {
    case "exact_role":
      return `Exact role from your preferences: ${role}.`;
    case "esco_preferred":
      return `ESCO preferred occupation title for “${role}”.`;
    case "esco_alternative":
      return `ESCO alternative title employers may use for “${role}”.`;
  }
}
