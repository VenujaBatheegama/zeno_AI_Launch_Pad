import type { JobSearchPreferences } from "@/modules/job-discovery/domain/job";

import type { AggregatedCapability } from "./capability-aggregation";
import type { CareerStageAssessment } from "./career-stage";
import {
  ROLE_FAMILY_CATALOG,
  type RoleFamilyKey,
} from "./policy";
import type { OpportunityBand } from "./schemas";

export type PlannedTitle = {
  familyKey: RoleFamilyKey | "custom";
  familyLabel: string;
  title: string;
  opportunityBand: OpportunityBand;
  source:
    | "explicit_preference"
    | "deterministic_mapping"
    | "preferred_technology"
    | "demonstrated_capability"
    | "exploration"
    | "alternative_lane";
  reason: string;
  priority: number;
};

/**
 * Build bounded, provider-searchable role titles.
 *
 * Only explicit roles / target families / non-empty capability intents influence
 * queries. Empty preference fields must not inject DevOps (or any other)
 * placeholder-like direction.
 */
export function expandRoleTitles(input: {
  preferences: JobSearchPreferences;
  assessment?: CareerStageAssessment | null;
  budget: number;
  /** When true, demonstrated capability may add closely related titles. */
  smartSkillAnalyserEnabled?: boolean;
  capabilityAggregates?: AggregatedCapability[];
}): PlannedTitle[] {
  const smart = Boolean(input.smartSkillAnalyserEnabled);
  const targetBands =
    input.assessment?.targetOpportunityBands?.length
      ? input.assessment.targetOpportunityBands
      : (["early_career"] as OpportunityBand[]);
  const stretchBands =
    input.assessment?.stretchOpportunityBands?.length
      ? input.assessment.stretchOpportunityBands
      : targetBands;

  const families = resolveFamilies([
    ...input.preferences.target_role_families,
    ...input.preferences.roles,
  ]);
  const titles: PlannedTitle[] = [];
  const seen = new Set<string>();

  const add = (candidate: PlannedTitle) => {
    const key = candidate.title.toLocaleLowerCase();
    if (seen.has(key)) return;
    if (
      input.preferences.excluded_keywords.some((keyword) =>
        new RegExp(
          `\\b${keyword.trim().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`,
          "iu",
        ).test(candidate.title),
      )
    ) {
      return;
    }
    seen.add(key);
    titles.push(candidate);
  };

  for (const role of input.preferences.roles) {
    const cleaned = cleanSearchTitle(role);
    if (!cleaned) continue;
    add({
      familyKey: families[0]?.key ?? "custom",
      familyLabel: families[0]?.label ?? "Custom",
      title: cleaned,
      opportunityBand: targetBands[0] ?? "unknown",
      source: "explicit_preference",
      reason: "Explicit desired role from saved preferences.",
      priority: 1,
    });
  }

  // Preference-only mode: stay on explicit roles (+ light family mapping).
  for (const family of families) {
    for (const band of targetBands) {
      const mapped =
        ROLE_FAMILY_CATALOG[family.key].titles_by_band[
          band as keyof (typeof ROLE_FAMILY_CATALOG)[RoleFamilyKey]["titles_by_band"]
        ] ?? [];
      for (const title of mapped) {
        add({
          familyKey: family.key,
          familyLabel: family.label,
          title,
          opportunityBand: band,
          source: "deterministic_mapping",
          reason: `Mapped from ${family.label} for opportunity band ${band}.`,
          priority: 2,
        });
      }
    }
  }

  if (smart && input.capabilityAggregates?.length) {
    for (const aggregate of input.capabilityAggregates.slice(0, 8)) {
      const label = aggregate.label?.trim();
      if (
        !label ||
        aggregate.band === "not_yet_demonstrated" ||
        aggregate.band === "unknown" ||
        aggregate.band === "limited_evidence"
      ) {
        continue;
      }
      const familyKey = familyForIntent(label, aggregate.key ?? label);
      if (!familyKey) continue;
      if (families[0] && familyKey !== families[0].key) continue;
      const band = targetBands[0] ?? "early_career";
      const title =
        ROLE_FAMILY_CATALOG[familyKey].titles_by_band[
          band as keyof (typeof ROLE_FAMILY_CATALOG)[RoleFamilyKey]["titles_by_band"]
        ]?.[0] ?? label;
      add({
        familyKey,
        familyLabel: ROLE_FAMILY_CATALOG[familyKey].label,
        title,
        opportunityBand: band,
        source: "demonstrated_capability",
        reason: "Closely related role supported by career profile evidence.",
        priority: 2,
      });
    }
  }

  // Only explicit non-empty intents may add an adjacent family title.
  const preferredIntents = (input.preferences.capability_intents ?? []).filter(
    (item) =>
      (item.mode === "prefer" || item.mode === "explore") &&
      item.label.trim().length > 0 &&
      !isPlaceholderPreference(item.label),
  );
  for (const intent of preferredIntents) {
    const familyKey = familyForIntent(intent.label, intent.key);
    if (!familyKey) continue;
    // Do not jump families unless the intent clearly names that family/domain.
    if (
      families[0] &&
      familyKey !== families[0].key &&
      intent.kind !== "domain" &&
      !explicitlyNamesFamily(intent.label, familyKey)
    ) {
      continue;
    }
    const band = targetBands[0] ?? "early_career";
    const title =
      ROLE_FAMILY_CATALOG[familyKey].titles_by_band[
        band as keyof (typeof ROLE_FAMILY_CATALOG)[RoleFamilyKey]["titles_by_band"]
      ]?.[0] ?? ROLE_FAMILY_CATALOG[familyKey].label;
    add({
      familyKey,
      familyLabel: ROLE_FAMILY_CATALOG[familyKey].label,
      title,
      opportunityBand: band,
      source:
        intent.mode === "explore" ? "exploration" : "preferred_technology",
      reason: `Explicit ${intent.mode} preference “${intent.label}”.`,
      priority: intent.mode === "explore" ? 5 : 3,
    });
  }

  const hasOnly = (input.preferences.capability_intents ?? []).some(
    (item) => item.mode === "only",
  );
  let alternative: PlannedTitle | null = null;
  if (!hasOnly && families[0]) {
    // Stay inside the user's primary family. Do not inject DevOps (or any
    // other catalog family) merely as breadth.
    const primaryFamily = families[0];
    const stretchBand = stretchBands[0] ?? targetBands[0] ?? "early_career";
    const altTitle =
      ROLE_FAMILY_CATALOG[primaryFamily.key].titles_by_band[
        stretchBand as keyof (typeof ROLE_FAMILY_CATALOG)[RoleFamilyKey]["titles_by_band"]
      ]?.at(-1) ??
      ROLE_FAMILY_CATALOG[primaryFamily.key].titles_by_band[
        targetBands[0] as keyof (typeof ROLE_FAMILY_CATALOG)[RoleFamilyKey]["titles_by_band"]
      ]?.[1];
    if (altTitle) {
      alternative = {
        familyKey: primaryFamily.key,
        familyLabel: primaryFamily.label,
        title: altTitle,
        opportunityBand: stretchBand,
        source: "alternative_lane",
        reason:
          "Broader title variant inside your preferred role family (not a different career track).",
        priority: 6,
      };
    }
  }

  const budget = Math.max(1, input.budget);
  const primaryBudget = alternative ? Math.max(1, budget - 1) : budget;
  const primary = titles
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
    .slice(0, primaryBudget);

  if (!alternative) return primary;
  if (
    primary.some(
      (item) =>
        item.title.toLocaleLowerCase() === alternative.title.toLocaleLowerCase(),
    )
  ) {
    return primary.slice(0, budget);
  }
  return [...primary, alternative].slice(0, budget);
}

