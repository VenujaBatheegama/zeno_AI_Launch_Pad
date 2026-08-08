import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import {
  CAPABILITY_AGGREGATION_POLICY_VERSION,
  CAPABILITY_AGGREGATION_WEIGHTS,
} from "./policy";
import type {
  CapabilityBand,
  CapabilitySignal,
  EvidenceContextType,
  ExtractedCapabilitySignals,
} from "./capability-schemas";
import { normalizeCapabilityLabel } from "./capability-taxonomy";
import { parsePartialDate } from "./experience";
import type { ConfidenceLevel } from "./schemas";

export type AggregatedCapability = {
  key: string;
  label: string;
  kind: CapabilitySignal["capability_type"];
  band: CapabilityBand;
  aggregateScore: number;
  confidence: ConfidenceLevel;
  evidenceIds: string[];
  signalCount: number;
  independentSources: number;
  maxDepth: number;
};

export type InferredDirection = {
  key: string;
  label: string;
  kind: CapabilitySignal["capability_type"];
  confidence: ConfidenceLevel;
  explanation: string;
  supportingEvidenceIds: string[];
};

export type CandidateCapabilityProfile = {
  evidenceFingerprint: string;
  extractionPolicyVersion: string;
  aggregationPolicyVersion: string;
  aggregates: AggregatedCapability[];
  directions: InferredDirection[];
  warnings: string[];
  createdAt: string;
};

const CONTEXT_SCORE: Record<EvidenceContextType, number> = {
  full_time_work: 1,
  internship: 0.85,
  independent_project: 0.7,
  academic_project: 0.55,
  certification: 0.45,
  skill_list: 0.15,
};

export function seedSkillListSignals(
  evidence: CareerEvidence,
): CapabilitySignal[] {
  return evidence.skills.map((skill) => {
    const normalized = normalizeCapabilityLabel(skill.name, "technology");
    return {
      capability_key: normalized.key,
      display_label: normalized.label,
      capability_type: "technology",
      evidence_ids: [skill.id],
      evidence_context: "skill_list",
      depth: 0,
      ownership_signal: false,
      source_quote: skill.source_quote,
      rationale:
        "Present on the verified skill list only; practical depth is not demonstrated by this entry alone.",
      warnings: [],
    };
  });
}

export function validateCapabilitySignals(input: {
  extracted: ExtractedCapabilitySignals;
  evidenceIds: Set<string>;
}): {
  signals: CapabilitySignal[];
  directions: ExtractedCapabilitySignals["direction_candidates"];
  warnings: string[];
} {
  const warnings = [...input.extracted.warnings];
  const signals: CapabilitySignal[] = [];

  for (const signal of input.extracted.signals) {
    const validIds = signal.evidence_ids.filter((id) =>
      input.evidenceIds.has(id),
    );
    if (validIds.length === 0) {
      warnings.push(
        `Dropped capability signal “${signal.display_label}” because evidence IDs were invalid.`,
      );
      continue;
    }
    const normalized = normalizeCapabilityLabel(
      signal.capability_key || signal.display_label,
      signal.capability_type,
    );
    // Skill-list context cannot claim deep practical use.
    const depth: CapabilitySignal["depth"] =
      signal.evidence_context === "skill_list"
        ? 0
        : signal.depth === "unknown"
          ? "unknown"
          : ([0, 1, 2, 3, 4] as const)[
              Math.min(Math.max(signal.depth, 0), 4)
            ]!;
    signals.push({
      ...signal,
      capability_key: normalized.key,
      display_label: signal.display_label || normalized.label,
      evidence_ids: validIds,
      depth,
    });
  }

  const directions = input.extracted.direction_candidates
    .map((direction) => ({
      ...direction,
      supporting_evidence_ids: direction.supporting_evidence_ids.filter((id) =>
        input.evidenceIds.has(id),
      ),
    }))
    .filter((direction) => direction.supporting_evidence_ids.length > 0);

  return { signals, directions, warnings };
}

