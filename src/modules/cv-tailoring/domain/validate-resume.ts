import type { ContentPlan } from "./content-plan";
import type { EvidenceSnapshot } from "./facts";
import { isClaimableCapabilityKeyword } from "./keywords";
import { FORBIDDEN_CV_PHRASES } from "./policy";
import {
  buildSkillInventory,
  isSkillCategoryLabel,
  resolveSkillDisplay,
} from "./skill-inventory";
import type { KeywordAuditEntry } from "./schemas";
import type { TailoredResume } from "./tailored-resume";

export type ResumeValidationIssue = {
  code: string;
  path: string;
  message: string;
  repairable: boolean;
};

export type ResumeValidationResult = {
  ok: boolean;
  factuallyValid: boolean;
  issues: ResumeValidationIssue[];
  unsupportedClaims: string[];
};

const METRIC_PATTERN =
  /\b\d+(?:[.,]\d+)?\s*(?:%|percent|users?|customers?|requests?|x|times|million|billion|k\b)/iu;
const NUMBER_PATTERN = /\b\d+(?:[.,]\d+)?%?\b/gu;
const KNOWN_TECH = [
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
  "kotlin",
  "flutter",
  "firebase",
];

export function validateTailoredResume(input: {
  resume: TailoredResume;
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
  keywordAudit: KeywordAuditEntry[];
}): ResumeValidationResult {
  const issues: ResumeValidationIssue[] = [];
  const inventory = buildSkillInventory(input.snapshot);
  const itemById = new Map(input.snapshot.items.map((item) => [item.id, item]));
  const factById = new Map(input.snapshot.facts.map((fact) => [fact.id, fact]));
  const bannedKeywords = input.keywordAudit
    .filter(
      (entry) =>
        (entry.support_state === "unsupported" ||
          entry.support_state === "transferable") &&
        entry.priority !== "role_language" &&
        isClaimableCapabilityKeyword(entry.keyword),
    )
    .map((entry) => entry.keyword);

  if (!input.resume.targetTitle.trim()) {
    issues.push({
      code: "MISSING_TARGET_TITLE",
      path: "targetTitle",
      message: "Target title is required.",
      repairable: true,
    });
  }

  if (!input.resume.summary?.text?.trim()) {
    issues.push({
      code: "SUMMARY_REQUIRED",
      path: "summary",
      message: "Professional summary is required.",
      repairable: true,
    });
  } else {
    pushUnsafe(input.resume.summary.text, "summary", issues);
    if (looksLikeCategoryDump(input.resume.summary.text)) {
      issues.push({
        code: "SUMMARY_CATEGORY_DUMP",
        path: "summary",
        message: "Summary must not list skill-category labels as content.",
        repairable: true,
      });
    }
    for (const keyword of bannedKeywords) {
      if (
        containsTerm(input.resume.summary.text, keyword) &&
        /\b(experience|experienced|proficient|expertise|speciali[sz]ing)\b/iu.test(
          input.resume.summary.text,
        )
      ) {
        issues.push({
          code: "UNSUPPORTED_KEYWORD_INSERTED",
          path: "summary",
          message: `Unsupported keyword “${keyword}” claimed in summary.`,
          repairable: true,
        });
      }
    }
  }

  for (const [groupIndex, group] of input.resume.skills.entries()) {
    if (isSkillCategoryLabel(group.category) === false && group.items.length === 0) {
      issues.push({
        code: "EMPTY_SKILL_GROUP",
        path: `skills.${groupIndex}`,
        message: "Skill group has no items.",
        repairable: true,
      });
    }
    for (const [itemIndex, skill] of group.items.entries()) {
      if (isSkillCategoryLabel(skill)) {
        issues.push({
          code: "SKILL_CATEGORY_AS_VALUE",
          path: `skills.${groupIndex}.items.${itemIndex}`,
          message: `“${skill}” is a category label, not a skill value.`,
          repairable: true,
        });
        continue;
      }
      if (!resolveSkillDisplay(skill, inventory)) {
        issues.push({
          code: "UNSUPPORTED_SKILL",
          path: `skills.${groupIndex}.items.${itemIndex}`,
          message: `Skill “${skill}” is not present in verified evidence.`,
          repairable: true,
        });
      }
    }
  }

  const returnedExperienceIds = input.resume.experience.map((item) => item.id);
  for (const id of input.plan.experienceItemIds) {
    if (!returnedExperienceIds.includes(id) && input.plan.experienceItemIds.length > 0) {
      // Optional soft: experience can be omitted if no bullets; not always an error.
    }
  }

  for (const [index, experience] of input.resume.experience.entries()) {
    const item = itemById.get(experience.id);
    if (!item || item.type !== "work") {
      issues.push({
        code: "UNKNOWN_EXPERIENCE",
        path: `experience.${index}`,
        message: "Experience id missing from verified snapshot.",
        repairable: true,
      });
      continue;
    }
    if (normalize(experience.employer) !== normalize(item.employer)) {
      issues.push({
        code: "EMPLOYER_CHANGED",
        path: `experience.${index}.employer`,
        message: "Employer name does not match verified evidence.",
        repairable: true,
      });
    }
    if (normalize(experience.title) !== normalize(item.role)) {
      issues.push({
        code: "TITLE_CHANGED",
        path: `experience.${index}.title`,
        message: "Historical job title does not match verified evidence.",
        repairable: true,
      });
    }
    if ((experience.startDate || "") !== (item.start_date ?? "")) {
      issues.push({
        code: "DATE_CHANGED",
        path: `experience.${index}.startDate`,
        message: "Experience start date does not match verified evidence.",
        repairable: true,
      });
    }
    validateBullets({
      bullets: experience.bullets,
      pathPrefix: `experience.${index}`,
      careerItemId: experience.id,
      factById,
      bannedKeywords,
      inventoryKeys: inventory.keys,
      issues,
    });
  }

  const returnedProjectIds = input.resume.projects.map((item) => item.id);
  if (
    input.plan.projectItemIds.length > 0 &&
    (returnedProjectIds.length !== input.plan.projectItemIds.length ||
      !input.plan.projectItemIds.every((id) => returnedProjectIds.includes(id)))
  ) {
    issues.push({
      code: "PROJECT_SELECTION_MISMATCH",
      path: "projects",
      message: "Returned projects do not match the deterministic selection plan.",
      repairable: true,
    });
  }

  for (const [index, project] of input.resume.projects.entries()) {
    const item = itemById.get(project.id);
    if (!item || item.type !== "project") {
      issues.push({
        code: "UNKNOWN_PROJECT",
        path: `projects.${index}`,
        message: "Project id missing from verified snapshot.",
        repairable: true,
      });
      continue;
    }
    if (normalize(project.name) !== normalize(item.name)) {
      issues.push({
        code: "PROJECT_RENAMED",
        path: `projects.${index}.name`,
        message: "Project name does not match verified evidence.",
        repairable: true,
      });
    }
    for (const [techIndex, tech] of project.technologies.entries()) {
      const allowed =
        item.technologies.some(
          (value) => normalize(value) === normalize(tech),
        ) || Boolean(resolveSkillDisplay(tech, inventory));
      if (!allowed) {
        issues.push({
          code: "UNSUPPORTED_TECHNOLOGY",
          path: `projects.${index}.technologies.${techIndex}`,
          message: `Technology “${tech}” is not supported for this project.`,
          repairable: true,
        });
      }
    }
    if (project.paragraphs.length > input.plan.paragraphsPerProject) {
      issues.push({
        code: "TOO_MANY_PARAGRAPHS",
        path: `projects.${index}.paragraphs`,
        message: "Project exceeds paragraph budget.",
        repairable: true,
      });
    }
    validateBullets({
      bullets: project.paragraphs,
      pathPrefix: `projects.${index}.paragraphs`,
      careerItemId: project.id,
      factById,
      bannedKeywords,
      inventoryKeys: inventory.keys,
      issues,
      itemTechnologies: item.technologies,
    });
  }

  const claimCodes = new Set([
    "UNSUPPORTED_TECHNOLOGY",
    "UNSUPPORTED_KEYWORD_INSERTED",
    "UNSUPPORTED_METRIC",
    "UNSUPPORTED_SKILL",
    "SKILL_CATEGORY_AS_VALUE",
    "INVALID_FACT_ID",
    "PROJECT_RENAMED",
    "EMPLOYER_CHANGED",
    "TITLE_CHANGED",
    "DATE_CHANGED",
    "UNSAFE_CONTENT",
    "FORBIDDEN_PHRASE",
    "SUMMARY_CATEGORY_DUMP",
  ]);
  const unsupportedClaims = issues
    .filter((issue) => claimCodes.has(issue.code))
    .map((issue) => issue.message);

  return {
    ok: issues.length === 0,
    factuallyValid: issues.length === 0,
    issues,
    unsupportedClaims,
  };
}

