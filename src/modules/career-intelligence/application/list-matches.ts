import { z } from "zod";

import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";
import { emptyJobSearchPreferences } from "@/modules/job-discovery/domain/job";

import { CareerIntelligenceError } from "../domain/errors";
import { fingerprint } from "../domain/fingerprint";
import {
  MATCHING_POLICY_VERSION,
  SCORING_POLICY_VERSION,
} from "../domain/policy";
import { personalizeAndRankJobs } from "../domain/personalization";
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

  // Load core data sequentially-ish with settled helpers so one Supabase
  // timeout does not wipe the whole ranked list after a long analyse run.
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
  const capabilityProfile = await settledNull(() =>
    dependencies.repository.getLatestCapabilityProfile(parsed.userId),
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
  const analyses =
    listingIds.length === 0
      ? []
      : ((await settledNull(() =>
          dependencies.repository.listJobAnalysesByListingIds(
            parsed.userId,
            listingIds,
          ),
        )) ?? []);
  const requirementStatementsByListing = new Map(
    analyses.map((analysis) => [
      analysis.listingId,
      analysis.requirements.map((requirement) => requirement.statement),
    ]),
  );

  const cards: RankedJobMatchCard[] = [];
  const personalizationInputs = [];

  for (const job of jobs) {
    const match = matchByListing.get(job.listing_id);
    if (!match) continue;

    // Only hide truly obsolete matcher generations. Soft drift (preferences /
    // capability refresh) is shown with a stale flag instead of vanishing.
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
      Boolean(plan && match.preferencesFingerprint !== plan.preferencesFingerprint) ||
      Boolean(capabilityProfile && capabilityProfile.status === "stale");

    const topMatched = summarizeMatches(match, "matched");
    const primaryGaps = summarizeMatches(match, "gap");

    const card: RankedJobMatchCard = {
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
    };
    cards.push(card);
    personalizationInputs.push({
      listingId: job.listing_id,
      jobId: job.job_id,
      title: job.title,
      // Use real requirement statements — never match reasons. Reasons only
      // mention supported terms, which inflated alignment for thin single hits.
      requirementStatements:
        requirementStatementsByListing.get(job.listing_id) ?? [],
      evidenceFitScore: match.evidenceFitScore,
      careerLevel: match.careerLevel,
      confidence: match.analysisConfidence,
      hardConstraintEligible: match.hardConstraintEligible,
      hardConstraintReasons: match.hardConstraintReasons,
      gapCount: match.scoreBreakdown.gap_count,
      publishedAt: job.published_at,
    });
  }

  const preferences = profile?.preferences ?? emptyJobSearchPreferences;
  const hasPreferenceSignals =
    preferences.capability_intents.length > 0 ||
    preferences.target_role_families.length > 0;

  if (!hasPreferenceSignals && !capabilityProfile) {
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

  const personalized = personalizeAndRankJobs({
    preferences,
    profile: capabilityProfile
      ? {
          evidenceFingerprint: capabilityProfile.evidenceFingerprint,
          extractionPolicyVersion: capabilityProfile.extractionPolicyVersion,
          aggregationPolicyVersion: capabilityProfile.aggregationPolicyVersion,
          aggregates: capabilityProfile.aggregates,
          directions: capabilityProfile.directions,
          warnings: capabilityProfile.warnings,
          createdAt: capabilityProfile.createdAt,
        }
      : null,
    jobs: personalizationInputs,
  });

  const byListing = new Map(cards.map((card) => [card.listingId, card]));
  return personalized.flatMap((item) => {
    const card = byListing.get(item.listingId);
    if (!card) return [];
    return [
      {
        ...card,
        eligible: item.hardConstraintEligible,
        preferenceTier: item.preferenceTier,
        preferenceReasons: item.preferenceReasons,
        capabilityAlignmentScore: item.capabilityAlignmentScore,
        capabilityAlignmentReasons: item.capabilityAlignmentReasons,
        inferredDirectionAlignment: item.inferredDirectionAlignment,
        personalizationExplanation: item.personalizationExplanation,
        explanation: item.personalizationExplanation || card.explanation,
      },
    ];
  });
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
      // Prefer a short readable clause from the reason when requirement text
      // is not loaded (avoids N+1 Supabase reads that time out after analyse).
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
