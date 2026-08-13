import type { CareerStageAssessment } from "@/modules/career-intelligence/domain/career-stage";
import type { JobRequirement } from "@/modules/career-intelligence/domain/schemas";

import type { EvidenceSnapshot } from "./facts";
import { buildKeywordAudit } from "./keywords";
import {
  MIN_EVIDENCE_VOLUME_FOR_TWO_PAGE,
  ONE_PAGE_BULLET_MAX_CHARS,
  ONE_PAGE_BULLETS_PER_EXPERIENCE,
  ONE_PAGE_BULLETS_PER_PROJECT,
  ONE_PAGE_CERT_MAX,
  ONE_PAGE_PARAGRAPHS_PER_PROJECT,
  ONE_PAGE_PROJECT_PARAGRAPH_WORDS,
  ONE_PAGE_PROJECT_SOURCE_FACTS,
  ONE_PAGE_SKILL_MAX,
  ONE_PAGE_SUMMARY_MAX_CHARS,
  TWO_PAGE_BULLET_MAX_CHARS,
  TWO_PAGE_BULLETS_PER_EXPERIENCE,
  TWO_PAGE_BULLETS_PER_PROJECT,
  TWO_PAGE_CERT_MAX,
  TWO_PAGE_PARAGRAPHS_PER_PROJECT,
  TWO_PAGE_PROJECT_PARAGRAPH_WORDS,
  TWO_PAGE_PROJECT_SOURCE_FACTS,
  TWO_PAGE_SKILL_MAX,
  TWO_PAGE_SUMMARY_MAX_CHARS,
} from "./policy";
import {
  selectProjectsForCv,
  type ProjectSelectionResult,
} from "./project-selection";
import type {
  GenerationAssessment,
  JobAlignment,
  KeywordAuditEntry,
  CvMode,
} from "./schemas";

export type ContentPlan = {
  mode: CvMode;
  recommendedMode: CvMode;
  recommendationReason: string;
  targetTitle: string;
  jobAlignment: JobAlignment;
  sectionOrder: string[];
  /** Always true — profile/summary is required for job-specific positioning. */
  allowSummary: boolean;
  requireSummary: boolean;
  summaryMaxChars: number;
  experienceItemIds: string[];
  projectItemIds: string[];
  educationItemIds: string[];
  skillItemIds: string[];
  certificationItemIds: string[];
  achievementItemIds: string[];
  /** Verified referees copied through to the CV — never invented. */
  referenceItemIds: string[];
  bulletsPerExperience: number;
  /** @deprecated Use paragraphsPerProject / projectSourceFacts. */
  bulletsPerProject: number;
  paragraphsPerProject: number;
  projectSourceFacts: number;
  projectParagraphWords: { min: number; max: number };
  bulletMaxChars: number;
  skillMax: number;
  earlyCareer: boolean;
  projectSelection: ProjectSelectionResult;
  keywordAudit: KeywordAuditEntry[];
  warnings: string[];
  assessment?: GenerationAssessment;
};

export function recommendCvMode(input: {
  snapshot: EvidenceSnapshot;
  requestedMode?: CvMode | null;
}): {
  recommendedMode: CvMode;
  reason: string;
  warnings: string[];
} {
  const projects = input.snapshot.items.filter((item) => item.type === "project");
  const work = input.snapshot.items.filter((item) => item.type === "work");
  const volume =
    projects.length * 2 +
    work.reduce(
      (sum, item) =>
        sum + (item.type === "work" ? Math.min(3, item.bullets.length) : 0),
      0,
    ) +
    input.snapshot.items.filter((item) => item.type === "certification").length;

  const warnings: string[] = [];
  if (volume < MIN_EVIDENCE_VOLUME_FOR_TWO_PAGE) {
    const recommendedMode: CvMode = "one_page";
    const reason =
      "Verified evidence volume is better suited to a concise one-page CV.";
    if (input.requestedMode === "two_page") {
      warnings.push(
        "Two-page mode was requested, but a one-page CV is likely stronger with the current verified evidence.",
      );
    }
    return { recommendedMode, reason, warnings };
  }

  return {
    recommendedMode: "two_page",
    reason:
      "There is enough verified experience and project evidence to support a useful two-page CV.",
    warnings,
  };
}

