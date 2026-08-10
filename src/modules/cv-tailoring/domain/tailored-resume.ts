import { z } from "zod";

import { jobAlignmentSchema } from "./schemas";

export const resumeTextSourceSchema = z.enum([
  "ai_generated",
  "user_edited",
  "verified_evidence",
]);
export type ResumeTextSource = z.infer<typeof resumeTextSourceSchema>;

export const resumeBulletSchema = z
  .object({
    text: z.string().min(8).max(320),
    factIds: z.array(z.string().min(1)).min(1),
    priority: z.number().int().optional(),
    source: resumeTextSourceSchema.default("ai_generated"),
  })
  .strict();
export type ResumeBullet = z.infer<typeof resumeBulletSchema>;

/** Project body copy — continuous prose, not bullet points. */
export const resumeParagraphSchema = z
  .object({
    text: z.string().min(40).max(1200),
    factIds: z.array(z.string().min(1)).min(1),
    priority: z.number().int().optional(),
    source: resumeTextSourceSchema.default("ai_generated"),
  })
  .strict();
export type ResumeParagraph = z.infer<typeof resumeParagraphSchema>;

export const resumeSkillGroupSchema = z
  .object({
    category: z.string().min(2).max(80),
    items: z.array(z.string().min(1).max(60)).min(1),
  })
  .strict();
export type ResumeSkillGroup = z.infer<typeof resumeSkillGroupSchema>;

export const resumeAssessmentSchema = z
  .object({
    factuallyValid: z.boolean(),
    jobAlignment: jobAlignmentSchema,
    supportedKeywords: z.array(z.string()),
    transferableKeywords: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    generationStatus: z.string(),
  })
  .strict();
export type ResumeAssessment = z.infer<typeof resumeAssessmentSchema>;

/**
 * Final validated CV JSON used by preview, PDF, persistence, and future editors.
 * Verified contact/employer/date fields are hydrated from evidence — not invented by Groq.
 */
export const tailoredResumeSchema = z
  .object({
    targetTitle: z.string().min(2).max(80),

    contact: z
      .object({
        fullName: z.string().min(1),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        location: z.string().nullable(),
        linkedinUrl: z.string().nullable().optional(),
        githubUrl: z.string().nullable().optional(),
        portfolioUrl: z.string().nullable().optional(),
      })
      .strict(),

    summary: z
      .object({
        text: z.string().min(20).max(700),
        factIds: z.array(z.string()),
        source: resumeTextSourceSchema.default("ai_generated"),
      })
      .strict(),

    skills: z.array(resumeSkillGroupSchema),

    experience: z.array(
      z
        .object({
          id: z.string().min(1),
          employer: z.string().min(1),
          title: z.string().min(1),
          location: z.string().optional(),
          startDate: z.string(),
          endDate: z.string().nullable(),
          isCurrent: z.boolean().optional(),
          bullets: z.array(resumeBulletSchema).min(1).max(6),
          priority: z.number().int().optional(),
        })
        .strict(),
    ),

    projects: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1),
          technologies: z.array(z.string()),
          url: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().nullable().optional(),
          paragraphs: z.array(resumeParagraphSchema).min(1).max(3),
          priority: z.number().int().optional(),
        })
        .strict(),
    ),

    education: z.array(
      z
        .object({
          id: z.string().optional(),
          institution: z.string().min(1),
          qualification: z.string(),
          location: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          details: z.array(z.string()).default([]),
        })
        .strict(),
    ),

    certifications: z
      .array(
        z
          .object({
            id: z.string().optional(),
            name: z.string().min(1),
            issuer: z.string().optional(),
            date: z.string().optional(),
          })
          .strict(),
      )
      .default([]),

    achievements: z
      .array(
        z
          .object({
            text: z.string().min(8),
            factIds: z.array(z.string()),
            priority: z.number().int().optional(),
          })
          .strict(),
      )
      .default([]),

    references: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            title: z.string().optional(),
            organization: z.string().optional(),
            email: z.string().nullable().optional(),
            phone: z.string().nullable().optional(),
          })
          .strict(),
      )
      .default([]),

    changeNotes: z.array(z.string()).default([]),

    assessment: resumeAssessmentSchema,
  })
  .strict();
export type TailoredResume = z.infer<typeof tailoredResumeSchema>;

/**
 * Lean Groq draft — verified identity fields are filled by assembleTailoredResume.
 */
export const groqResumeDraftSchema = z
  .object({
    targetTitle: z.string().min(2).max(80),
    summary: z
      .object({
        text: z.string().min(20).max(700),
        factIds: z.array(z.string()).default([]),
      })
      .strict(),
    skills: z.array(resumeSkillGroupSchema).default([]),
    experience: z.array(
      z
        .object({
          id: z.string().min(1),
          bullets: z.array(
            z
              .object({
                text: z.string().min(8).max(320),
                factIds: z.array(z.string().min(1)).min(1),
                priority: z.number().int().optional(),
              })
              .strict(),
          ),
          priority: z.number().int().optional(),
        })
        .strict(),
    ),
    projects: z.array(
      z
        .object({
          id: z.string().min(1),
          technologies: z.array(z.string()).default([]),
          /** Preferred: substantive project paragraphs. */
          paragraphs: z
            .array(
              z
                .object({
                  text: z.string().min(40).max(1200),
                  factIds: z.array(z.string().min(1)).min(1),
                  priority: z.number().int().optional(),
                })
                .strict(),
            )
            .min(1)
            .max(3)
            .optional(),
          /** Legacy bullet drafts — assembled into paragraphs when paragraphs absent. */
          bullets: z
            .array(
              z
                .object({
                  text: z.string().min(8).max(320),
                  factIds: z.array(z.string().min(1)).min(1),
                  priority: z.number().int().optional(),
                })
                .strict(),
            )
            .optional(),
          priority: z.number().int().optional(),
        })
        .strict()
        .superRefine((value, context) => {
          if (
            (!value.paragraphs || value.paragraphs.length === 0) &&
            (!value.bullets || value.bullets.length === 0)
          ) {
            context.addIssue({
              code: "custom",
              message: "Project draft requires paragraphs or bullets.",
              path: ["paragraphs"],
            });
          }
        }),
    ),
    achievements: z
      .array(
        z
          .object({
            text: z.string().min(8),
            factIds: z.array(z.string()),
            priority: z.number().int().optional(),
          })
          .strict(),
      )
      .default([]),
    changeNotes: z.array(z.string()).default([]),
  })
  .strict();
export type GroqResumeDraft = z.infer<typeof groqResumeDraftSchema>;

export const resumeDensitySchema = z.enum(["comfortable", "compact"]);
export type ResumeDensity = z.infer<typeof resumeDensitySchema>;

export function isTailoredResume(value: unknown): value is TailoredResume {
  return tailoredResumeSchema.safeParse(value).success;
}
