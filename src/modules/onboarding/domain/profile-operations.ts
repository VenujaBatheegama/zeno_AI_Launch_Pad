import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  careerEvidenceSchema,
  type CareerEvidence,
} from "@/modules/career-evidence/domain/evidence";

import type { OnboardingStage } from "./conversation-machine";
import { getCurrentScriptStep } from "./conversation-script";
import {
  distillBullets,
  distillTechnologies,
  extractTechnologies,
  isLowValueCvText,
} from "./distill-cv-content";

export const careerEntityTypeSchema = z.enum([
  "personal_details",
  "education",
  "experience",
  "project",
  "skill",
  "certification",
  "achievement",
  "professional_link",
]);
export type CareerEntityType = z.infer<typeof careerEntityTypeSchema>;

const fieldsSchema = z.record(z.string(), z.unknown());

export const profileOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("create"),
    entityType: careerEntityTypeSchema,
    temporaryRecordId: z.string().min(1),
    fields: fieldsSchema,
  }),
  z.object({
    operation: z.literal("update"),
    entityType: careerEntityTypeSchema,
    recordId: z.string().min(1),
    expectedRevision: z.number().int().nonnegative().optional(),
    fields: fieldsSchema,
  }),
  z.object({
    operation: z.literal("remove"),
    entityType: careerEntityTypeSchema,
    recordId: z.string().min(1),
    expectedRevision: z.number().int().nonnegative().optional(),
  }),
]);
export type ProfileOperation = z.infer<typeof profileOperationSchema>;

export const onboardingTurnResultSchema = z.object({
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
  profileOperations: z.array(profileOperationSchema).default([]),
  clarificationRequired: z.boolean().default(false),
  clarificationReason: z.string().optional(),
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
    .optional(),
  sectionStatus: z.enum([
    "in_progress",
    "needs_clarification",
    "ready_to_continue",
    "complete",
  ]),
  suggestedReplies: z.array(z.string()).max(6).optional(),
  focusedEntityId: z.string().nullable().optional(),
});
export type OnboardingTurnResult = z.infer<typeof onboardingTurnResultSchema>;

export type RejectedOperation = {
  operation: ProfileOperation;
  reason: string;
};

export type ApplyOperationsResult = {
  evidence: CareerEvidence;
  accepted: ProfileOperation[];
  rejected: RejectedOperation[];
  focusedEntityId: string | null;
  recordRevisions: Record<string, number>;
};

const partialDate = z
  .union([z.string().regex(/^\d{4}(-\d{2})?$/u), z.null()])
  .optional();

export function applyProfileOperations(input: {
  evidence: CareerEvidence;
  operations: ProfileOperation[];
  recordRevisions?: Record<string, number>;
  focusedEntityId?: string | null;
}): ApplyOperationsResult {
  let evidence = structuredClone(input.evidence);
  const revisions = { ...(input.recordRevisions ?? {}) };
  const accepted: ProfileOperation[] = [];
  const rejected: RejectedOperation[] = [];
  let focusedEntityId = input.focusedEntityId ?? null;
  const tempIdMap = new Map<string, string>();

  for (const operation of input.operations) {
    try {
      const parsed = profileOperationSchema.parse(operation);
      if (parsed.operation === "create") {
        const createdId = applyCreate(evidence, parsed, tempIdMap);
        if (!createdId) {
          rejected.push({
            operation: parsed,
            reason: "Empty or invalid create payload.",
          });
          continue;
        }
        revisions[createdId] = 1;
        focusedEntityId = createdId;
        accepted.push(parsed);
      } else if (parsed.operation === "update") {
        const recordId = resolveRecordId(parsed.recordId, tempIdMap);
        if (
          parsed.expectedRevision !== undefined &&
          (revisions[recordId] ?? 0) !== parsed.expectedRevision
        ) {
          rejected.push({
            operation: parsed,
            reason: "Stale revision — a newer edit already exists.",
          });
          continue;
        }
        const ok = applyUpdate(evidence, parsed.entityType, recordId, parsed.fields);
        if (!ok) {
          rejected.push({
            operation: parsed,
            reason: "Record not found or fields invalid.",
          });
          continue;
        }
        revisions[recordId] = (revisions[recordId] ?? 0) + 1;
        focusedEntityId = recordId;
        accepted.push(parsed);
      } else {
        const recordId = resolveRecordId(parsed.recordId, tempIdMap);
        if (
          parsed.expectedRevision !== undefined &&
          (revisions[recordId] ?? 0) !== parsed.expectedRevision
        ) {
          rejected.push({
            operation: parsed,
            reason: "Stale revision — a newer edit already exists.",
          });
          continue;
        }
        const ok = applyRemove(evidence, parsed.entityType, recordId);
        if (!ok) {
          rejected.push({
            operation: parsed,
            reason: "Record not found.",
          });
          continue;
        }
        delete revisions[recordId];
        if (focusedEntityId === recordId) focusedEntityId = null;
        accepted.push(parsed);
      }
    } catch (error) {
      rejected.push({
        operation,
        reason:
          error instanceof Error ? error.message : "Invalid operation shape.",
      });
    }
  }

  evidence = careerEvidenceSchema.parse(evidence);
  return {
    evidence,
    accepted,
    rejected,
    focusedEntityId,
    recordRevisions: revisions,
  };
}

