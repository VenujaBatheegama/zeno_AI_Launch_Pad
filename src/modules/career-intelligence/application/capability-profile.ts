import { z } from "zod";

import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";

import {
  buildCandidateCapabilityProfile,
  seedSkillListSignals,
  validateCapabilitySignals,
} from "../domain/capability-aggregation";
import { CareerIntelligenceError } from "../domain/errors";
import { fingerprint } from "../domain/fingerprint";
import {
  CAPABILITY_AGGREGATION_POLICY_VERSION,
  CAPABILITY_EXTRACTION_POLICY_VERSION,
} from "../domain/policy";
import type {
  CapabilitySignalExtractor,
  CareerIntelligenceRepository,
  Clock,
  IdGenerator,
  PersistedCandidateCapabilityProfile,
} from "./ports";

const refreshSchema = z.object({
  userId: z.uuid(),
  force: z.boolean().default(false),
});

export type RefreshCandidateCapabilityProfileCommand = z.input<
  typeof refreshSchema
>;

export async function refreshCandidateCapabilityProfile(
  command: RefreshCandidateCapabilityProfileCommand,
  dependencies: {
    evidenceRepository: CareerEvidenceRepository;
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    extractor: CapabilitySignalExtractor;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<PersistedCandidateCapabilityProfile> {
  const parsed = refreshSchema.parse(command);
  const evidenceSet = await dependencies.evidenceRepository.getCurrent(
    parsed.userId,
  );
  if (!evidenceSet || evidenceSet.status !== "verified") {
    throw new CareerIntelligenceError(
      "EVIDENCE_REQUIRED",
      "Verify career evidence before building a capability profile.",
    );
  }

  const evidenceFingerprint = fingerprint({
    evidenceSetId: evidenceSet.id,
    updatedAt: evidenceSet.updatedAt,
    evidence: evidenceSet.evidence,
  });
  const existing = await dependencies.repository.getLatestCapabilityProfile(
    parsed.userId,
  );
  if (
    !parsed.force &&
    existing &&
    existing.status === "ready" &&
    existing.evidenceFingerprint === evidenceFingerprint &&
    existing.extractionPolicyVersion === CAPABILITY_EXTRACTION_POLICY_VERSION &&
    existing.aggregationPolicyVersion === CAPABILITY_AGGREGATION_POLICY_VERSION
  ) {
    return existing;
  }

  const profilePrefs = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  let extracted;
  try {
    extracted = await dependencies.extractor.extract(evidenceSet.evidence);
  } catch (error) {
    throw new CareerIntelligenceError(
      "AI_UNAVAILABLE",
      "Candidate capability analysis is temporarily unavailable.",
      { cause: error },
    );
  }

  const now = dependencies.now().toISOString();
  const built = buildCandidateCapabilityProfile({
    evidence: evidenceSet.evidence,
    extracted,
    evidenceFingerprint,
    extractionPolicyVersion: CAPABILITY_EXTRACTION_POLICY_VERSION,
    rejectInferredDirection:
      profilePrefs?.preferences.reject_inferred_direction ?? false,
    createdAt: now,
    now: dependencies.now(),
  });

  const evidenceIds = new Set([
    ...evidenceSet.evidence.work_experience.map((item) => item.id),
    ...evidenceSet.evidence.projects.map((item) => item.id),
    ...evidenceSet.evidence.skills.map((item) => item.id),
    ...evidenceSet.evidence.education.map((item) => item.id),
    ...evidenceSet.evidence.certifications.map((item) => item.id),
  ]);
  const validated = validateCapabilitySignals({
    extracted,
    evidenceIds,
  });
  const signals = [
    ...seedSkillListSignals(evidenceSet.evidence),
    ...validated.signals,
  ];

  return dependencies.repository.saveCapabilityProfile({
    id: existing?.id ?? dependencies.createId(),
    userId: parsed.userId,
    evidenceSetId: evidenceSet.id,
    evidenceFingerprint,
    extractionPolicyVersion: built.extractionPolicyVersion,
    aggregationPolicyVersion: built.aggregationPolicyVersion,
    status: "ready",
    warnings: built.warnings,
    aggregates: built.aggregates,
    directions: built.directions,
    signals,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function getCandidateCapabilityProfile(
  userId: string,
  repository: CareerIntelligenceRepository,
): Promise<PersistedCandidateCapabilityProfile | null> {
  return repository.getLatestCapabilityProfile(z.uuid().parse(userId));
}