function cleanSearchTitle(role: string): string {
  return role
    .replace(/\b(docker|kubernetes|k8s|terraform|aws|azure|gcp)\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function explicitlyNamesFamily(label: string, familyKey: RoleFamilyKey): boolean {
  const normalized = label.toLocaleLowerCase();
  const family = ROLE_FAMILY_CATALOG[familyKey];
  return (
    normalized.includes(family.label.toLocaleLowerCase()) ||
    family.keywords.some((keyword) => normalized.includes(keyword))
  );
}

function familyForIntent(label: string, key: string): RoleFamilyKey | null {
  const haystack = `${label} ${key}`.toLocaleLowerCase();
  if (
    /devops|platform engineer|sre|site reliability/u.test(haystack)
  ) {
    return "devops_platform";
  }
  if (/software|backend|frontend|full.?stack/u.test(haystack)) {
    return "software_engineering";
  }
  return null;
}

/** Exact UI example strings that must never be treated as saved preferences. */
function isPlaceholderPreference(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return PLACEHOLDER_EXAMPLES.has(normalized);
}

const PLACEHOLDER_EXAMPLES = new Set([
  // Exact historical placeholder strings from the preferences form.
  "software engineer, devops engineer",
  "sri lanka, colombo, remote",
  "senior, principal",
  "devops / platform, software engineering",
  "devops / platform",
  "docker, kubernetes, aws",
  "only when you want jobs removed",
  "e.g. software engineer",
  "e.g. colombo, remote",
  "e.g. senior",
  "e.g. software engineering",
  "e.g. docker",
  "e.g. terraform",
  "e.g. php",
  "leave blank unless you want this",
  "leave blank unless needed",
]);

function resolveFamilies(
  roles: string[],
): Array<{ key: RoleFamilyKey; label: string }> {
  const found = new Map<RoleFamilyKey, string>();
  for (const role of roles) {
    if (isPlaceholderPreference(role)) continue;
    const normalized = role.toLocaleLowerCase();
    for (const [key, family] of Object.entries(ROLE_FAMILY_CATALOG) as Array<
      [RoleFamilyKey, (typeof ROLE_FAMILY_CATALOG)[RoleFamilyKey]]
    >) {
      if (
        family.keywords.some((keyword) => normalized.includes(keyword)) ||
        normalized.includes(family.label.toLocaleLowerCase()) ||
        normalized.includes(key.replaceAll("_", " "))
      ) {
        found.set(key, family.label);
      }
    }
  }
  if (found.size === 0) {
    found.set(
      "software_engineering",
      ROLE_FAMILY_CATALOG.software_engineering.label,
    );
  }
  return [...found.entries()].map(([key, label]) => ({ key, label }));
}
