import type { ContentPlan } from "./content-plan";
import type { EvidenceSnapshot } from "./facts";
import { isClaimableCapabilityKeyword } from "./keywords";
import type {
  GenerationAssessment,
  JobAlignment,
  KeywordAuditEntry,
  TailoredCvContent,
} from "./schemas";

export type ValidationIssue = {
  code: string;
  path: string;
  message: string;
  repairable: boolean;
};

/**
 * Factual validity is separate from job alignment.
 * Low alignment never makes generation invalid.
 */
export type ValidationResult = {
  factuallyValid: boolean;
  jobAlignment: JobAlignment;
  supportedKeywords: string[];
  missingKeywords: string[];
  unsupportedClaims: string[];
  warnings: string[];
  generationStatus: GenerationAssessment["generation_status"];
  issues: ValidationIssue[];
  /** Alias of factuallyValid for call-site clarity. */
  ok: boolean;
};

const METRIC_PATTERN =
  /\b\d+(?:[.,]\d+)?\s*(?:%|percent|users?|customers?|requests?|x|times|million|billion|k\b)/iu;
const NUMBER_PATTERN = /\b\d+(?:[.,]\d+)?%?\b/gu;

const CLAIM_ISSUE_CODES = new Set([
  "UNSUPPORTED_TECHNOLOGY",
  "UNSUPPORTED_KEYWORD_INSERTED",
  "UNSUPPORTED_METRIC",
  "INVALID_FACT_ID",
  "PROJECT_RENAMED",
  "UNSAFE_CONTENT",
]);

