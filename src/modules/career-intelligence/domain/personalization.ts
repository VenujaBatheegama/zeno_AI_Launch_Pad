import type { JobSearchPreferences } from "@/modules/job-discovery/domain/job";

import type {
  AggregatedCapability,
  CandidateCapabilityProfile,
  InferredDirection,
} from "./capability-aggregation";
import type { PreferenceAlignmentTier } from "./capability-schemas";
import { normalizeCapabilityLabel } from "./capability-taxonomy";
import { extractComparableRequirementTerms } from "./matching";
import type { CareerLevelSuitability, ConfidenceLevel } from "./schemas";
import { PERSONALIZATION_POLICY_VERSION } from "./policy";

const tierRank: Record<PreferenceAlignmentTier, number> = {
  tier_a_direct: 0,
  tier_b_adjacent: 1,
  tier_c_alternative: 2,
  avoided: 3,
  excluded: 4,
};

const suitabilityRank: Record<CareerLevelSuitability, number> = {
  overridden_by_explicit_preference: 0,
  aligned: 1,
  reasonable_step: 2,
  stretch: 3,
  below_target: 4,
  substantially_underleveled: 5,
  substantially_overleveled: 6,
  unknown: 7,
};

const confidenceRank: Record<ConfidenceLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const bandScore: Record<AggregatedCapability["band"], number> = {
  strongly_demonstrated: 1,
  demonstrated: 0.8,
  developing: 0.5,
  limited_evidence: 0.25,
  not_yet_demonstrated: 0,
  unknown: 0.1,
};

export type PersonalizedRankInput = {
  listingId: string;
  jobId: string;
  title: string;
  requirementStatements: string[];
  evidenceFitScore: number;
  careerLevel: CareerLevelSuitability;
  confidence: ConfidenceLevel;
  hardConstraintEligible: boolean;
  hardConstraintReasons: string[];
  gapCount: number;
  publishedAt: string | null;
};

export type PersonalizedRankResult = PersonalizedRankInput & {
  preferenceTier: PreferenceAlignmentTier;
  preferenceReasons: string[];
  capabilityAlignmentScore: number;
  capabilityAlignmentReasons: string[];
  inferredDirectionAlignment: "aligned" | "adjacent" | "none";
  inferredDirectionReason: string | null;
  personalizationExplanation: string;
  policyVersion: string;
};

export function evaluatePreferenceHardEligibility(input: {
  preferences: JobSearchPreferences;
  title: string;
  requirementStatements: string[];
}): { eligible: boolean; reasons: string[]; tier?: PreferenceAlignmentTier } {
  const intents = input.preferences.capability_intents ?? [];
  const corpus = normalizeCorpus([
    input.title,
    ...input.requirementStatements,
  ]);

  const excludes = intents.filter((item) => item.mode === "exclude");
  for (const intent of excludes) {
    const key = normalizeCapabilityLabel(intent.key || intent.label, intent.kind)
      .key;
    if (corpusIncludes(corpus, key, intent.label)) {
      return {
        eligible: false,
        reasons: [
          `Explicitly excluded preference “${intent.label}” appears in this opportunity.`,
        ],
        tier: "excluded",
      };
    }
  }

  const only = intents.filter((item) => item.mode === "only");
  if (only.length > 0) {
    const matched = only.some((intent) => {
      const key = normalizeCapabilityLabel(
        intent.key || intent.label,
        intent.kind,
      ).key;
      return corpusIncludes(corpus, key, intent.label);
    });
    if (!matched) {
      return {
        eligible: false,
        reasons: [
          "Opportunity is outside the user's explicit “only” preference restriction.",
        ],
        tier: "excluded",
      };
    }
  }

  return { eligible: true, reasons: [] };
}

