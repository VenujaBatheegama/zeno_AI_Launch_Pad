export type GapObservation = {
  listingId: string;
  gaps: string[];
  evidenceFitScore: number;
};

export type AggregatedGap = {
  gapKey: string;
  gapLabel: string;
  frequency: number;
  percentage: number;
  affectedListingIds: string[];
  alreadySupported: boolean;
};

function normalizeGap(raw: string): { key: string; label: string } {
  const label = raw.trim().replace(/\s+/g, " ");
  const key = label.toLocaleLowerCase();
  return { key, label };
}

/**
 * Aggregate unsupported requirements from strong/recommended jobs only.
 */
export function aggregateCampaignGaps(input: {
  observations: GapObservation[];
  supportedSkillKeys: Set<string>;
  minScore: number;
  maxActions?: number;
}): AggregatedGap[] {
  const strong = input.observations.filter(
    (item) => item.evidenceFitScore >= input.minScore,
  );
  if (strong.length === 0) return [];

  const byGap = new Map<
    string,
    { label: string; listings: Set<string> }
  >();

  for (const observation of strong) {
    for (const gap of observation.gaps) {
      const { key, label } = normalizeGap(gap);
      if (!key) continue;
      const existing = byGap.get(key) ?? { label, listings: new Set() };
      existing.listings.add(observation.listingId);
      byGap.set(key, existing);
    }
  }

  const maxActions = input.maxActions ?? 2;
  return [...byGap.entries()]
    .map(([gapKey, value]) => {
      const frequency = value.listings.size;
      return {
        gapKey,
        gapLabel: value.label,
        frequency,
        percentage: Math.round((frequency / strong.length) * 100),
        affectedListingIds: [...value.listings],
        alreadySupported: input.supportedSkillKeys.has(gapKey),
      };
    })
    .filter((gap) => !gap.alreadySupported && gap.frequency >= 2)
    .sort((a, b) => b.frequency - a.frequency || b.percentage - a.percentage)
    .slice(0, maxActions);
}

export function growthActionCopy(gap: AggregatedGap): {
  whyItMatters: string;
  suggestedAction: string;
  evidenceArtifact: string;
  coverageImpact: string;
} {
  return {
    whyItMatters: `${gap.gapLabel} appeared in ${gap.frequency} of your recent strong job matches (${gap.percentage}%).`,
    suggestedAction: `Build a small project or learning artifact that demonstrates ${gap.gapLabel} with concrete outcomes you can verify in your career profile.`,
    evidenceArtifact: `Add a project, role bullet, or certification entry that explicitly covers ${gap.gapLabel}.`,
    coverageImpact: `Once verified, future recommendations requiring ${gap.gapLabel} can treat it as supported evidence instead of a gap.`,
  };
}