export function validateTailoredContent(input: {
  content: TailoredCvContent;
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
  keywordAudit: KeywordAuditEntry[];
  usedFallback?: boolean;
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const selectedIds = new Set([
    ...input.plan.experienceItemIds,
    ...input.plan.projectItemIds,
    ...input.plan.skillItemIds,
    ...input.plan.educationItemIds,
    ...input.plan.certificationItemIds,
    "profile",
  ]);
  const factById = new Map(input.snapshot.facts.map((fact) => [fact.id, fact]));
  const itemById = new Map(input.snapshot.items.map((item) => [item.id, item]));
  const allowedTech = collectAllowedTechnologies(input.snapshot);
  // Only concrete unsupported capabilities are banned as claims — not generic
  // role/title language from the vacancy.
  const bannedClaimKeywords = input.keywordAudit
    .filter(
      (entry) =>
        (entry.support_state === "unsupported" ||
          entry.support_state === "transferable") &&
        entry.priority !== "role_language" &&
        isClaimableCapabilityKeyword(entry.keyword),
    )
    .map((entry) => entry.keyword);

  if (!input.content.target_title?.trim()) {
    issues.push({
      code: "MISSING_TARGET_TITLE",
      path: "target_title",
      message: "Target title positioning is required.",
      repairable: true,
    });
  }

  if (input.plan.requireSummary && !input.content.summary) {
    issues.push({
      code: "SUMMARY_REQUIRED",
      path: "summary",
      message: "A job-specific profile/summary is required.",
      repairable: true,
    });
  }

  if (input.content.summary) {
    if (input.content.summary.text.length > input.plan.summaryMaxChars) {
      issues.push({
        code: "SUMMARY_TOO_LONG",
        path: "summary",
        message: "Summary exceeds the configured character budget.",
        repairable: true,
      });
    }
    for (const ref of input.content.summary.evidence_refs) {
      if (!selectedIds.has(ref.career_item_id) && ref.career_item_id !== "profile") {
        issues.push({
          code: "UNKNOWN_SUMMARY_ITEM",
          path: "summary",
          message: `Summary cites unselected item ${ref.career_item_id}.`,
          repairable: true,
        });
      }
      for (const factId of ref.fact_ids) {
        const fact = factById.get(factId);
        if (!fact || fact.careerItemId !== ref.career_item_id) {
          issues.push({
            code: "INVALID_SUMMARY_FACT",
            path: "summary",
            message: `Summary cites invalid fact ${factId}.`,
            repairable: true,
          });
        }
      }
    }
    pushUnsafeContentIssues(input.content.summary.text, "summary", issues);
    for (const keyword of bannedClaimKeywords) {
      if (
        containsTerm(input.content.summary.text, keyword) &&
        /\b(experience|experienced|proficient|expertise|speciali[sz]ing)\b/iu.test(
          input.content.summary.text,
        )
      ) {
        issues.push({
          code: "UNSUPPORTED_KEYWORD_INSERTED",
          path: "summary",
          message: `Unsupported keyword “${keyword}” was claimed in the summary.`,
          repairable: true,
        });
      }
    }
  }

  const returnedProjectIds = input.content.projects.map(
    (item) => item.career_item_id,
  );
  const sameProjectSet =
    returnedProjectIds.length === input.plan.projectItemIds.length &&
    input.plan.projectItemIds.every((id) => returnedProjectIds.includes(id));
  if (!sameProjectSet && input.plan.projectItemIds.length > 0) {
    issues.push({
      code: "PROJECT_SELECTION_MISMATCH",
      path: "projects",
      message:
        "Returned projects do not match the deterministic project selection plan.",
      repairable: true,
    });
  }

  for (const [index, experience] of input.content.experience.entries()) {
    if (!input.plan.experienceItemIds.includes(experience.career_item_id)) {
      issues.push({
        code: "UNSELECTED_EXPERIENCE",
        path: `experience.${index}`,
        message: "Experience item was not selected for this plan.",
        repairable: true,
      });
      continue;
    }
    const item = itemById.get(experience.career_item_id);
    if (!item || item.type !== "work") {
      issues.push({
        code: "UNKNOWN_EXPERIENCE",
        path: `experience.${index}`,
        message: "Experience item is missing from the evidence snapshot.",
        repairable: true,
      });
      continue;
    }
    if (experience.bullets.length > input.plan.bulletsPerExperience) {
      issues.push({
        code: "TOO_MANY_BULLETS",
        path: `experience.${index}`,
        message: "Experience exceeds bullet budget.",
        repairable: true,
      });
    }
    validateBullets({
      bullets: experience.bullets,
      pathPrefix: `experience.${index}`,
      careerItemId: experience.career_item_id,
      factById,
      allowedTech,
      bannedClaimKeywords,
      bulletMaxChars: input.plan.bulletMaxChars,
      issues,
    });
  }

  for (const [index, project] of input.content.projects.entries()) {
    if (!input.plan.projectItemIds.includes(project.career_item_id)) {
      issues.push({
        code: "UNSELECTED_PROJECT",
        path: `projects.${index}`,
        message: "Project was not selected for this plan.",
        repairable: true,
      });
      continue;
    }
    const item = itemById.get(project.career_item_id);
    if (!item || item.type !== "project") {
      issues.push({
        code: "UNKNOWN_PROJECT",
        path: `projects.${index}`,
        message: "Project is missing from the evidence snapshot.",
        repairable: true,
      });
      continue;
    }
    if (
      normalizeLoose(project.display_title) !== normalizeLoose(item.name) &&
      !normalizeLoose(item.name).includes(normalizeLoose(project.display_title)) &&
      !normalizeLoose(project.display_title).includes(normalizeLoose(item.name))
    ) {
      issues.push({
        code: "PROJECT_RENAMED",
        path: `projects.${index}.display_title`,
        message: "Project display title diverges from the verified project name.",
        repairable: true,
      });
    }
    if (project.bullets.length > input.plan.bulletsPerProject) {
      issues.push({
        code: "TOO_MANY_BULLETS",
        path: `projects.${index}`,
        message: "Project exceeds bullet budget.",
        repairable: true,
      });
    }
    validateBullets({
      bullets: project.bullets,
      pathPrefix: `projects.${index}`,
      careerItemId: project.career_item_id,
      factById,
      allowedTech,
      bannedClaimKeywords,
      bulletMaxChars: input.plan.bulletMaxChars,
      issues,
      itemTechnologies: item.technologies,
    });
  }

  for (const skillId of input.content.ordered_skill_ids) {
    if (!input.plan.skillItemIds.includes(skillId)) {
      issues.push({
        code: "UNSELECTED_SKILL",
        path: "ordered_skill_ids",
        message: `Skill ${skillId} was not selected.`,
        repairable: true,
      });
    }
  }

  const allBulletTexts = [
    ...input.content.experience.flatMap((item) =>
      item.bullets.map((bullet) => bullet.text),
    ),
    ...input.content.projects.flatMap((item) =>
      item.bullets.map((bullet) => bullet.text),
    ),
  ];
  for (let i = 0; i < allBulletTexts.length; i += 1) {
    for (let j = i + 1; j < allBulletTexts.length; j += 1) {
      if (nearDuplicate(allBulletTexts[i]!, allBulletTexts[j]!)) {
        issues.push({
          code: "DUPLICATE_BULLET",
          path: `bullets.${i}`,
          message: "Near-duplicate bullets are not allowed.",
          repairable: true,
        });
      }
    }
  }

  const claimIssues = issues.filter((issue) => CLAIM_ISSUE_CODES.has(issue.code));
  const clean = issues.length === 0;

  const supportedKeywords = input.keywordAudit
    .filter(
      (entry) =>
        entry.support_state === "supported" || entry.support_state === "partial",
    )
    .map((entry) => entry.keyword);
  const missingKeywords = input.keywordAudit
    .filter(
      (entry) =>
        entry.support_state === "unsupported" ||
        entry.support_state === "transferable",
    )
    .map((entry) => entry.keyword);

  const warnings = [...input.plan.warnings];
  if (missingKeywords.length > 0) {
    warnings.push(
      `Missing/unsupported JD keywords (reported only, not blocking): ${missingKeywords
        .slice(0, 8)
        .join(", ")}.`,
    );
  }

  return {
    factuallyValid: clean,
    ok: clean,
    jobAlignment: input.plan.jobAlignment,
    supportedKeywords: [...new Set(supportedKeywords)],
    missingKeywords: [...new Set(missingKeywords)],
    unsupportedClaims: claimIssues.map((issue) => issue.message),
    warnings,
    generationStatus: clean
      ? input.usedFallback
        ? "success_with_fallback"
        : "success"
      : "failed",
    issues,
  };
}

export function toGenerationAssessment(
  result: ValidationResult,
): GenerationAssessment {
  return {
    factually_valid: result.factuallyValid,
    job_alignment: result.jobAlignment,
    supported_keywords: result.supportedKeywords,
    missing_keywords: result.missingKeywords,
    unsupported_claims: result.unsupportedClaims,
    warnings: result.warnings,
    generation_status: result.generationStatus,
  };
}

function validateBullets(input: {
  bullets: TailoredCvContent["experience"][number]["bullets"];
  pathPrefix: string;
  careerItemId: string;
  factById: Map<string, EvidenceSnapshot["facts"][number]>;
  allowedTech: Set<string>;
  bannedClaimKeywords: string[];
  bulletMaxChars: number;
  issues: ValidationIssue[];
  itemTechnologies?: string[];
}): void {
  for (const [index, bullet] of input.bullets.entries()) {
    const path = `${input.pathPrefix}.bullets.${index}`;
    if (!bullet.text.trim()) {
      input.issues.push({
        code: "EMPTY_BULLET",
        path,
        message: "Bullet text is empty.",
        repairable: true,
      });
    }
    if (bullet.text.length > input.bulletMaxChars) {
      input.issues.push({
        code: "BULLET_TOO_LONG",
        path,
        message: "Bullet exceeds character budget.",
        repairable: true,
      });
    }
    pushUnsafeContentIssues(bullet.text, path, input.issues);

    if (bullet.fact_ids.length === 0) {
      input.issues.push({
        code: "MISSING_FACT_IDS",
        path,
        message: "Bullet must cite at least one fact ID.",
        repairable: true,
      });
    }
    for (const factId of bullet.fact_ids) {
      const fact = input.factById.get(factId);
      if (!fact || fact.careerItemId !== input.careerItemId) {
        input.issues.push({
          code: "INVALID_FACT_ID",
          path,
          message: `Fact ${factId} is not valid for this career item.`,
          repairable: true,
        });
      }
    }

    const citedTexts = bullet.fact_ids
      .map((id) => input.factById.get(id)?.text ?? "")
      .join(" ");
    const numbers = bullet.text.match(NUMBER_PATTERN) ?? [];
    for (const number of numbers) {
      if (!citedTexts.includes(number) && METRIC_PATTERN.test(bullet.text)) {
        input.issues.push({
          code: "UNSUPPORTED_METRIC",
          path,
          message: `Metric/number “${number}” is not supported by cited facts.`,
          repairable: true,
        });
      }
    }

    const techMentions = extractTechMentions(bullet.text);
    for (const tech of techMentions) {
      const allowedHere =
        input.allowedTech.has(tech) ||
        (input.itemTechnologies ?? [])
          .map((value) => normalizeLoose(value))
          .includes(tech);
      if (!allowedHere) {
        input.issues.push({
          code: "UNSUPPORTED_TECHNOLOGY",
          path,
          message: `Technology “${tech}” is not supported by verified evidence.`,
          repairable: true,
        });
      }
    }

    for (const keyword of input.bannedClaimKeywords) {
      if (containsTerm(bullet.text, keyword)) {
        input.issues.push({
          code: "UNSUPPORTED_KEYWORD_INSERTED",
          path,
          message: `Unsupported job keyword “${keyword}” was inserted as candidate evidence.`,
          repairable: true,
        });
      }
    }
  }
}

function collectAllowedTechnologies(snapshot: EvidenceSnapshot): Set<string> {
  const allowed = new Set<string>();
  for (const fact of snapshot.facts) {
    if (
      fact.kind === "technology" ||
      fact.kind === "skill" ||
      fact.kind === "bullet"
    ) {
      for (const token of extractTechMentions(fact.text)) {
        allowed.add(token);
      }
      allowed.add(normalizeLoose(fact.text));
    }
  }
  for (const item of snapshot.items) {
    if (item.type === "project") {
      for (const tech of item.technologies) allowed.add(normalizeLoose(tech));
    }
    if (item.type === "skill") allowed.add(normalizeLoose(item.name));
  }
  return allowed;
}

function extractTechMentions(text: string): string[] {
  const known = [
    "python",
    "java",
    "javascript",
    "typescript",
    "react",
    "node.js",
    "nodejs",
    "docker",
    "kubernetes",
    "terraform",
    "aws",
    "azure",
    "gcp",
    "postgresql",
    "postgres",
    "django",
    "fastapi",
    "flask",
    "linux",
    "git",
  ];
  return known.filter((term) => containsTerm(text, term));
}

function pushUnsafeContentIssues(
  text: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (/```|<html|<\/|system prompt|ignore previous/iu.test(text)) {
    issues.push({
      code: "UNSAFE_CONTENT",
      path,
      message: "Generated text contains unsafe or leaked prompt/markup content.",
      repairable: true,
    });
  }
  if (/\bI\b|\bmy\b|\bme\b/u.test(text)) {
    issues.push({
      code: "FIRST_PERSON",
      path,
      message: "Bullets/summary must not use first-person pronouns.",
      repairable: true,
    });
  }
}

function nearDuplicate(a: string, b: string): boolean {
  const left = normalizeLoose(a);
  const right = normalizeLoose(b);
  if (left === right) return true;
  if (left.length < 24 || right.length < 24) return false;
  return left.includes(right) || right.includes(left);
}

function normalizeLoose(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/gu, " ");
}

function containsTerm(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`,
    "iu",
  ).test(haystack);
}

/** Build conservative bullets from verified source facts when repair fails. */
export function fallbackBulletsFromFacts(input: {
  careerItemId: string;
  snapshot: EvidenceSnapshot;
  maxBullets: number;
  maxChars: number;
}): TailoredCvContent["experience"][number]["bullets"] {
  const item = input.snapshot.items.find((entry) => entry.id === input.careerItemId);
  if (!item || (item.type !== "work" && item.type !== "project")) return [];
  return item.bullets.slice(0, input.maxBullets).map((text, index) => ({
    text,
    fact_ids: [`${input.careerItemId}:bullet:${index}`],
    supported_keyword_ids: [],
  }));
}