export function classifyPreferenceTier(input: {
  preferences: JobSearchPreferences;
  title: string;
  requirementStatements: string[];
}): { tier: PreferenceAlignmentTier; reasons: string[] } {
  const hard = evaluatePreferenceHardEligibility(input);
  if (!hard.eligible) {
    return { tier: "excluded", reasons: hard.reasons };
  }

  const corpus = normalizeCorpus([
    input.title,
    ...input.requirementStatements,
  ]);
  const intents = input.preferences.capability_intents ?? [];
  const families = [
    ...input.preferences.target_role_families,
    ...input.preferences.roles,
  ].map((item) => item.toLocaleLowerCase());

  const preferHits = intents.filter(
    (item) =>
      item.mode === "prefer" &&
      corpusIncludes(
        corpus,
        normalizeCapabilityLabel(item.key || item.label, item.kind).key,
        item.label,
      ),
  );
  const exploreHits = intents.filter(
    (item) =>
      item.mode === "explore" &&
      corpusIncludes(
        corpus,
        normalizeCapabilityLabel(item.key || item.label, item.kind).key,
        item.label,
      ),
  );
  const avoidHits = intents.filter(
    (item) =>
      item.mode === "avoid" &&
      corpusIncludes(
        corpus,
        normalizeCapabilityLabel(item.key || item.label, item.kind).key,
        item.label,
      ),
  );

  const roleHit = families.some((family) =>
    corpus.some((token) => token.includes(family) || family.includes(token)),
  );

  if (preferHits.length > 0 || roleHit) {
    return {
      tier: "tier_a_direct",
      reasons: [
        ...(roleHit
          ? ["Matches your explicit target role / role-family direction."]
          : []),
        ...preferHits.map(
          (item) => `Matches preferred ${item.kind} “${item.label}”.`,
        ),
      ],
    };
  }

  if (exploreHits.length > 0) {
    return {
      tier: "tier_b_adjacent",
      reasons: exploreHits.map(
        (item) =>
          `Adjacent to your explore interest “${item.label}” (weaker than prefer).`,
      ),
    };
  }

  if (avoidHits.length > 0) {
    return {
      tier: "avoided",
      reasons: avoidHits.map(
        (item) =>
          `Contains avoided preference “${item.label}” (retained below normal alternatives, not hard-filtered).`,
      ),
    };
  }

  return {
    tier: "tier_c_alternative",
    reasons: [
      "Career-appropriate alternative with weak/no explicit preference alignment.",
    ],
  };
}

export function scoreCapabilityAlignment(input: {
  profile: CandidateCapabilityProfile | null;
  requirementStatements: string[];
}): { score: number; reasons: string[] } {
  if (!input.profile || input.profile.aggregates.length === 0) {
    return { score: 0, reasons: [] };
  }

  const requiredTerms = dedupeTermKeys(
    input.requirementStatements.flatMap((statement) =>
      extractComparableRequirementTerms(statement),
    ),
  );
  if (requiredTerms.length === 0) {
    return { score: 0, reasons: [] };
  }

  const byKey = new Map(
    input.profile.aggregates.map((aggregate) => [aggregate.key, aggregate]),
  );
  let weighted = 0;
  const reasons: string[] = [];

  for (const term of requiredTerms) {
    const key = normalizeCapabilityLabel(term).key;
    const aggregate = byKey.get(key);
    if (!aggregate) {
      weighted += 0;
      continue;
    }
    weighted += bandScore[aggregate.band];
    if (
      aggregate.band === "strongly_demonstrated" ||
      aggregate.band === "demonstrated"
    ) {
      reasons.push(
        `${aggregate.label} is ${aggregate.band.replaceAll("_", " ")} in verified evidence.`,
      );
    } else if (
      aggregate.band === "developing" ||
      aggregate.band === "limited_evidence"
    ) {
      reasons.push(
        `${aggregate.label} appears in the role, but verified evidence is currently ${aggregate.band.replaceAll("_", " ")} — a genuine growth area, not a weakness claim.`,
      );
    }
  }

  return {
    score: Number((weighted / requiredTerms.length).toFixed(4)),
    reasons: reasons.slice(0, 4),
  };
}

function dedupeTermKeys(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const key = normalizeCapabilityLabel(term).key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result;
}

export function classifyInferredDirectionAlignment(input: {
  directions: InferredDirection[];
  title: string;
  requirementStatements: string[];
  rejectInferredDirection: boolean;
}): {
  alignment: "aligned" | "adjacent" | "none";
  reason: string | null;
} {
  if (input.rejectInferredDirection || input.directions.length === 0) {
    return { alignment: "none", reason: null };
  }
  const corpus = normalizeCorpus([
    input.title,
    ...input.requirementStatements,
  ]);
  for (const direction of input.directions) {
    if (corpusIncludes(corpus, direction.key, direction.label)) {
      return {
        alignment: "aligned",
        reason: direction.explanation,
      };
    }
  }
  return { alignment: "none", reason: null };
}