export function aggregateCapabilitySignals(input: {
  signals: CapabilitySignal[];
  evidence: CareerEvidence;
  now?: Date;
}): AggregatedCapability[] {
  const now = input.now ?? new Date();
  const byKey = new Map<string, CapabilitySignal[]>();
  for (const signal of input.signals) {
    const list = byKey.get(signal.capability_key) ?? [];
    list.push(signal);
    byKey.set(signal.capability_key, list);
  }

  const aggregates: AggregatedCapability[] = [];
  for (const [key, signals] of byKey) {
    const capped = capCorrelatedSignals(signals);
    const depths = capped.flatMap((item) =>
      item.depth === "unknown" ? [] : [item.depth],
    );
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    const depthScore = depths.length === 0 ? 0.2 : maxDepth / 4;
    const contextScore = Math.max(
      ...capped.map((item) => CONTEXT_SCORE[item.evidence_context]),
    );
    const independentSources = countIndependentSources(capped);
    const repetitionScore = Math.min(1, (independentSources - 1) / 2);
    const ownershipScore = capped.some((item) => item.ownership_signal)
      ? 1
      : 0.2;
    const recencyScore = computeRecencyScore(capped, input.evidence, now);

    const aggregateScore =
      CAPABILITY_AGGREGATION_WEIGHTS.depth * depthScore +
      CAPABILITY_AGGREGATION_WEIGHTS.context * contextScore +
      CAPABILITY_AGGREGATION_WEIGHTS.recency * recencyScore +
      CAPABILITY_AGGREGATION_WEIGHTS.repetition * repetitionScore +
      CAPABILITY_AGGREGATION_WEIGHTS.ownership * ownershipScore;

    const band = bandFromAggregate({
      aggregateScore,
      maxDepth,
      onlySkillList: capped.every((item) => item.evidence_context === "skill_list"),
      unknownOnly: depths.length === 0,
    });

    aggregates.push({
      key,
      label: capped[0]?.display_label ?? key,
      kind: capped[0]?.capability_type ?? "technology",
      band,
      aggregateScore: Number(aggregateScore.toFixed(4)),
      confidence: confidenceFromSignals(capped, independentSources),
      evidenceIds: [...new Set(capped.flatMap((item) => item.evidence_ids))],
      signalCount: capped.length,
      independentSources,
      maxDepth,
    });
  }

  return aggregates.sort(
    (a, b) =>
      b.aggregateScore - a.aggregateScore || a.label.localeCompare(b.label),
  );
}

export function inferCurrentDirections(input: {
  aggregates: AggregatedCapability[];
  aiDirections: ExtractedCapabilitySignals["direction_candidates"];
  rejectInferredDirection: boolean;
}): InferredDirection[] {
  if (input.rejectInferredDirection) return [];

  const fromAi: InferredDirection[] = input.aiDirections.map((item) => ({
    key: item.key,
    label: item.label,
    kind: item.kind,
    confidence: item.confidence,
    explanation: `Your recent verified work suggests ${item.label}. ${item.explanation}`,
    supportingEvidenceIds: item.supporting_evidence_ids,
  }));

  if (fromAi.length > 0) return fromAi.slice(0, 3);

  const strongDomains = input.aggregates.filter(
    (item) =>
      (item.kind === "domain" || item.kind === "work_type") &&
      (item.band === "strongly_demonstrated" || item.band === "demonstrated"),
  );
  return strongDomains.slice(0, 2).map((item) => ({
    key: item.key,
    label: item.label,
    kind: item.kind,
    confidence: item.confidence,
    explanation: `Your recent verified work suggests ${item.label}, based on demonstrated capability evidence.`,
    supportingEvidenceIds: item.evidenceIds,
  }));
}