function validateBullets(input: {
  bullets: Array<{ text: string; factIds: string[] }>;
  pathPrefix: string;
  careerItemId: string;
  factById: Map<string, EvidenceSnapshot["facts"][number]>;
  bannedKeywords: string[];
  inventoryKeys: Set<string>;
  issues: ResumeValidationIssue[];
  itemTechnologies?: string[];
}): void {
  for (const [index, bullet] of input.bullets.entries()) {
    const path = `${input.pathPrefix}.${index}`;
    if (!bullet.text.trim()) {
      input.issues.push({
        code: "EMPTY_BULLET",
        path,
        message: "Bullet text is empty.",
        repairable: true,
      });
    }
    pushUnsafe(bullet.text, path, input.issues);
    if (bullet.factIds.length === 0) {
      input.issues.push({
        code: "MISSING_FACT_IDS",
        path,
        message: "Bullet must cite at least one fact ID.",
        repairable: true,
      });
    }
    for (const factId of bullet.factIds) {
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

    const cited = bullet.factIds
      .map((id) => input.factById.get(id)?.text ?? "")
      .join(" ");
    const numbers = bullet.text.match(NUMBER_PATTERN) ?? [];
    for (const number of numbers) {
      if (!cited.includes(number) && METRIC_PATTERN.test(bullet.text)) {
        input.issues.push({
          code: "UNSUPPORTED_METRIC",
          path,
          message: `Metric “${number}” is not supported by cited facts.`,
          repairable: true,
        });
      }
    }

    for (const tech of KNOWN_TECH) {
      if (!containsTerm(bullet.text, tech)) continue;
      const allowed =
        input.inventoryKeys.has(tech) ||
        (input.itemTechnologies ?? []).some(
          (value) => normalize(value) === tech,
        ) ||
        containsTerm(cited, tech);
      if (!allowed) {
        input.issues.push({
          code: "UNSUPPORTED_TECHNOLOGY",
          path,
          message: `Technology “${tech}” is not supported by verified evidence.`,
          repairable: true,
        });
      }
    }

    for (const keyword of input.bannedKeywords) {
      if (!containsTerm(bullet.text, keyword)) continue;
      if (containsTerm(cited, keyword)) continue;
      input.issues.push({
        code: "UNSUPPORTED_KEYWORD_INSERTED",
        path,
        message: `Unsupported job keyword “${keyword}” was inserted as candidate evidence.`,
        repairable: true,
      });
    }
  }
}

function looksLikeCategoryDump(text: string): boolean {
  const labels = [
    "programming languages",
    "languages",
    "backend",
    "frontend & mobile",
    "databases & persistence",
    "cloud, devops & infrastructure",
    "tools & technologies",
    "frameworks",
    "design tools",
    "soft skills",
  ];
  const hits = labels.filter((label) => text.toLocaleLowerCase().includes(label));
  return hits.length >= 2 && text.split(/\s+/u).length < 40;
}

function pushUnsafe(
  text: string,
  path: string,
  issues: ResumeValidationIssue[],
): void {
  if (/```|<html|<\/|system prompt|ignore previous/iu.test(text)) {
    issues.push({
      code: "UNSAFE_CONTENT",
      path,
      message: "Generated text contains unsafe content.",
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
  const lower = text.toLocaleLowerCase();
  for (const phrase of FORBIDDEN_CV_PHRASES) {
    if (lower.includes(phrase)) {
      issues.push({
        code: "FORBIDDEN_PHRASE",
        path,
        message: `Text contains forbidden phrase “${phrase}”.`,
        repairable: true,
      });
    }
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/gu, " ");
}

function containsTerm(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`,
    "iu",
  ).test(haystack);
}
