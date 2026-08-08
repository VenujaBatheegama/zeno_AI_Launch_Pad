import { z } from "zod";

export const evidenceContextTypeSchema = z.enum([
  "full_time_work",
  "internship",
  "independent_project",
  "academic_project",
  "certification",
  "skill_list",
]);
export type EvidenceContextType = z.infer<typeof evidenceContextTypeSchema>;

export const capabilityDepthSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal("unknown"),
]);
export type CapabilityDepth = z.infer<typeof capabilityDepthSchema>;

export const capabilityBandSchema = z.enum([
  "strongly_demonstrated",
  "demonstrated",
  "developing",
  "limited_evidence",
  "not_yet_demonstrated",
  "unknown",
]);
export type CapabilityBand = z.infer<typeof capabilityBandSchema>;

export const capabilityKindSchema = z.enum([
  "technology",
  "domain",
  "work_type",
]);
export type CapabilityKind = z.infer<typeof capabilityKindSchema>;

export const capabilitySignalSchema = z
  .object({
    capability_key: z.string().min(1),
    display_label: z.string().min(1),
    capability_type: capabilityKindSchema,
    evidence_ids: z.array(z.uuid()).min(1),
    evidence_context: evidenceContextTypeSchema,
    depth: capabilityDepthSchema,
    ownership_signal: z.boolean(),
    source_quote: z.string().min(1).nullable(),
    rationale: z.string().min(1),
    warnings: z.array(z.string()).default([]),
  })
  .strict();
export type CapabilitySignal = z.infer<typeof capabilitySignalSchema>;

export const extractedCapabilitySignalsSchema = z
  .object({
    signals: z.array(capabilitySignalSchema).max(80),
    direction_candidates: z
      .array(
        z
          .object({
            key: z.string().min(1),
            label: z.string().min(1),
            kind: capabilityKindSchema,
            supporting_evidence_ids: z.array(z.uuid()),
            confidence: z.enum(["high", "medium", "low"]),
            explanation: z.string().min(1),
          })
          .strict(),
      )
      .max(5)
      .default([]),
    warnings: z.array(z.string()).default([]),
  })
  .strict();
export type ExtractedCapabilitySignals = z.infer<
  typeof extractedCapabilitySignalsSchema
>;

export const preferenceAlignmentTierSchema = z.enum([
  "tier_a_direct",
  "tier_b_adjacent",
  "tier_c_alternative",
  "avoided",
  "excluded",
]);
export type PreferenceAlignmentTier = z.infer<
  typeof preferenceAlignmentTierSchema
>;