/**
 * Turn a vacancy posting title into a CV-safe role name.
 * Keeps the role (e.g. Software Engineer) but drops location tags,
 * seniority ranges, and other job-board fluff that should not appear
 * as the candidate's professional title.
 */
export function sanitizeJobTitleForCv(jobTitle: string): string {
  let title = jobTitle.trim();
  if (!title) return "Software Engineer";

  // Drop parenthetical tags: (Maryland), (Remote), (Hybrid - NYC), etc.
  title = title.replace(/\s*\([^)]*\)\s*/gu, " ");

  // Drop bracketed tags: [Contract], [On-site]
  title = title.replace(/\s*\[[^\]]*\]\s*/gu, " ");

  // Split on common posting separators and keep the role-like head.
  const parts = title
    .split(/\s*[-–—|/·•]\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const part of parts) {
    if (isPostingFluffSegment(part)) continue;
    // Stop once we already have a role and hit more fluff-looking remainder.
    if (kept.length > 0 && looksLikeLocationOrMeta(part)) continue;
    kept.push(part);
    // One solid role phrase is enough for a CV title line.
    if (kept.length >= 1 && /\b(engineer|developer|analyst|scientist|designer|manager|specialist|architect|consultant|administrator|technician|programmer)\b/iu.test(part)) {
      break;
    }
  }

  title = (kept.length > 0 ? kept.join(" ") : parts[0] ?? title)
    .replace(/\s{2,}/gu, " ")
    .trim();

  // Strip trailing meta still glued without separators.
  title = title
    .replace(
      /\b(?:mid(?:\s*[-/]?\s*to\s*[-/]?\s*|\s+)(?:senior|experienced)|entry[\s-]*level|experienced\s+level|seniority)\b.*$/iu,
      "",
    )
    .replace(/\s{2,}/gu, " ")
    .trim();

  // Cap length for CV header.
  if (title.length > 60) {
    title = title.slice(0, 60).replace(/\s+\S*$/u, "").trim();
  }

  return title || "Software Engineer";
}

function isPostingFluffSegment(part: string): boolean {
  const normalized = part.toLocaleLowerCase();
  if (
    /^(?:remote|hybrid|onsite|on[\s-]?site|contract|permanent|full[\s-]?time|part[\s-]?time|temporary|urgent|immediate)$/iu.test(
      normalized,
    )
  ) {
    return true;
  }
  if (
    /^(?:mid(?:ior)?|senior|junior|lead|principal|staff|entry)[\s-]*(?:to[\s-]*(?:mid|senior|experienced|expert))?[\s-]*(?:level)?$/iu.test(
      normalized,
    )
  ) {
    return true;
  }
  if (
    /\b(?:mid|junior|senior|entry)?\s*(?:to\s+)?(?:mid|senior|experienced|expert)?\s*level\b/iu.test(
      normalized,
    ) &&
    !/\b(engineer|developer|analyst|scientist|designer|manager)\b/iu.test(
      normalized,
    )
  ) {
    return true;
  }
  return looksLikeLocationOrMeta(part);
}

