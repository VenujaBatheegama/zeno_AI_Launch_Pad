import { z } from "zod";

export const cvModeSchema = z.enum(["one_page", "two_page"]);
export type CvMode = z.infer<typeof cvModeSchema>;

export const cvVariantStatusSchema = z.enum([
  "planning",
  "generating",
  "validating",
  "ready_to_render",
  "rendering",
  "ready",
  "failed",
]);
export type CvVariantStatus = z.infer<typeof cvVariantStatusSchema>;

export const keywordSupportStateSchema = z.enum([
  "supported",
  "transferable",
  "unsupported",
  "partial",
]);

export const jobAlignmentSchema = z.enum([
  "high",
  "medium",
  "low",
  "very_low",
]);
export type JobAlignment = z.infer<typeof jobAlignmentSchema>;

export const generationAssessmentSchema = z
  .object({
    factually_valid: z.boolean(),
    job_alignment: jobAlignmentSchema,
    supported_keywords: z.array(z.string()),
    missing_keywords: z.array(z.string()),
    unsupported_claims: z.array(z.string()),
    warnings: z.array(z.string()),
    generation_status: z.enum([
      "success",
      "success_with_fallback",
      "failed",
    ]),
  })
  .strict();
export type GenerationAssessment = z.infer<typeof generationAssessmentSchema>;

export const keywordAuditEntrySchema = z
  .object({
    keyword_id: z.string().min(1),
    keyword: z.string().min(1),
    priority: z.enum([
      "must_have",
      "responsibility",
      "preferred",
      "role_language",
    ]),
    support_state: keywordSupportStateSchema,
    supporting_fact_ids: z.array(z.string()),
    used: z.boolean(),
    locations: z.array(z.string()),
    omission_reason: z.string().nullable(),
  })
  .strict();
export type KeywordAuditEntry = z.infer<typeof keywordAuditEntrySchema>;

export const tailoredBulletSchema = z
  .object({
    text: z.string().min(1).max(320),
    fact_ids: z.array(z.string().min(1)).min(1),
    supported_keyword_ids: z.array(z.string()),
  })
  .strict();

export const tailoredCvContentSchema = z
  .object({
    /** Target positioning for this vacancy — not a historical job title. */
    target_title: z.string().min(1).max(120),
    summary: z
      .object({
        text: z.string().min(1).max(400),
        evidence_refs: z
          .array(
            z
              .object({
                career_item_id: z.string().min(1),
                fact_ids: z.array(z.string().min(1)).min(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .nullable(),
    experience: z.array(
      z
        .object({
          career_item_id: z.uuid(),
          bullets: z.array(tailoredBulletSchema).min(1).max(6),
        })
        .strict(),
    ),
    projects: z.array(
      z
        .object({
          career_item_id: z.uuid(),
          display_title: z.string().min(1).max(120),
          bullets: z.array(tailoredBulletSchema).min(1).max(4),
        })
        .strict(),
    ),
    ordered_skill_ids: z.array(z.uuid()),
    change_notes: z.array(
      z
        .object({
          career_item_id: z.string().min(1),
          explanation: z.string().min(1).max(280),
        })
        .strict(),
    ),
  })
  .strict();
export type TailoredCvContent = z.infer<typeof tailoredCvContentSchema>;

export const fragmentRepairSchema = z
  .object({
    bullets: z.array(tailoredBulletSchema).min(1).max(4),
  })
  .strict();
