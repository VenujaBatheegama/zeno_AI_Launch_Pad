import { z } from "zod";

import {
  careerStageBandSchema,
  confidenceLevelSchema,
  extractedJobAnalysisSchema,
  requirementCategorySchema,
  requirementImportanceSchema,
  type ExtractedJobAnalysis,
} from "./schemas";

/**
 * Canonical strict schema for Groq json_schema structured output.
 * Every object field is required; absent scalars use null; collections use [].
 * Requirement IDs are assigned server-side after a successful extraction.
 */
export const EXTRACTION_SCHEMA_VERSION = "job-requirements-schema-v1";

export const strictExtractedRequirementSchema = z
  .object({
    statement: z.string().min(1).max(240),
    category: requirementCategorySchema,
    importance: requirementImportanceSchema,
    explicit: z.boolean(),
    confidence: confidenceLevelSchema,
    source_quote: z.string().min(1).max(320),
    quantitative_threshold: z.string().max(80).nullable(),
  })
  .strict();

export const strictJobRequirementsExtractionSchema = z
  .object({
    opportunity_band: careerStageBandSchema,
    opportunity_confidence: confidenceLevelSchema,
    opportunity_reasons: z.array(z.string().min(1).max(200)).max(8),
    requirements: z.array(strictExtractedRequirementSchema).max(20),
    warnings: z.array(z.string().max(240)).max(12),
  })
  .strict();

export type StrictJobRequirementsExtraction = z.infer<
  typeof strictJobRequirementsExtractionSchema
>;

export function toExtractedJobAnalysis(
  raw: StrictJobRequirementsExtraction,
  requirementIds: string[],
): ExtractedJobAnalysis {
  const requirements = raw.requirements.map((requirement, index) => ({
    id: requirementIds[index] ?? requirementIds[0]!,
    ...requirement,
  }));

  return extractedJobAnalysisSchema.parse({
    opportunity_band: raw.opportunity_band,
    opportunity_confidence: raw.opportunity_confidence,
    opportunity_reasons: raw.opportunity_reasons,
    requirements,
    warnings: raw.warnings,
  });
}