export function personalizeAndRankJobs(input: {
  preferences: JobSearchPreferences;
  profile: CandidateCapabilityProfile | null;
  jobs: PersonalizedRankInput[];
}): PersonalizedRankResult[] {
  const results = input.jobs.map((job) => {
    const pref = classifyPreferenceTier({
      preferences: input.preferences,
      title: job.title,
      requirementStatements: job.requirementStatements,
    });
    const capability = scoreCapabilityAlignment({
      profile: input.profile,
      requirementStatements: job.requirementStatements,
    });
    const inferred = classifyInferredDirectionAlignment({
      directions: input.profile?.directions ?? [],
      title: job.title,
      requirementStatements: job.requirementStatements,
      rejectInferredDirection: input.preferences.reject_inferred_direction,
    });

    const hardPref = evaluatePreferenceHardEligibility({
      preferences: input.preferences,
      title: job.title,
      requirementStatements: job.requirementStatements,
    });

    const explanation = buildPersonalizationExplanation({
      tier: pref.tier,
      preferenceReasons: pref.reasons,
      capabilityReasons: capability.reasons,
      inferred,
      evidenceFitScore: job.evidenceFitScore,
    });

    return {
      ...job,
      hardConstraintEligible: job.hardConstraintEligible && hardPref.eligible,
      hardConstraintReasons: [
        ...job.hardConstraintReasons,
        ...hardPref.reasons,
      ],
      preferenceTier: pref.tier,
      preferenceReasons: pref.reasons,
      capabilityAlignmentScore: capability.score,
      capabilityAlignmentReasons: capability.reasons,
      inferredDirectionAlignment: inferred.alignment,
      inferredDirectionReason: inferred.reason,
      personalizationExplanation: explanation,
      policyVersion: PERSONALIZATION_POLICY_VERSION,
    };
  });

  return results.sort((a, b) => {
    if (a.hardConstraintEligible !== b.hardConstraintEligible) {
      return a.hardConstraintEligible ? -1 : 1;
    }
    const tier = tierRank[a.preferenceTier] - tierRank[b.preferenceTier];
    if (tier !== 0) return tier;

    // Within tier: evidence fit, capability alignment, career level, gaps, confidence.
    if (b.evidenceFitScore !== a.evidenceFitScore) {
      return b.evidenceFitScore - a.evidenceFitScore;
    }
    if (b.capabilityAlignmentScore !== a.capabilityAlignmentScore) {
      return b.capabilityAlignmentScore - a.capabilityAlignmentScore;
    }
    const suitability =
      suitabilityRank[a.careerLevel] - suitabilityRank[b.careerLevel];
    if (suitability !== 0) return suitability;
    if (a.gapCount !== b.gapCount) return a.gapCount - b.gapCount;
    const confidence = confidenceRank[a.confidence] - confidenceRank[b.confidence];
    if (confidence !== 0) return confidence;

    // Inferred direction is a weak tie-breaker only.
    const inferredRank = {
      aligned: 0,
      adjacent: 1,
      none: 2,
    } as const;
    const inferred =
      inferredRank[a.inferredDirectionAlignment] -
      inferredRank[b.inferredDirectionAlignment];
    if (inferred !== 0) return inferred;

    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.jobId.localeCompare(b.jobId);
  });
}

function buildPersonalizationExplanation(input: {
  tier: PreferenceAlignmentTier;
  preferenceReasons: string[];
  capabilityReasons: string[];
  inferred: { alignment: string; reason: string | null };
  evidenceFitScore: number;
}): string {
  const parts = [
    `Preference tier: ${input.tier.replaceAll("_", " ")}.`,
    ...input.preferenceReasons.slice(0, 2),
    `Evidence-fit score ${input.evidenceFitScore}% (Slice 02 deterministic policy).`,
    ...input.capabilityReasons.slice(0, 2),
  ];
  if (input.inferred.reason) {
    parts.push(`Inferred direction (not a preference): ${input.inferred.reason}`);
  }
  return parts.join(" ");
}

function normalizeCorpus(values: string[]): string[] {
  return values
    .map((value) => value.toLocaleLowerCase())
    .filter(Boolean);
}

function corpusIncludes(
  corpus: string[],
  key: string,
  label: string,
): boolean {
  const needles = [
    key.replaceAll("_", " "),
    key.replaceAll("_", ""),
    label.toLocaleLowerCase(),
  ];
  return corpus.some((text) =>
    needles.some((needle) => needle && text.includes(needle)),
  );
}
