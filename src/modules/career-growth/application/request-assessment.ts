import { CareerGrowthError } from "../domain/errors";
import {
  campaignCriteriaFingerprint,
  evidenceVersion,
  workloadVersion,
} from "../domain/fingerprints";
import { toCampaignIntent, toVerifiedEvidenceSummary } from "../domain/mappers";
import { calculateWorkload } from "../domain/workload";
import type { AssessmentMode, GrowthAssessmentRequest } from "../domain/schemas";
import type {
  CareerGrowthRepository,
  Clock,
  GrowthCampaignReader,
  GrowthEvidenceReader,
  IdGenerator,
} from "./ports";

export async function requestGrowthAssessment(
  input: {
    userId: string;
    campaignId: string;
    mode: AssessmentMode;
  },
  deps: {
    repository: CareerGrowthRepository;
    campaigns: GrowthCampaignReader;
    evidence: GrowthEvidenceReader;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<GrowthAssessmentRequest> {
  const campaign = await deps.campaigns.getCampaign(input.campaignId);
  if (!campaign || campaign.userId !== input.userId) {
    throw new CareerGrowthError("NOT_FOUND", "Job campaign was not found.");
  }
  const intent = toCampaignIntent(campaign);
  const evidenceSet = await deps.evidence.getCurrent(input.userId);
  const evidence = toVerifiedEvidenceSummary({
    evidenceSetId: evidenceSet?.id ?? null,
    status: evidenceSet?.status ?? null,
    updatedAt: evidenceSet?.updatedAt ?? null,
    evidence: evidenceSet?.evidence ?? null,
  });
  const projects = await deps.repository.listProjects({
    userId: input.userId,
    statuses: ["planned", "in_progress", "paused"],
  });
  const workload = calculateWorkload({
    intent,
    projects,
    gapKey: "role_alignment",
  });
  const criteriaFingerprint = campaignCriteriaFingerprint(intent);
  const evidenceVer = evidenceVersion(evidence);
  const workVer = workloadVersion(workload);
  const now = deps.now().toISOString();

  const existing = (
    await deps.repository.listAssessmentRequests({
      userId: input.userId,
      campaignId: input.campaignId,
      statuses: ["pending", "processing", "failed_retryable"],
    })
  ).find(
    (item) =>
      item.mode === input.mode &&
      item.criteriaFingerprint === criteriaFingerprint &&
      item.evidenceVersion === evidenceVer &&
      item.workloadVersion === workVer,
  );
  if (existing) return existing;

  return deps.repository.insertAssessmentRequest({
    id: deps.createId(),
    userId: input.userId,
    campaignId: input.campaignId,
    criteriaFingerprint,
    evidenceVersion: evidenceVer,
    workloadVersion: workVer,
    mode: input.mode,
    status: "pending",
    attemptCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    errorCategory: null,
    retryAfter: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
}
