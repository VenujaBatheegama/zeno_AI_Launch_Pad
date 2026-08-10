import { z } from "zod";

import {
  careerStageBandSchema,
  confidenceLevelSchema,
  extractedJobAnalysisSchema,
  extractedRequirementMatchesSchema,
  matchStatusSchema,
  requirementCategorySchema,
  requirementImportanceSchema,
  type ExtractedJobAnalysis,
  type RequirementMatch,
} from "./schemas";

/**
 * Loose tool schemas for Groq. Strict domain enums often fail tool validation
 * when the model invents a near-miss label; we coerce after the tool returns.
 */
export const looseJobAnalysisToolSchema = z.object({
  opportunity_band: z.string().min(1),
  opportunity_confidence: z.string().min(1).optional().default("low"),
  opportunity_reasons: z.array(z.string()).max(8).optional().default([]),
  requirements: z
    .array(
      z.object({
        id: z.string().min(1),
        statement: z.string().min(1),
        category: z.string().min(1).optional().default("other"),
        importance: z.string().min(1).optional().default("unclear"),
        explicit: z.boolean().optional().default(true),
        confidence: z.string().min(1).optional().default("low"),
        source_quote: z.string().min(1),
        quantitative_threshold: z.string().nullable().optional().default(null),
      }),
    )
    .max(40),
  warnings: z.array(z.string()).optional().default([]),
});

export const looseRequirementMatchesToolSchema = z.object({
  matches: z.array(
    z.object({
      requirement_id: z.string().min(1),
      status: z.string().min(1),
      evidence_ids: z.array(z.string()).optional().default([]),
      reason: z.string().min(1),
      confidence: z.string().min(1).optional().default("low"),
      classifier: z.enum(["deterministic", "ai_assisted"]).optional(),
    }),
  ),
  warnings: z.array(z.string()).optional().default([]),
});

export function normalizeExtractedJobAnalysis(
  raw: z.infer<typeof looseJobAnalysisToolSchema>,
): ExtractedJobAnalysis {
  const band = careerStageBandSchema.safeParse(
    normalizeToken(raw.opportunity_band),
  );
  const confidence = confidenceLevelSchema.safeParse(
    normalizeToken(raw.opportunity_confidence),
  );

  const requirements = raw.requirements.map((requirement) => {
    const category = requirementCategorySchema.safeParse(
      normalizeToken(requirement.category),
    );
    const importance = requirementImportanceSchema.safeParse(
      normalizeToken(requirement.importance),
    );
    const reqConfidence = confidenceLevelSchema.safeParse(
      normalizeToken(requirement.confidence),
    );
    return {
      id: requirement.id,
      statement: requirement.statement,
      category: category.success ? category.data : "other",
      importance: importance.success ? importance.data : "unclear",
      explicit: requirement.explicit,
      confidence: reqConfidence.success ? reqConfidence.data : "low",
      source_quote: requirement.source_quote,
      quantitative_threshold: requirement.quantitative_threshold,
    };
  });

  return extractedJobAnalysisSchema.parse({
    opportunity_band: band.success ? band.data : "unknown",
    opportunity_confidence: confidence.success ? confidence.data : "low",
    opportunity_reasons: raw.opportunity_reasons.filter(Boolean).slice(0, 8),
    requirements,
    warnings: [
      ...raw.warnings,
      ...(band.success ? [] : [`Coerced opportunity_band from “${raw.opportunity_band}”.`]),
    ],
  });
}

export function normalizeExtractedRequirementMatches(
  raw: z.infer<typeof looseRequirementMatchesToolSchema>,
): RequirementMatch[] {
  const parsed = extractedRequirementMatchesSchema.parse({
    matches: raw.matches.map((match) => {
      const status = matchStatusSchema.safeParse(normalizeToken(match.status));
      const confidence = confidenceLevelSchema.safeParse(
        normalizeToken(match.confidence),
      );
      const evidenceIds = match.evidence_ids.filter((id) =>
        z.uuid().safeParse(id).success,
      );
      return {
        requirement_id: match.requirement_id,
        status: status.success ? status.data : "unknown",
        evidence_ids: evidenceIds,
        reason: match.reason,
        confidence: confidence.success ? confidence.data : "low",
        classifier: match.classifier ?? "ai_assisted",
      };
    }),
    warnings: raw.warnings,
  });
  return parsed.matches;
}

function normalizeToken(value: string): string {
  const token = value.trim().toLocaleLowerCase().replace(/[\s/-]+/gu, "_");
  const aliases: Record<string, string> = {
    junior: "early_career",
    entry: "early_career",
    entry_career: "early_career",
    entry_level: "early_career",
    entry_level_to_mid_level: "early_career",
    mid_level: "early_career",
    graduate: "experienced_intern_or_graduate_ready",
    intern: "internship_ready",
    internship: "internship_ready",
    technical: "technology",
    technical_skill: "technology",
    tech: "technology",
    soft_skills: "soft_skill",
    soft: "soft_skill",
    job_responsibility: "responsibility",
    role: "responsibility",
    must: "required",
    must_have: "required",
    nice_to_have: "preferred",
  };
  return aliases[token] ?? token;
}
