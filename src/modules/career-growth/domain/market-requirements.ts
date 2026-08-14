import type { JobRequirement, RequirementMatch } from "@/modules/career-intelligence/domain/schemas";

import {
  DEFAULT_MARKET_MIN_ANALYSED_JOBS,
  MARKET_MIN_FREQUENCY,
} from "./policy";
import type { MarketRequirementStat, MarketSignals } from "./schemas";

export type AnalysedCampaignJob = {
  listingId: string;
  analysisStatus: "ready" | "not_analysable" | "failed";
  evidenceFitScore: number | null;
  requirements: JobRequirement[];
  matches: RequirementMatch[];
};

export function aggregateMarketRequirements(
  jobs: AnalysedCampaignJob[],
  options?: { minAnalysedJobs?: number; minScore?: number },
): MarketSignals {
  const minScore = options?.minScore ?? 0;
  const relevant = jobs.filter(
    (job) =>
      job.analysisStatus === "ready" &&
      job.requirements.length > 0 &&
      (job.evidenceFitScore === null || job.evidenceFitScore >= minScore),
  );
  const sampleSize = relevant.length;
  const byKey = new Map<
    string,
    { label: string; category: string; listings: Set<string>; gaps: Set<string> }
  >();

  for (const job of relevant) {
    const matchById = new Map(job.matches.map((item) => [item.requirement_id, item]));
    for (const requirement of job.requirements) {
      const key = normalizeRequirement(requirement.statement);
      if (!key) continue;
      const existing = byKey.get(key) ?? {
        label: requirement.statement.trim().replace(/\s+/g, " "),
        category: requirement.category,
        listings: new Set<string>(),
        gaps: new Set<string>(),
      };
      existing.listings.add(job.listingId);
      const match = matchById.get(requirement.id);
      if (match?.status === "gap" || match?.status === "partial") {
        existing.gaps.add(job.listingId);
      }
      byKey.set(key, existing);
    }
  }

  const requirements: MarketRequirementStat[] = [...byKey.entries()]
    .map(([key, value]) => {
      const frequency = value.listings.size;
      return {
        key,
        label: value.label,
        category: value.category,
        frequency,
        sampleSize,
        percentage: sampleSize === 0 ? 0 : Math.round((frequency / sampleSize) * 100),
        gapFrequency: value.gaps.size,
      };
    })
    .filter((item) => item.frequency >= MARKET_MIN_FREQUENCY)
    .sort(
      (a, b) =>
        b.gapFrequency - a.gapFrequency ||
        b.frequency - a.frequency ||
        a.label.localeCompare(b.label),
    )
    .slice(0, 12);

  return {
    analysedJobCount: jobs.filter((job) => job.analysisStatus === "ready").length,
    relevantJobCount: sampleSize,
    requirements,
  };
}

export function shouldRefineFromMarket(
  signals: MarketSignals,
  minAnalysedJobs = DEFAULT_MARKET_MIN_ANALYSED_JOBS,
): boolean {
  return signals.relevantJobCount >= minAnalysedJobs;
}

export function marketEvidenceSummary(signals: MarketSignals): string | null {
  const top = signals.requirements[0];
  if (!top || signals.relevantJobCount === 0) return null;
  return `${top.label} appeared in ${top.frequency} of ${signals.relevantJobCount} analysed roles in this campaign (${top.percentage}%).`;
}

function normalizeRequirement(statement: string): string {
  return statement.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