export function progressFromEvidence(evidence: CareerEvidence): number {
  let score = 0;
  if (evidence.profile.full_name?.trim()) score += 12;
  if (evidence.profile.email?.trim()) score += 8;
  if (evidence.education.length > 0) score += 15;
  if (evidence.work_experience.length > 0) score += 20;
  if (evidence.projects.length > 0) score += 18;
  if (evidence.skills.length > 0) score += 17;
  if (evidence.certifications.length > 0) score += 5;
  if (evidence.achievements.length > 0) score += 5;
  return Math.min(100, score);
}

export function inferStageFromEvidence(
  evidence: CareerEvidence,
  completedScriptKeys: readonly string[] = [],
): OnboardingStage {
  return getCurrentScriptStep(evidence, completedScriptKeys).stage;
}

export function resolveNextStage(input: {
  current: OnboardingStage;
  proposed?: OnboardingStage;
  intent: OnboardingTurnResult["intent"];
  evidence: CareerEvidence;
  completedScriptKeys?: readonly string[];
}): OnboardingStage {
  // Script stage wins — LLM cannot jump ahead of the CV script.
  return inferStageFromEvidence(
    input.evidence,
    input.completedScriptKeys ?? [],
  );
}

function resolveRecordId(
  recordId: string,
  tempIdMap: Map<string, string>,
): string {
  return tempIdMap.get(recordId) ?? recordId;
}

function applyCreate(
  evidence: CareerEvidence,
  operation: Extract<ProfileOperation, { operation: "create" }>,
  tempIdMap: Map<string, string>,
): string | null {
  const id = randomUUID();
  const fields = operation.fields;

  switch (operation.entityType) {
    case "personal_details": {
      mergeProfile(evidence, fields);
      tempIdMap.set(operation.temporaryRecordId, "profile");
      return "profile";
    }
    case "professional_link": {
      mergeProfile(evidence, fields);
      tempIdMap.set(operation.temporaryRecordId, "profile");
      return "profile";
    }
    case "education": {
      const institution = stringOrEmpty(fields.institution);
      const qualification = nullableString(fields.qualification);
      if (!institution && !qualification) return null;
      evidence.education.push({
        id,
        origin: "user_edited",
        source_quote: stringOrNull(fields.source_quote) ?? qualification ?? institution,
        institution: institution || "Not specified",
        qualification,
        field_of_study: nullableString(fields.field_of_study),
        start_date: dateOrNull(fields.start_date),
        end_date: dateOrNull(fields.end_date),
        details: stringArray(fields.details),
      });
      tempIdMap.set(operation.temporaryRecordId, id);
      return id;
    }
    case "experience": {
      const role = stringOrEmpty(fields.role);
      const employer = stringOrEmpty(fields.employer);
      if (!role && !employer) return null;
      evidence.work_experience.push({
        id,
        origin: "user_edited",
        source_quote:
          stringOrNull(fields.source_quote) ??
          [role, employer].filter(Boolean).join(" at "),
        role: role || "Role",
        employer: employer || "Employer",
        location: nullableString(fields.location),
        start_date: dateOrNull(fields.start_date),
        end_date: dateOrNull(fields.end_date),
        is_current: Boolean(fields.is_current ?? !fields.end_date),
        bullets: distillBullets(stringArray(fields.bullets)),
      });
      tempIdMap.set(operation.temporaryRecordId, id);
      return id;
    }
    case "project": {
      const name = stringOrEmpty(fields.name);
      if (!name) return null;
      evidence.projects.push({
        id,
        origin: "user_edited",
        source_quote: stringOrNull(fields.source_quote) ?? name,
        name,
        role: nullableString(fields.role),
        start_date: dateOrNull(fields.start_date),
        end_date: dateOrNull(fields.end_date),
        bullets: distillBullets(stringArray(fields.bullets)),
        technologies: distillTechnologies(stringArray(fields.technologies)),
      });
      tempIdMap.set(operation.temporaryRecordId, id);
      return id;
    }
    case "skill": {
      const names = expandSkillNames(fields);
      if (names.length === 0) return null;
      let lastId = id;
      for (const [index, name] of names.entries()) {
        const skillId = index === 0 ? id : randomUUID();
        if (evidence.skills.some((skill) => normalizeSkill(skill.name) === normalizeSkill(name))) {
          continue;
        }
        evidence.skills.push({
          id: skillId,
          origin: "user_edited",
          source_quote: stringOrNull(fields.source_quote) ?? name,
          name,
        });
        lastId = skillId;
      }
      tempIdMap.set(operation.temporaryRecordId, lastId);
      return lastId;
    }
    case "certification": {
      const name = stringOrEmpty(fields.name);
      if (!name) return null;
      evidence.certifications.push({
        id,
        origin: "user_edited",
        source_quote: stringOrNull(fields.source_quote) ?? name,
        name,
        issuer: nullableString(fields.issuer),
        issued_date: dateOrNull(fields.issued_date),
      });
      tempIdMap.set(operation.temporaryRecordId, id);
      return id;
    }
    case "achievement": {
      const name = stringOrEmpty(fields.name);
      if (!name) return null;
      evidence.achievements.push({
        id,
        origin: "user_edited",
        source_quote: stringOrNull(fields.source_quote) ?? name,
        name,
        result: nullableString(fields.result),
        issuer: nullableString(fields.issuer),
        date: dateOrNull(fields.date),
      });
      tempIdMap.set(operation.temporaryRecordId, id);
      return id;
    }
    default:
      return null;
  }
}

