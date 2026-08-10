import { assembleTailoredResume } from "./assemble-resume";
import type { ContentPlan } from "./content-plan";
import {
  buildCompleteSummary,
  buildProfessionalSummaryParts,
  selectCompleteBullets,
} from "./content-integrity";
import type { EvidenceSnapshot } from "./facts";
import {
  selectBalancedProjectSentences,
  splitIntoBalancedParagraphs,
  withTechnologyContext,
} from "./project-paragraphs";
import {
  buildSkillInventory,
  groupSkillsDeterministically,
} from "./skill-inventory";
import type { KeywordAuditEntry } from "./schemas";
import type { GroqResumeDraft, ResumeAssessment, TailoredResume } from "./tailored-resume";

export function buildDeterministicResume(input: {
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
  keywordAudit: KeywordAuditEntry[];
  assessment?: ResumeAssessment;
}): TailoredResume {
  const inventory = buildSkillInventory(input.snapshot);
  const skills = groupSkillsDeterministically(
    inventory.displayNames.slice(0, input.plan.skillMax),
    inventory,
  );

  const experience = input.plan.experienceItemIds.flatMap((id, index) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "work" || item.bullets.length === 0) return [];
    const bullets = selectCompleteBullets(
      item.bullets,
      input.plan.bulletsPerExperience,
    ).map((text, bulletIndex) => ({
      text,
      factIds: [
        `${id}:bullet:${item.bullets.findIndex((bullet) => bullet.trim() === text)}`,
      ],
      priority: bulletIndex,
    }));
    if (bullets.length === 0) return [];
    return [
      {
        id,
        bullets,
        priority: index,
      },
    ];
  });

  // Balanced project paragraphs with verified technical depth.
  const projects = input.plan.projectItemIds.flatMap((id, index) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "project") return [];

    const sourceSentences =
      item.bullets.length > 0
        ? selectCompleteBullets(item.bullets, item.bullets.length)
        : item.technologies.length > 0
          ? [`Implemented with ${item.technologies.slice(0, 8).join(", ")}`]
          : [];
    if (sourceSentences.length === 0) return [];

    const balanced = withTechnologyContext(
      selectBalancedProjectSentences(
        sourceSentences,
        input.plan.projectSourceFacts,
      ),
      item.technologies,
      input.plan.projectParagraphWords.min,
    );
    const paragraphTexts = splitIntoBalancedParagraphs(
      balanced,
      input.plan.paragraphsPerProject,
    );
    const factIds = balanced.map((text) => {
      const bulletIndex = item.bullets.findIndex(
        (bullet) => bullet.trim() === text.trim(),
      );
      if (bulletIndex >= 0) return `${id}:bullet:${bulletIndex}`;
      return `${id}:technology:${item.technologies[0] ?? "stack"}`
        .trim()
        .toLocaleLowerCase()
        .replaceAll(/\s+/gu, "_");
    });

    const paragraphs = paragraphTexts.map((text, paragraphIndex) => ({
      text,
      factIds: factIds.length > 0 ? factIds : [`${id}:identity:name`],
      priority: paragraphIndex,
    }));

    return [
      {
        id,
        technologies: item.technologies,
        paragraphs,
        priority: index,
      },
    ];
  });

  const work = input.snapshot.items.find((item) => item.type === "work");
  const education = input.snapshot.items.find((item) => item.type === "education");
  const skillNames = skills.flatMap((group) => group.items).slice(0, 6);
  const selectedProjects = input.plan.projectItemIds.flatMap((id) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "project") return [];
    return [
      {
        name: item.name,
        technologies: item.technologies,
        bullets: item.bullets,
      },
    ];
  });
  const selectedAchievements = input.plan.achievementItemIds.flatMap((id) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "achievement") return [];
    return [{ name: item.name, result: item.result }];
  });
  const transferableKeywords = input.keywordAudit
    .filter(
      (entry) =>
        entry.support_state === "transferable" ||
        entry.support_state === "supported" ||
        entry.support_state === "partial",
    )
    .map((entry) => entry.keyword)
    .slice(0, 4);

  const summaryText = buildCompleteSummary(
    buildProfessionalSummaryParts({
      targetTitle: input.plan.targetTitle,
      mode: input.plan.mode,
      work:
        work && work.type === "work"
          ? {
              role: work.role,
              employer: work.employer,
              bullets: work.bullets,
            }
          : null,
      education:
        education && education.type === "education"
          ? {
              qualification: education.qualification,
              field_of_study: education.field_of_study,
              institution: education.institution,
              details: education.details,
            }
          : null,
      skills: skillNames,
      projects: selectedProjects,
      achievements: selectedAchievements,
      transferableKeywords,
    }),
    input.plan.summaryMaxChars,
  );

  const factIds = input.snapshot.facts.slice(0, 4).map((fact) => fact.id);

  const achievements = input.plan.achievementItemIds.flatMap((id) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "achievement") return [];
    const text = [item.name, item.result].filter(Boolean).join(" - ");
    if (text.length < 8) return [];
    return [{ text, factIds: item.factIds, priority: 0 }];
  });

  const draft: GroqResumeDraft = {
    targetTitle: input.plan.targetTitle,
    summary: {
      text:
        summaryText.length >= 20
          ? summaryText
          : `${summaryText} Seeking software engineering roles.`,
      factIds,
    },
    skills:
      skills.length > 0
        ? skills
        : groupSkillsDeterministically(
            inventory.displayNames.slice(0, 12),
            inventory,
          ),
    experience,
    projects: projects.map((project) => ({
      id: project.id,
      technologies: project.technologies,
      paragraphs: project.paragraphs,
      priority: project.priority,
    })),
    achievements,
    changeNotes: [
      "Used verified source wording with target positioning because tailored phrasing could not be validated safely.",
    ],
  };

  const assessment: ResumeAssessment = input.assessment ?? {
    factuallyValid: true,
    jobAlignment: input.plan.jobAlignment,
    supportedKeywords: input.keywordAudit
      .filter(
        (entry) =>
          entry.support_state === "supported" ||
          entry.support_state === "partial",
      )
      .map((entry) => entry.keyword),
    transferableKeywords: input.keywordAudit
      .filter((entry) => entry.support_state === "transferable")
      .map((entry) => entry.keyword),
    missingKeywords: input.keywordAudit
      .filter((entry) => entry.support_state === "unsupported")
      .map((entry) => entry.keyword),
    generationStatus: "success_with_fallback",
  };

  return assembleTailoredResume({
    draft,
    snapshot: input.snapshot,
    plan: input.plan,
    assessment,
  });
}

/** Normalize a Groq draft before assembly — strip banned category skill values. */
export function normalizeGroqDraft(
  draft: GroqResumeDraft,
  snapshot: EvidenceSnapshot,
): GroqResumeDraft {
  const inventory = buildSkillInventory(snapshot);
  const skills = draft.skills
    .map((group) => ({
      category: group.category,
      items: group.items.filter((item) =>
        inventory.displayNames.some(
          (name) => name.toLocaleLowerCase() === item.trim().toLocaleLowerCase(),
        ),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return {
    ...draft,
    skills:
      skills.length > 0
        ? skills
        : groupSkillsDeterministically(
            inventory.displayNames.slice(0, 12),
            inventory,
          ),
  };
}
