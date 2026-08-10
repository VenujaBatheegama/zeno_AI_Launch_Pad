import { z } from "zod";

import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type { JobDiscoveryRepository } from "@/modules/job-discovery/application/ports";

import { assessCareerStage } from "../domain/career-stage";
import { CareerIntelligenceError } from "../domain/errors";
import { fingerprint } from "../domain/fingerprint";
import {
  CAREER_STAGE_POLICY_VERSION,
} from "../domain/policy";
import type {
  CareerIntelligenceRepository,
  Clock,
  IdGenerator,
  PersistedCareerStageAssessment,
} from "./ports";

const commandSchema = z.object({
  userId: z.uuid(),
  force: z.boolean().default(false),
});

export type AssessCareerStageCommand = z.input<typeof commandSchema>;

export async function assessCareerStageForUser(
  command: AssessCareerStageCommand,
  dependencies: {
    evidenceRepository: CareerEvidenceRepository;
    jobRepository: JobDiscoveryRepository;
    repository: CareerIntelligenceRepository;
    createId: IdGenerator;
    now: Clock;
  },
): Promise<PersistedCareerStageAssessment> {
  const parsed = commandSchema.parse(command);
  const evidenceSet = await dependencies.evidenceRepository.getCurrent(
    parsed.userId,
  );
  if (!evidenceSet || evidenceSet.status !== "verified") {
    throw new CareerIntelligenceError(
      "EVIDENCE_REQUIRED",
      "Verify your career evidence before Zeno can assess career stage.",
    );
  }

  const profile = await dependencies.jobRepository.getSearchProfile(
    parsed.userId,
  );
  if (!profile || profile.preferences.roles.length === 0) {
    throw new CareerIntelligenceError(
      "PREFERENCES_REQUIRED",
      "Save job-search preferences with at least one desired role first.",
    );
  }

  const evidenceFingerprint = fingerprint({
    evidenceSetId: evidenceSet.id,
    updatedAt: evidenceSet.updatedAt,
    evidence: evidenceSet.evidence,
  });
  const preferencesFingerprint = fingerprint(profile.preferences);

  const existing = await dependencies.repository.getLatestCareerStageAssessment(
    parsed.userId,
  );
  if (
    !parsed.force &&
    existing &&
    existing.evidenceFingerprint !== "preferences-only" &&
    existing.evidenceFingerprint === evidenceFingerprint &&
    existing.preferencesFingerprint === preferencesFingerprint &&
    existing.policyVersion === CAREER_STAGE_POLICY_VERSION
  ) {
    return existing;
  }

  const assessedAt = dependencies.now().toISOString();
  const assessment = assessCareerStage({
    evidence: evidenceSet.evidence,
    preferences: profile.preferences,
    evidenceFingerprint,
    preferencesFingerprint,
    assessedAt,
  });

  await dependencies.repository.markMatchAnalysesStale({
    userId: parsed.userId,
    updatedAt: assessedAt,
  });

  return dependencies.repository.saveCareerStageAssessment({
    id: dependencies.createId(),
    userId: parsed.userId,
    evidenceSetId: evidenceSet.id,
    assessment,
    createdAt: assessedAt,
  });
}
