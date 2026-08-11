import { z } from "zod";

import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";
import { emptyJobSearchPreferences } from "@/modules/job-discovery/domain/job";
import { alignJobToProfile } from "@/modules/job-discovery/domain/profile-alignment";
import { scoreJobRelevance } from "@/modules/job-discovery/domain/relevance";

import { CareerIntelligenceError } from "../domain/errors";
import { fingerprint } from "../domain/fingerprint";
import {
  MATCHING_POLICY_VERSION,
  SCORING_POLICY_VERSION,
} from "../domain/policy";
import { rankMatchesPersonalized } from "../domain/ranking";
import { buildMatchableProfileTerms } from "./build-profile-terms";
import type {
  CareerIntelligenceRepository,
  EscoOccupationResolver,
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
    evidenceRepository?: CareerEvidenceRepository;
    escoResolver?: EscoOccupationResolver;
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

  const preferences = profile?.preferences ?? emptyJobSearchPreferences;
  const evidenceSet = dependencies.evidenceRepository
    ? await settledNull(() =>
        dependencies.evidenceRepository!.getCurrent(parsed.userId),
      )
    : null;
  const profileTerms = await buildMatchableProfileTerms({
    preferences,
    evidence:
      evidenceSet?.status === "verified" ? evidenceSet.evidence : null,
    escoResolver: dependencies.escoResolver,
  });
  const hasExplicitInterests =
    preferences.preferred_interests.length > 0 ||
    preferences.excluded_interests.length > 0;

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
  const personalizedInputs = [];

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

    const searchRelevance = scoreJobRelevance(job, {
      role_titles: preferences.roles.slice(0, 5),
      locations: preferences.locations.slice(0, 3),
      work_modes: preferences.work_modes,
      employment_types: preferences.employment_types,
      experience_levels: preferences.experience_levels,
    });
    const alignment = alignJobToProfile({
      title: job.title,
      description: job.description,
      terms: profileTerms,
    });
    const rankingReasons: string[] = [];
    if (searchRelevance >= 70) rankingReasons.push("Strong match for your selected role");
    else if (searchRelevance >= 40) rankingReasons.push("Matches your selected role");
    for (const reason of alignment.reasons) rankingReasons.push(reason);
    rankingReasons.push(`Evidence fit: ${match.evidenceFitScore}%`);

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
      topMatched: summarizeMatches(match, "matched"),
      primaryGaps: summarizeMatches(match, "gap"),
      explanation: match.explanation,
      stale: softStale,
      eligible: match.hardConstraintEligible,
      queryProvenance: queryMap.get(job.listing_id) ?? [],
      searchRelevance,
      interestAlignment: alignment.interestScore,
      rankingReasons,
      preferredMatches: alignment.preferredMatches,
      verifiedMatches: alignment.verifiedMatches,
    };
    cards.push(card);
    personalizedInputs.push({
      listingId: card.listingId,
      jobId: card.jobId,
      eligible: card.eligible,
      evidenceFitScore: card.evidenceFitScore,
      careerLevel: card.careerLevel,
      confidence: card.confidence,
      publishedAt: job.published_at,
      searchRelevance,
      interestAlignment: alignment.interestScore,
      rankingReasons,
    });
  }

  const ranked = rankMatchesPersonalized(personalizedInputs, {
    hasExplicitInterests,
  });
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
    evidenceRepository?: CareerEvidenceRepository;
    escoResolver?: EscoOccupationResolver;
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