function looksLikeLocationOrMeta(part: string): boolean {
  const normalized = part.trim();
  if (!normalized) return true;
  // Pure location-ish: Maryland, New York, NY, USA, Colombo, Sri Lanka
  if (/^[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?$/u.test(normalized)) {
    if (
      !/\b(engineer|developer|analyst|scientist|designer|manager|specialist|architect|consultant|administrator|technician|programmer|software|backend|frontend|full[\s-]?stack|data|devops|product|qa|security|cloud|mobile|platform|systems?|it|ai|ml)\b/iu.test(
        normalized,
      )
    ) {
      // Short proper nouns without role words are usually places/companies.
      if (normalized.split(/\s+/u).length <= 3 && normalized.length <= 40) {
        return true;
      }
    }
  }
  if (/^[A-Z]{2,3}$/u.test(normalized)) return true; // NY, MD, UK
  if (/\b(?:area|region|office|hq|headquarters)\b/iu.test(normalized)) {
    return true;
  }
  return false;
}

export function deriveTargetTitle(input: {
  jobTitle: string;
  earlyCareer: boolean;
}): string {
  const title = sanitizeJobTitleForCv(input.jobTitle);
  if (/junior|intern|associate|graduate|trainee|aspiring/iu.test(title)) {
    return title;
  }
  // Don't stamp "Junior" onto clearly senior / lead postings after cleanup.
  if (/^(?:senior|lead|principal|staff|director|head)\b/iu.test(title)) {
    return title;
  }
  if (input.earlyCareer) {
    if (/engineer|developer|analyst|scientist/iu.test(title)) {
      return `Junior ${title}`;
    }
    return `Aspiring ${title}`;
  }
  return title;
}

export function assessJobAlignment(input: {
  keywordAudit: KeywordAuditEntry[];
  projectSelection: ProjectSelectionResult;
}): JobAlignment {
  const must = input.keywordAudit.filter(
    (entry) => entry.priority === "must_have",
  );
  const supportedMust = must.filter(
    (entry) =>
      entry.support_state === "supported" || entry.support_state === "partial",
  ).length;
  const ratio = must.length === 0 ? 0.5 : supportedMust / must.length;
  const relevantProjects = input.projectSelection.ranked.filter(
    (item) => item.directlyRelevant,
  ).length;

  if (ratio >= 0.7 && relevantProjects >= 1) return "high";
  if (ratio >= 0.4 || relevantProjects >= 1) return "medium";
  if (ratio >= 0.15 || supportedMust > 0) return "low";
  return "very_low";
}

export function buildContentPlan(input: {
  mode: CvMode;
  snapshot: EvidenceSnapshot;
  requirements: JobRequirement[];
  jobTitle: string;
  assessment?: CareerStageAssessment | null;
  matchEvidenceIds?: string[];
  requestedMode?: CvMode | null;
}): ContentPlan {
  const recommendation = recommendCvMode({
    snapshot: input.snapshot,
    requestedMode: input.requestedMode ?? input.mode,
  });
  const projectSelection = selectProjectsForCv({
    mode: input.mode,
    snapshot: input.snapshot,
    requirements: input.requirements,
    matchEvidenceIds: input.matchEvidenceIds,
  });
  const keywordAudit = buildKeywordAudit({
    requirements: input.requirements,
    snapshot: input.snapshot,
    title: input.jobTitle,
  });

  const workItems = input.snapshot.items.filter((item) => item.type === "work");
  const educationItems = selectEducationItems(
    input.snapshot.items.filter((item) => item.type === "education"),
    input.mode,
  );
  const skillItems = input.snapshot.items.filter((item) => item.type === "skill");
  const certificationItems = input.snapshot.items.filter(
    (item) => item.type === "certification",
  );
  const achievementItems =
    input.mode === "one_page"
      ? []
      : input.snapshot.items.filter((item) => item.type === "achievement");

  const earlyCareer =
    !input.assessment ||
    input.assessment.inferredStage === "student_or_beginner" ||
    input.assessment.inferredStage === "internship_ready" ||
    input.assessment.inferredStage === "experienced_intern_or_graduate_ready" ||
    input.assessment.inferredStage === "unknown";

  const jobAlignment = assessJobAlignment({ keywordAudit, projectSelection });
  const targetTitle = deriveTargetTitle({
    jobTitle: input.jobTitle,
    earlyCareer,
  });

  const sectionOrder = (
    earlyCareer
      ? [
          "contact",
          "summary",
          "skills",
          "experience",
          "education",
          "projects",
          "certifications",
          "achievements",
          "references",
        ]
      : input.mode === "one_page"
        ? [
            "contact",
            "summary",
            "skills",
            "experience",
            "education",
            "projects",
            "certifications",
            "achievements",
            "references",
          ]
        : [
            "contact",
            "summary",
            "skills",
            "experience",
            "projects",
            "education",
            "certifications",
            "achievements",
            "references",
          ]
  ).filter((section) => {
    if (section === "projects" && projectSelection.selectedIds.length === 0) {
      return false;
    }
    if (section === "certifications" && certificationItems.length === 0) {
      return false;
    }
    if (section === "achievements" && achievementItems.length === 0) {
      return false;
    }
    if (
      section === "references" &&
      !input.snapshot.items.some((item) => item.type === "reference")
    ) {
      return false;
    }
    if (section === "education" && educationItems.length === 0) return false;
    if (section === "experience" && workItems.length === 0) return false;
    return true;
  });

  const skillMax =
    input.mode === "one_page" ? ONE_PAGE_SKILL_MAX : TWO_PAGE_SKILL_MAX;
  const certMax =
    input.mode === "one_page" ? ONE_PAGE_CERT_MAX : TWO_PAGE_CERT_MAX;

  const warnings = [...recommendation.warnings, ...projectSelection.warnings];
  if (jobAlignment === "low" || jobAlignment === "very_low") {
    warnings.push(
      `Job alignment is ${jobAlignment.replaceAll("_", " ")} - the CV will still be generated from the strongest truthful evidence, without inventing missing requirements.`,
    );
  }

  return {
    mode: input.mode,
    recommendedMode: recommendation.recommendedMode,
    recommendationReason: recommendation.reason,
    targetTitle,
    jobAlignment,
    sectionOrder,
    allowSummary: true,
    requireSummary: true,
    summaryMaxChars:
      input.mode === "one_page"
        ? ONE_PAGE_SUMMARY_MAX_CHARS
        : TWO_PAGE_SUMMARY_MAX_CHARS,
    experienceItemIds: workItems.map((item) => item.id),
    projectItemIds: projectSelection.selectedIds,
    educationItemIds: educationItems.map((item) => item.id),
    skillItemIds: prioritizeSkills({
      skillItems: skillItems.map((item) => ({
        id: item.id,
        name: item.type === "skill" ? item.name : "",
      })),
      snapshot: input.snapshot,
      selectedProjectIds: projectSelection.selectedIds,
      keywordAudit,
      max: skillMax,
    }),
    certificationItemIds: prioritizeCertifications(
      certificationItems.map((item) => ({
        id: item.id,
        name: item.type === "certification" ? item.name : "",
        issuer: item.type === "certification" ? item.issuer : null,
      })),
      keywordAudit,
      certMax,
    ),
    achievementItemIds: achievementItems.map((item) => item.id),
    referenceItemIds: input.snapshot.items
      .filter((item) => item.type === "reference")
      .map((item) => item.id)
      .slice(0, 3),
    bulletsPerExperience:
      input.mode === "one_page"
        ? ONE_PAGE_BULLETS_PER_EXPERIENCE
        : TWO_PAGE_BULLETS_PER_EXPERIENCE,
    bulletsPerProject:
      input.mode === "one_page"
        ? ONE_PAGE_BULLETS_PER_PROJECT
        : TWO_PAGE_BULLETS_PER_PROJECT,
    paragraphsPerProject:
      input.mode === "one_page"
        ? ONE_PAGE_PARAGRAPHS_PER_PROJECT
        : TWO_PAGE_PARAGRAPHS_PER_PROJECT,
    projectSourceFacts:
      input.mode === "one_page"
        ? ONE_PAGE_PROJECT_SOURCE_FACTS
        : TWO_PAGE_PROJECT_SOURCE_FACTS,
    projectParagraphWords:
      input.mode === "one_page"
        ? ONE_PAGE_PROJECT_PARAGRAPH_WORDS
        : TWO_PAGE_PROJECT_PARAGRAPH_WORDS,
    bulletMaxChars:
      input.mode === "one_page"
        ? ONE_PAGE_BULLET_MAX_CHARS
        : TWO_PAGE_BULLET_MAX_CHARS,
    skillMax,
    earlyCareer,
    projectSelection,
    keywordAudit,
    warnings,
  };
}

export function hasBasicCvEvidence(snapshot: EvidenceSnapshot): boolean {
  const profile = snapshot.items.find((item) => item.type === "profile");
  const hasName =
    profile?.type === "profile" && Boolean(profile.full_name?.trim());
  return (
    hasName ||
    snapshot.items.some((item) =>
      ["work", "project", "education", "skill"].includes(item.type),
    )
  );
}

function prioritizeSkills(input: {
  skillItems: Array<{ id: string; name: string }>;
  snapshot: EvidenceSnapshot;
  selectedProjectIds: string[];
  keywordAudit: KeywordAuditEntry[];
  max: number;
}): string[] {
  const supported = new Set(
    input.keywordAudit
      .filter(
        (entry) =>
          entry.support_state === "supported" ||
          entry.support_state === "partial",
      )
      .map((entry) => entry.keyword.toLocaleLowerCase()),
  );

  const scored = input.skillItems.map((skill) => {
    const name = skill.name.toLocaleLowerCase();
    const jdHit = supported.has(name) ? 3 : 0;
    const onSelectedProject = input.snapshot.items.some(
      (item) =>
        item.type === "project" &&
        input.selectedProjectIds.includes(item.id) &&
        (item.technologies.some((tech) => tech.toLocaleLowerCase() === name) ||
          item.bullets.some((bullet) =>
            bullet.toLocaleLowerCase().includes(name),
          )),
    )
      ? 2
      : 0;
    const breadth = 1;
    return { id: skill.id, score: jdHit + onSelectedProject + breadth, name: skill.name };
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score || a.name.localeCompare(b.name),
    )
    .map((item) => item.id)
    .slice(0, input.max);
}

function prioritizeCertifications(
  certs: Array<{ id: string; name: string; issuer: string | null }>,
  audit: KeywordAuditEntry[],
  max: number,
): string[] {
  const supported = new Set(
    audit
      .filter(
        (entry) =>
          entry.support_state === "supported" ||
          entry.support_state === "partial",
      )
      .map((entry) => entry.keyword.toLocaleLowerCase()),
  );
  return [...certs]
    .sort((a, b) => {
      const aHit = [...supported].some((term) =>
        a.name.toLocaleLowerCase().includes(term),
      )
        ? 0
        : 1;
      const bHit = [...supported].some((term) =>
        b.name.toLocaleLowerCase().includes(term),
      )
        ? 0
        : 1;
      return aHit - bHit || a.name.localeCompare(b.name);
    })
    .map((item) => item.id)
    .slice(0, max);
}

/** One-page CVs keep only the most recent qualification. */
function selectEducationItems(
  items: EvidenceSnapshot["items"],
  mode: CvMode,
): Array<Extract<EvidenceSnapshot["items"][number], { type: "education" }>> {
  const education = items.filter(
    (item): item is Extract<EvidenceSnapshot["items"][number], { type: "education" }> =>
      item.type === "education",
  );
  const usable = education.filter((item) => {
    const institution = item.institution?.trim() ?? "";
    const qualification = item.qualification?.trim() ?? "";
    if (!qualification) return false;
    if (!institution || /^not\s*specified$/iu.test(institution)) return false;
    return true;
  });
  const sorted = [...usable].sort((a, b) => {
    const aKey = a.end_date ?? a.start_date ?? "";
    const bKey = b.end_date ?? b.start_date ?? "";
    return bKey.localeCompare(aKey);
  });
  if (mode === "one_page") return sorted.slice(0, 1);

  // Prefer tertiary qualifications when present so O/L / A/L rows do not
  // consume two-page space with thin detail.
  const tertiary = sorted.filter((item) =>
    /bsc|ba\b|msc|degree|diploma|university|institute|college/iu.test(
      `${item.qualification} ${item.institution}`,
    ),
  );
  return (tertiary.length > 0 ? tertiary : sorted).slice(0, 2);
}