function applyUpdate(
  evidence: CareerEvidence,
  entityType: CareerEntityType,
  recordId: string,
  fields: Record<string, unknown>,
): boolean {
  if (entityType === "personal_details" || entityType === "professional_link") {
    mergeProfile(evidence, fields);
    return true;
  }

  if (entityType === "experience") {
    const item = evidence.work_experience.find((entry) => entry.id === recordId);
    if (!item) return false;
    if (fields.role !== undefined) item.role = stringOrEmpty(fields.role) || item.role;
    if (fields.employer !== undefined) {
      item.employer = stringOrEmpty(fields.employer) || item.employer;
    }
    if (fields.location !== undefined) item.location = nullableString(fields.location);
    if (fields.start_date !== undefined) item.start_date = dateOrNull(fields.start_date);
    if (fields.end_date !== undefined) item.end_date = dateOrNull(fields.end_date);
    if (fields.is_current !== undefined) item.is_current = Boolean(fields.is_current);
    if (fields.bullets !== undefined) {
      const bullets = distillBullets(stringArray(fields.bullets));
      if (fields.append_bullets) {
        item.bullets = distillBullets([...item.bullets, ...bullets]);
      } else {
        item.bullets = bullets.length > 0 ? bullets : item.bullets;
      }
    }
    item.origin = "user_edited";
    return true;
  }

  if (entityType === "project") {
    const item = evidence.projects.find((entry) => entry.id === recordId);
    if (!item) return false;
    if (fields.name !== undefined) item.name = stringOrEmpty(fields.name) || item.name;
    if (fields.role !== undefined) item.role = nullableString(fields.role);
    if (fields.start_date !== undefined) item.start_date = dateOrNull(fields.start_date);
    if (fields.end_date !== undefined) item.end_date = dateOrNull(fields.end_date);
    if (fields.bullets !== undefined) {
      const bullets = distillBullets(stringArray(fields.bullets));
      item.bullets = fields.append_bullets
        ? distillBullets([...item.bullets, ...bullets])
        : bullets.length > 0
          ? bullets
          : item.bullets;
    }
    if (fields.technologies !== undefined) {
      const tech = distillTechnologies(stringArray(fields.technologies));
      item.technologies = fields.append_technologies
        ? uniqueStrings([...item.technologies, ...tech])
        : tech.length > 0
          ? tech
          : item.technologies;
    }
    item.origin = "user_edited";
    return true;
  }

  if (entityType === "education") {
    const item = evidence.education.find((entry) => entry.id === recordId);
    if (!item) return false;
    if (fields.institution !== undefined) {
      item.institution =
        stringOrEmpty(fields.institution) || item.institution || "Not specified";
    }
    if (fields.qualification !== undefined) {
      item.qualification = nullableString(fields.qualification);
    }
    if (fields.field_of_study !== undefined) {
      item.field_of_study = nullableString(fields.field_of_study);
    }
    if (fields.start_date !== undefined) item.start_date = dateOrNull(fields.start_date);
    if (fields.end_date !== undefined) item.end_date = dateOrNull(fields.end_date);
    item.origin = "user_edited";
    return true;
  }

  if (entityType === "skill") {
    const item = evidence.skills.find((entry) => entry.id === recordId);
    if (!item) return false;
    if (fields.name !== undefined) {
      const name = stringOrEmpty(fields.name);
      if (!name) return false;
      item.name = name;
      item.origin = "user_edited";
    }
    return true;
  }

  if (entityType === "certification") {
    const item = evidence.certifications.find((entry) => entry.id === recordId);
    if (!item) return false;
    if (fields.name !== undefined) item.name = stringOrEmpty(fields.name) || item.name;
    if (fields.issuer !== undefined) item.issuer = nullableString(fields.issuer);
    if (fields.issued_date !== undefined) {
      item.issued_date = dateOrNull(fields.issued_date);
    }
    item.origin = "user_edited";
    return true;
  }

  if (entityType === "achievement") {
    const item = evidence.achievements.find((entry) => entry.id === recordId);
    if (!item) return false;
    if (fields.name !== undefined) item.name = stringOrEmpty(fields.name) || item.name;
    if (fields.result !== undefined) item.result = nullableString(fields.result);
    if (fields.issuer !== undefined) item.issuer = nullableString(fields.issuer);
    if (fields.date !== undefined) item.date = dateOrNull(fields.date);
    item.origin = "user_edited";
    return true;
  }

  return false;
}

