import { z } from "zod";

export const careerStageBandSchema = z.enum([
  "student_or_beginner",
  "internship_ready",
  "experienced_intern_or_graduate_ready",
  "early_career",
  "established_individual_contributor",
  "senior",
  "lead_or_management",
  "unknown",
]);
export type CareerStageBand = z.infer<typeof careerStageBandSchema>;

export const opportunityBandSchema = careerStageBandSchema;
export type OpportunityBand = z.infer<typeof opportunityBandSchema>;

export const descriptionQualitySchema = z.enum([
  "complete_or_good",
  "partial",
  "minimal",
  "unusable",
]);
export type DescriptionQuality = z.infer<typeof descriptionQualitySchema>;

export const requirementImportanceSchema = z.enum([
  "required",
  "preferred",
  "unclear",
]);
export type RequirementImportance = z.infer<typeof requirementImportanceSchema>;

export const requirementCategorySchema = z.enum([
  "skill",
  "technology",
  "experience",
  "education",
  "certification",
  "responsibility",
  "domain",
  "language",
  "location",
  "employment_type",
  "work_authorization",
  "soft_skill",
  "other",
]);
export type RequirementCategory = z.infer<typeof requirementCategorySchema>;

export const matchStatusSchema = z.enum([
  "matched",
  "partial",
  "gap",
  "unknown",
  "not_applicable",
]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const careerLevelSuitabilitySchema = z.enum([
  "aligned",
  "reasonable_step",
  "stretch",
  "below_target",
  "substantially_overleveled",
  "substantially_underleveled",
  "overridden_by_explicit_preference",
  "unknown",
]);
export type CareerLevelSuitability = z.infer<
  typeof careerLevelSuitabilitySchema
>;

export const confidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const jobRequirementSchema = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1),
    category: requirementCategorySchema,
    importance: requirementImportanceSchema,
    explicit: z.boolean(),
    confidence: confidenceLevelSchema,
    source_quote: z.string().min(1),
    quantitative_threshold: z.string().nullable(),
  })
  .strict();
export type JobRequirement = z.infer<typeof jobRequirementSchema>;

export const extractedJobAnalysisSchema = z
  .object({
    opportunity_band: opportunityBandSchema,
    opportunity_confidence: confidenceLevelSchema,
    opportunity_reasons: z.array(z.string().min(1)).max(8),
    requirements: z.array(jobRequirementSchema).max(40),
    warnings: z.array(z.string()).default([]),
  })
  .strict();
export type ExtractedJobAnalysis = z.infer<typeof extractedJobAnalysisSchema>;

export const requirementMatchSchema = z
  .object({
    requirement_id: z.string().min(1),
    status: matchStatusSchema,
    evidence_ids: z.array(z.uuid()),
    reason: z.string().min(1),
    confidence: confidenceLevelSchema,
    classifier: z.enum(["deterministic", "ai_assisted"]),
  })
  .strict();
export type RequirementMatch = z.infer<typeof requirementMatchSchema>;

export const extractedRequirementMatchesSchema = z
  .object({
    matches: z.array(requirementMatchSchema),
    warnings: z.array(z.string()).default([]),
  })
  .strict();

export const scoreBreakdownSchema = z
  .object({
    policy_version: z.string().min(1),
    weights: z.object({
      required: z.number(),
      preferred: z.number(),
      unclear: z.number(),
    }),
    credits: z.object({
      matched: z.number(),
      partial: z.number(),
      gap: z.number(),
      unknown: z.number(),
    }),
    contributions: z.array(
      z.object({
        requirement_id: z.string(),
        importance: requirementImportanceSchema,
        status: matchStatusSchema,
        weight: z.number(),
        credit: z.number(),
        contribution: z.number(),
      }),
    ),
    numerator: z.number(),
    denominator: z.number(),
    evidence_fit_score: z.number().min(0).max(100),
    unknown_count: z.number().int().nonnegative(),
    gap_count: z.number().int().nonnegative(),
    matched_count: z.number().int().nonnegative(),
    partial_count: z.number().int().nonnegative(),
  })
  .strict();
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
