import { z } from "zod";

import {
  careerEntityTypeSchema,
  type OnboardingTurnResult,
  type ProfileOperation,
} from "./profile-operations";

const operationFieldsSchema = z
  .object({
    full_name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    github_url: z.string().nullable().optional(),
    portfolio_url: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    employer: z.string().nullable().optional(),
    institution: z.string().nullable().optional(),
    qualification: z.string().nullable().optional(),
    field_of_study: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    names: z.array(z.string()).optional(),
    issuer: z.string().nullable().optional(),
    result: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    issued_date: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    is_current: z.boolean().optional(),
    bullets: z.array(z.string()).optional(),
    technologies: z.array(z.string()).optional(),
    details: z.array(z.string()).optional(),
    source_quote: z.string().nullable().optional(),
    append_bullets: z.boolean().optional(),
    append_technologies: z.boolean().optional(),
  })
  .strict();

/**
 * Flatter schema for Groq tool-calling. Mapped to ProfileOperation in code.
 */
export const groqOnboardingTurnToolSchema = z.object({
  assistantMessage: z.string().min(1),
  intent: z.enum([
    "provide_information",
    "ask_question",
    "correct_information",
    "remove_information",
    "add_another",
    "skip",
    "continue",
    "unknown",
  ]),
  operations: z.array(
    z.object({
      operation: z.enum(["create", "update", "remove"]),
      entityType: careerEntityTypeSchema,
      temporaryRecordId: z.string().nullable(),
      recordId: z.string().nullable(),
      expectedRevision: z.number().int().nonnegative().nullable(),
      fields: operationFieldsSchema.nullable(),
    }),
  ),
  clarificationRequired: z.boolean(),
  clarificationReason: z.string().nullable(),
  nextSection: z
    .enum([
      "about_you",
      "education",
      "experience",
      "projects",
      "skills",
      "certifications",
      "achievements",
      "links",
      "review",
    ])
    .nullable(),
  sectionStatus: z.enum([
    "in_progress",
    "needs_clarification",
    "ready_to_continue",
    "complete",
  ]),
  suggestedReplies: z.array(z.string()).max(6).default([]),
  focusedEntityId: z.string().nullable(),
});

export function mapGroqTurnToResult(
  value: z.infer<typeof groqOnboardingTurnToolSchema>,
): OnboardingTurnResult {
  const profileOperations: ProfileOperation[] = [];
  for (const [index, operation] of value.operations.entries()) {
    const fields = Object.fromEntries(
      Object.entries(operation.fields ?? {}).filter(
        ([, entry]) => entry !== undefined,
      ),
    );

    if (operation.operation === "create") {
      profileOperations.push({
        operation: "create",
        entityType: operation.entityType,
        temporaryRecordId:
          operation.temporaryRecordId?.trim() || `tmp-${index + 1}`,
        fields,
      });
      continue;
    }
    if (!operation.recordId?.trim()) continue;
    if (operation.operation === "update") {
      profileOperations.push({
        operation: "update",
        entityType: operation.entityType,
        recordId: operation.recordId,
        expectedRevision: operation.expectedRevision ?? undefined,
        fields,
      });
      continue;
    }
    profileOperations.push({
      operation: "remove",
      entityType: operation.entityType,
      recordId: operation.recordId,
      expectedRevision: operation.expectedRevision ?? undefined,
    });
  }

  return {
    assistantMessage: value.assistantMessage,
    intent: value.intent,
    profileOperations,
    clarificationRequired: value.clarificationRequired,
    clarificationReason: value.clarificationReason ?? undefined,
    nextSection: value.nextSection ?? undefined,
    sectionStatus: value.sectionStatus,
    // Suggestion chips are disabled — agent must ask in assistantMessage.
    suggestedReplies: [],
    focusedEntityId: value.focusedEntityId,
  };
}
