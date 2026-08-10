import type { ContentPlan } from "./content-plan";
import type { EvidenceSnapshot } from "./facts";
import {
  ONE_PAGE_TARGET_WORDS,
  TWO_PAGE_TARGET_WORDS,
} from "./policy";
import {
  selectBalancedProjectSentences,
  sentencesToParagraph,
  splitIntoBalancedParagraphs,
} from "./project-paragraphs";
import type { TailoredResume } from "./tailored-resume";
import { selectCompleteBullets } from "./content-integrity";

export type DensityAssessment = {
  thin: boolean;
  wordCount: number;
  targetMin: number;
  reasons: string[];
};

export function countMeaningfulWords(resume: TailoredResume): number {
  const parts = [
    resume.summary.text,
    ...resume.skills.flatMap((group) => group.items),
    ...resume.experience.flatMap((role) =>
      role.bullets.map((bullet) => bullet.text),
    ),
    ...resume.projects.flatMap((project) => [
      ...project.technologies,
      ...project.paragraphs.map((paragraph) => paragraph.text),
    ]),
    ...resume.education.flatMap((item) => [
      item.qualification,
      item.institution,
      ...item.details,
    ]),
    ...resume.certifications.map((item) =>
      [item.name, item.issuer].filter(Boolean).join(" "),
    ),
    ...resume.achievements.map((item) => item.text),
    ...resume.references.flatMap((item) =>
      [item.name, item.title, item.organization].filter(Boolean),
    ),
  ];
  return parts
    .join(" ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

export function assessContentDensity(input: {
  resume: TailoredResume;
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
}): DensityAssessment {
  const wordCount = countMeaningfulWords(input.resume);
  const target =
    input.plan.mode === "one_page" ? ONE_PAGE_TARGET_WORDS : TWO_PAGE_TARGET_WORDS;
  const reasons: string[] = [];

  const richEvidence =
    input.snapshot.facts.filter((fact) => fact.kind === "bullet").length >= 8 ||
    input.snapshot.items.some(
      (item) =>
        (item.type === "project" || item.type === "work") &&
        item.bullets.length >= 3,
    );

  if (input.plan.mode === "two_page" && richEvidence && wordCount < 550) {
    reasons.push(
      `Two-page mode with rich verified evidence produced only ${wordCount} words.`,
    );
  }
  if (input.plan.mode === "one_page" && richEvidence && wordCount < 250) {
    reasons.push(
      `One-page mode with rich verified evidence produced only ${wordCount} words.`,
    );
  }

  const projectWordCounts = input.resume.projects.map((project) =>
    project.paragraphs.reduce(
      (sum, paragraph) =>
        sum + paragraph.text.trim().split(/\s+/u).filter(Boolean).length,
      0,
    ),
  );
  if (projectWordCounts.length >= 2) {
    const max = Math.max(...projectWordCounts);
    const min = Math.min(...projectWordCounts);
    if (max >= 90 && min > 0 && min < max * 0.45) {
      reasons.push(
        "Project paragraph depth is unbalanced across selected projects.",
      );
    }
  }

  for (const id of input.plan.projectItemIds) {
    const source = input.snapshot.items.find((item) => item.id === id);
    const rendered = input.resume.projects.find((item) => item.id === id);
    if (!source || source.type !== "project" || !rendered) continue;
    const highValue =
      source.bullets.length + source.technologies.length >= 5;
    const renderedWords = rendered.paragraphs.reduce(
      (sum, paragraph) =>
        sum + paragraph.text.trim().split(/\s+/u).filter(Boolean).length,
      0,
    );
    if (
      highValue &&
      renderedWords < input.plan.projectParagraphWords.min &&
      input.plan.projectSourceFacts >= 3
    ) {
      reasons.push(
        `Project “${source.name}” has rich verified facts but a thin paragraph (${renderedWords} words).`,
      );
    }
  }

  for (const id of input.plan.experienceItemIds) {
    const source = input.snapshot.items.find((item) => item.id === id);
    const rendered = input.resume.experience.find((item) => item.id === id);
    if (!source || source.type !== "work" || !rendered) continue;
    if (source.bullets.length >= 4 && rendered.bullets.length <= 1) {
      reasons.push(
        `Experience at ${source.employer} has ${source.bullets.length} verified bullets but only ${rendered.bullets.length} surfaced.`,
      );
    }
  }

  return {
    thin: reasons.length > 0,
    wordCount,
    targetMin: target.min,
    reasons,
  };
}

/**
 * One enrichment pass using ONLY already-selected verified evidence.
 * Rebuilds thinner project paragraphs to the shared fact budget for balance.
 */
export function enrichResumeFromSelectedEvidence(input: {
  resume: TailoredResume;
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
}): TailoredResume {
  const next = structuredClone(input.resume);

  next.experience = next.experience.map((role) => {
    const source = input.snapshot.items.find((item) => item.id === role.id);
    if (!source || source.type !== "work") return role;
    if (role.bullets.length >= input.plan.bulletsPerExperience) return role;
    const used = new Set(
      role.bullets.map((bullet) => normalize(bullet.text)),
    );
    const unused = selectCompleteBullets(
      source.bullets.filter((bullet) => !used.has(normalize(bullet))),
      input.plan.bulletsPerExperience - role.bullets.length,
    );
    if (unused.length === 0) return role;
    return {
      ...role,
      bullets: [
        ...role.bullets,
        ...unused.map((text, index) => ({
          text,
          factIds: [
            `${role.id}:bullet:${source.bullets.findIndex((bullet) => normalize(bullet) === normalize(text))}`,
          ],
          priority: role.bullets.length + index,
          source: "verified_evidence" as const,
        })),
      ],
    };
  });

  next.projects = next.projects.map((project) => {
    const source = input.snapshot.items.find((item) => item.id === project.id);
    if (!source || source.type !== "project") return project;

    const currentWords = project.paragraphs.reduce(
      (sum, paragraph) =>
        sum + paragraph.text.trim().split(/\s+/u).filter(Boolean).length,
      0,
    );
    if (
      currentWords >= input.plan.projectParagraphWords.min &&
      project.paragraphs.length >= input.plan.paragraphsPerProject
    ) {
      return project;
    }

    const sentences = selectCompleteBullets(
      source.bullets,
      source.bullets.length,
    );
    if (sentences.length === 0 && source.technologies.length === 0) {
      return project;
    }
    const balanced = selectBalancedProjectSentences(
      sentences.length > 0
        ? sentences
        : [`Implemented with ${source.technologies.slice(0, 8).join(", ")}`],
      input.plan.projectSourceFacts,
    );
    const paragraphTexts = splitIntoBalancedParagraphs(
      balanced,
      input.plan.paragraphsPerProject,
    );
    const factIds = balanced.map((text, index) => {
      const bulletIndex = source.bullets.findIndex(
        (bullet) => normalize(bullet) === normalize(text),
      );
      return bulletIndex >= 0
        ? `${project.id}:bullet:${bulletIndex}`
        : `${project.id}:technology:${index}`;
    });

    return {
      ...project,
      technologies:
        project.technologies.length > 0
          ? project.technologies
          : source.technologies.slice(0, 10),
      paragraphs: paragraphTexts.map((text, index) => ({
        text: text.length >= 40 ? text : sentencesToParagraph(balanced),
        factIds,
        priority: index,
        source: "verified_evidence" as const,
      })),
    };
  });

  return next;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}
