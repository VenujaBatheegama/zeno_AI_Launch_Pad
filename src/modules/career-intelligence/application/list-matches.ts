import { z } from "zod";

import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";

import { CareerIntelligenceError } from "../domain/errors";
import { fingerprint } from "../domain/fingerprint";
import {
  MATCHING_POLICY_VERSION,
  SCORING_POLICY_VERSION,
} from "../domain/policy";
import { rankMatches } from "../domain/ranking";
import type {
  CareerIntelligenceRepository,
  JobMatchAnalysis,
  JobMatchDetails,
  RankedJobMatchCard,
} from "./ports";

const listSchema = z.object({
  userId: z.uuid(),
  includeDismissed: z.boolean().default(false),
});

const detailsSchema = z.object({
  userId: z.uuid(),
  listingId: z.uuid(),
});

export type ListRankedJobMatchesCommand = z.input<typeof listSchema>;
export type GetJobMatchDetailsCommand = z.input<typeof detailsSchema>;

export async function listRankedJobMatches(
  command: ListRankedJobMatchesCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
  },
): Promise<RankedJobMatchCard[]> {
  const parsed = listSchema.parse(command);

  const jobs = await dependencies.jobRepository.listJobs({
    userId: parsed.userId,
    includeDismissed: parsed.includeDismissed,
    limit: 100,
    offset: 0,
  });
  const matches = await dependencies.repository.listCurrentMatchAnalyses(
    parsed.userId,
  );
  const assessment = await settledNull(() =>
    dependencies.repository.getLatestCareerStageAssessment(parsed.userId),
  );
  const plan = await settledNull(() =>
    dependencies.repository.getLatestSearchPlan(parsed.userId),
  );
  const profile = await settledNull(() =>
    dependencies.jobRepository.getSearchProfile(parsed.userId),
  );

  const matchByListing = new Map(
    matches.map((item) => [item.listingId, item]),
  );
  const listingIds = jobs
    .map((job) => job.listing_id)
    .filter((id) => matchByListing.has(id));
  const queryMap =
    listingIds.length === 0
      ? new Map<string, string[]>()
      : ((await settledNull(() =>
          dependencies.repository.listQueryProvenance({
            userId: parsed.userId,
            listingIds,
          }),
        )) ?? new Map<string, string[]>());

  const cards: RankedJobMatchCard[] = [];

  for (const job of jobs) {
    const match = matchByListing.get(job.listing_id);
    if (!match) continue;

    const obsolete =
      match.status === "stale" ||
      match.matchingPolicyVersion !== MATCHING_POLICY_VERSION;
    if (obsolete) continue;

    const softStale =
      Boolean(
        assessment &&
          (match.careerStageAssessmentId !== assessment.id ||
            match.evidenceFingerprint !== assessment.evidenceFingerprint ||
            match.scoringPolicyVersion !== SCORING_POLICY_VERSION),
      ) ||
      Boolean(
        profile &&
          match.preferencesFingerprint !== fingerprint(profile.preferences),
      ) ||
      Boolean(plan && match.preferencesFingerprint !== plan.preferencesFingerprint);

    const topMatched = summarizeMatches(match, "matched");
    const primaryGaps = summarizeMatches(match, "gap");

    cards.push({
      listingId: job.listing_id,
      jobId: job.job_id,
      title: job.title,
      organizationName: job.organization_name,
      applicationUrl: job.application_url,
      userState: job.user_state,
      evidenceFitScore: match.evidenceFitScore,
      careerLevel: match.careerLevel,
      confidence: match.analysisConfidence,
      topMatched,
      primaryGaps,
      explanation: match.explanation,
      stale: softStale,
      eligible: match.hardConstraintEligible,
      queryProvenance: queryMap.get(job.listing_id) ?? [],
    });
  }

  const ranked = rankMatches(
    cards.map((card) => ({
      listingId: card.listingId,
      jobId: card.jobId,
      eligible: card.eligible,
      evidenceFitScore: card.evidenceFitScore,
      careerLevel: card.careerLevel,
      confidence: card.confidence,
      publishedAt:
        jobs.find((job) => job.listing_id === card.listingId)?.published_at ??
        null,
    })),
  );
  const order = new Map(ranked.map((item, index) => [item.listingId, index]));
  return cards.sort(
    (a, b) => (order.get(a.listingId) ?? 0) - (order.get(b.listingId) ?? 0),
  );
}

export async function getJobMatchDetails(
  command: GetJobMatchDetailsCommand,
  dependencies: {
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
  },
): Promise<JobMatchDetails> {
  const parsed = detailsSchema.parse(command);
  const cards = await listRankedJobMatches(
    { userId: parsed.userId, includeDismissed: true },
    dependencies,
  );
  const card = cards.find((item) => item.listingId === parsed.listingId);
  const analysis = await dependencies.repository.getJobAnalysisByListing(
    parsed.userId,
    parsed.listingId,
  );
  const match = await dependencies.repository.getMatchAnalysisByListing(
    parsed.userId,
    parsed.listingId,
  );
  const assessment =
    await dependencies.repository.getLatestCareerStageAssessment(parsed.userId);

  if (!card || !analysis || !match || !assessment) {
    throw new CareerIntelligenceError(
      "NOT_FOUND",
      "Match details are not available for that job yet.",
    );
  }

  const profile = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  if (profile) {
    const preferencesFingerprint = fingerprint(profile.preferences);
    if (match.preferencesFingerprint !== preferencesFingerprint) {
      card.stale = true;
    }
  }

  return {
    card,
    analysis,
    match,
    assessment,
  };
}

function summarizeMatches(
  match: JobMatchAnalysis,
  status: "matched" | "gap",
): string[] {
  return match.matches
    .filter((item) => item.status === status)
    .slice(0, 3)
    .map((item) => {
      const reason = item.reason.trim();
      if (reason.length <= 80) return reason;
      return `${reason.slice(0, 77)}…`;
    });
}

async function settledNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.warn("Optional matching context failed to load:", error);
    return null;
  }
}