export function buildCandidateCapabilityProfile(input: {
  evidence: CareerEvidence;
  extracted: ExtractedCapabilitySignals;
  evidenceFingerprint: string;
  extractionPolicyVersion: string;
  rejectInferredDirection: boolean;
  createdAt: string;
  now?: Date;
}): CandidateCapabilityProfile {
  const evidenceIds = new Set([
    ...input.evidence.work_experience.map((item) => item.id),
    ...input.evidence.projects.map((item) => item.id),
    ...input.evidence.education.map((item) => item.id),
    ...input.evidence.skills.map((item) => item.id),
    ...input.evidence.certifications.map((item) => item.id),
  ]);
  const validated = validateCapabilitySignals({
    extracted: input.extracted,
    evidenceIds,
  });
  const seeded = seedSkillListSignals(input.evidence);
  const signals = [...seeded, ...validated.signals];
  const aggregates = aggregateCapabilitySignals({
    signals,
    evidence: input.evidence,
    now: input.now,
  });
  const directions = inferCurrentDirections({
    aggregates,
    aiDirections: validated.directions,
    rejectInferredDirection: input.rejectInferredDirection,
  });

  return {
    evidenceFingerprint: input.evidenceFingerprint,
    extractionPolicyVersion: input.extractionPolicyVersion,
    aggregationPolicyVersion: CAPABILITY_AGGREGATION_POLICY_VERSION,
    aggregates,
    directions,
    warnings: validated.warnings,
    createdAt: input.createdAt,
  };
}

function capCorrelatedSignals(signals: CapabilitySignal[]): CapabilitySignal[] {
  // Multiple bullets from one evidence item are not independent experiences.
  const byEvidence = new Map<string, CapabilitySignal>();
  for (const signal of signals) {
    const primary = signal.evidence_ids[0] ?? signal.rationale;
    const existing = byEvidence.get(primary);
    if (!existing) {
      byEvidence.set(primary, signal);
      continue;
    }
    const existingDepth =
      existing.depth === "unknown" ? -1 : existing.depth;
    const nextDepth = signal.depth === "unknown" ? -1 : signal.depth;
    if (nextDepth > existingDepth) byEvidence.set(primary, signal);
  }
  return [...byEvidence.values()];
}

function countIndependentSources(signals: CapabilitySignal[]): number {
  return new Set(signals.flatMap((item) => item.evidence_ids)).size;
}

function computeRecencyScore(
  signals: CapabilitySignal[],
  evidence: CareerEvidence,
  now: Date,
): number {
  const dates: Date[] = [];
  const ids = new Set(signals.flatMap((item) => item.evidence_ids));
  for (const work of evidence.work_experience) {
    if (!ids.has(work.id)) continue;
    const end = work.is_current
      ? now
      : parsePartialDate(work.end_date) ?? parsePartialDate(work.start_date);
    if (end) dates.push(end);
  }
  for (const project of evidence.projects) {
    if (!ids.has(project.id)) continue;
    const end =
      parsePartialDate(project.end_date) ?? parsePartialDate(project.start_date);
    if (end) dates.push(end);
  }
  if (dates.length === 0) return 0.35; // missing dates: neutral, not invented high recency
  const newest = Math.max(...dates.map((date) => date.getTime()));
  const ageYears =
    (now.getTime() - newest) / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears <= 0.5) return 1;
  if (ageYears <= 1.5) return 0.75;
  if (ageYears <= 3) return 0.5;
  return 0.25;
}

function bandFromAggregate(input: {
  aggregateScore: number;
  maxDepth: number;
  onlySkillList: boolean;
  unknownOnly: boolean;
}): CapabilityBand {
  if (input.unknownOnly) return "unknown";
  if (input.onlySkillList || input.maxDepth <= 0) {
    return "limited_evidence";
  }
  if (input.aggregateScore >= 0.72 && input.maxDepth >= 3) {
    return "strongly_demonstrated";
  }
  if (input.aggregateScore >= 0.5 && input.maxDepth >= 2) {
    return "demonstrated";
  }
  if (input.aggregateScore >= 0.35 || input.maxDepth >= 1) {
    return "developing";
  }
  return "limited_evidence";
}

function confidenceFromSignals(
  signals: CapabilitySignal[],
  independentSources: number,
): ConfidenceLevel {
  if (independentSources >= 3) return "high";
  if (independentSources === 2 || signals.some((item) => item.depth === 3 || item.depth === 4)) {
    return "medium";
  }
  return "low";
}