function applyRemove(
  evidence: CareerEvidence,
  entityType: CareerEntityType,
  recordId: string,
): boolean {
  const filterOut = <T extends { id: string }>(items: T[]) => {
    const next = items.filter((item) => item.id !== recordId);
    return { next, changed: next.length !== items.length };
  };

  switch (entityType) {
    case "experience": {
      const { next, changed } = filterOut(evidence.work_experience);
      evidence.work_experience = next;
      return changed;
    }
    case "project": {
      const { next, changed } = filterOut(evidence.projects);
      evidence.projects = next;
      return changed;
    }
    case "education": {
      const { next, changed } = filterOut(evidence.education);
      evidence.education = next;
      return changed;
    }
    case "skill": {
      const { next, changed } = filterOut(evidence.skills);
      evidence.skills = next;
      return changed;
    }
    case "certification": {
      const { next, changed } = filterOut(evidence.certifications);
      evidence.certifications = next;
      return changed;
    }
    case "achievement": {
      const { next, changed } = filterOut(evidence.achievements);
      evidence.achievements = next;
      return changed;
    }
    default:
      return false;
  }
}

function mergeProfile(
  evidence: CareerEvidence,
  fields: Record<string, unknown>,
) {
  const profile = evidence.profile;
  if (fields.full_name !== undefined) {
    profile.full_name = nullableString(fields.full_name);
  }
  if (fields.email !== undefined) profile.email = nullableString(fields.email);
  if (fields.phone !== undefined) profile.phone = nullableString(fields.phone);
  if (fields.location !== undefined) {
    profile.location = nullableString(fields.location);
  }
  if (fields.summary !== undefined) {
    profile.summary = nullableString(fields.summary);
  }
  if (fields.linkedin_url !== undefined) {
    profile.linkedin_url = nullableString(fields.linkedin_url);
  }
  if (fields.github_url !== undefined) {
    profile.github_url = nullableString(fields.github_url);
  }
  if (fields.portfolio_url !== undefined) {
    profile.portfolio_url = nullableString(fields.portfolio_url);
  }
}

function expandSkillNames(fields: Record<string, unknown>): string[] {
  if (Array.isArray(fields.names)) {
    return uniqueStrings(
      fields.names
        .flatMap((value) => normalizeSkillLabel(String(value)))
        .filter((value) => value && !isLowValueCvText(value)),
    );
  }
  if (typeof fields.name === "string") {
    const fromTech = extractTechnologies(fields.name);
    if (fromTech.length > 0) return uniqueStrings(fromTech);
    return uniqueStrings(
      fields.name
        .split(/,| and | & /i)
        .map((part) => part.trim())
        .filter((part) => part && !isLowValueCvText(part)),
    );
  }
  return [];
}

function normalizeSkillLabel(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const techs = extractTechnologies(trimmed);
  if (techs.length > 0) return techs;
  return [trimmed];
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return stringOrNull(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }
  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
}

function dateOrNull(value: unknown): string | null {
  const parsed = partialDate.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data ?? null;
}

function normalizeSkill(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeSkill(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}
