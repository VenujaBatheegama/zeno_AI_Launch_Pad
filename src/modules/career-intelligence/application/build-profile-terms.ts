import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type { JobSearchPreferences } from "@/modules/job-discovery/domain/job";
import type {
  MatchableProfileCategory,
  MatchableProfileTerm,
} from "@/modules/job-discovery/domain/profile-alignment";

import type { EscoOccupationResolver } from "./ports";

/**
 * Build ranking vocabulary from verified evidence + explicit interests.
 * ESCO expands same-concept labels only; failures keep the original term.
 */
export async function buildMatchableProfileTerms(input: {
  preferences: JobSearchPreferences;
  evidence: CareerEvidence | null | undefined;
  escoResolver?: EscoOccupationResolver | null;
}): Promise<MatchableProfileTerm[]> {
  const seeds: Array<{ term: string; category: MatchableProfileCategory }> = [];

  for (const skill of input.evidence?.skills ?? []) {
    const name = skill.name?.trim();
    if (name) seeds.push({ term: name, category: "verified" });
  }
  for (const project of input.evidence?.projects ?? []) {
    for (const tech of project.technologies ?? []) {
      const name = tech.trim();
      if (name) seeds.push({ term: name, category: "verified" });
    }
  }
  for (const interest of input.preferences.preferred_interests ?? []) {
    seeds.push({ term: interest, category: "preferred" });
  }
  for (const interest of input.preferences.excluded_interests ?? []) {
    seeds.push({ term: interest, category: "excluded" });
  }

  const deduped = dedupeSeeds(seeds);
  const terms: MatchableProfileTerm[] = [];

  for (const seed of deduped) {
    let labels = [seed.term];
    let escoUri: string | undefined;
    if (input.escoResolver) {
      try {
        const resolved = await input.escoResolver.resolveSkillLabels(seed.term);
        labels = resolved.labels.length > 0 ? resolved.labels : [seed.term];
        escoUri = resolved.conceptUri;
      } catch {
        labels = [seed.term];
      }
    }
    terms.push({
      originalTerm: seed.term,
      category: seed.category,
      escoUri,
      labels,
    });
  }

  return terms;
}

function dedupeSeeds(
  seeds: Array<{ term: string; category: MatchableProfileCategory }>,
): Array<{ term: string; category: MatchableProfileCategory }> {
  const seen = new Set<string>();
  const out: Array<{ term: string; category: MatchableProfileCategory }> = [];
  // Prefer preferred/excluded over verified when the same string appears.
  const order: MatchableProfileCategory[] = [
    "preferred",
    "excluded",
    "verified",
  ];
  for (const category of order) {
    for (const seed of seeds) {
      if (seed.category !== category) continue;
      const key = `${category}:${seed.term.trim().toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(seed);
    }
  }
  return out.slice(0, 40);
}
