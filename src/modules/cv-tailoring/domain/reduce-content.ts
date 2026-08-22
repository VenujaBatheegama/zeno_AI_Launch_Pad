import type { TailoredResume } from "./tailored-resume";
import { looksIncompleteProse } from "./content-integrity";
import { TWO_PAGE_PROJECT_TARGET } from "./policy";

/**
 * Deterministic one-page content reduction. Renderer never rewrites mid-sentence.
 * Prefer dropping whole sentences/sections over truncating prose.
 */
export function reduceResumeForOnePage(resume: TailoredResume): TailoredResume {
  let next: TailoredResume = structuredClone(resume);

  // 0a. Drop references entirely — one-page CVs never include references.
  if (next.references.length > 0) {
    return { ...next, references: [] };
  }

  // 0b. Drop obviously incomplete strings if any slipped through.
  next = dropIncompleteStrings(next);

  // 1. Keep only the most recent education entry; drop module/detail lines.
  if (next.education.length > 1 || next.education.some((item) => item.details.length > 0)) {
    return {
      ...next,
      education: next.education.slice(0, 1).map((item) => ({
        ...item,
        details: [],
      })),
    };
  }

  // 2. Remove optional low-priority achievements.
  if (next.achievements.length > 0) {
    return { ...next, achievements: [] };
  }

  // 3. Drop certifications before sacrificing project depth.
  if (next.certifications.length > 0) {
    return {
      ...next,
      certifications: next.certifications.slice(0, -1),
    };
  }

  // 4. Shorten professional summary by one complete sentence.
  const shortenedSummary = dropLastSentence(next.summary.text);
  if (
    shortenedSummary &&
    shortenedSummary.length >= 40 &&
    shortenedSummary !== next.summary.text
  ) {
    return {
      ...next,
      summary: {
        ...next.summary,
        text: shortenedSummary,
        source: "verified_evidence",
      },
    };
  }

  // 5. Shorten the longest project paragraph by one complete sentence.
  if (next.projects.length > 0) {
    const ranked = [...next.projects].sort(
      (a, b) => projectWordCount(b) - projectWordCount(a),
    );
    const target = ranked[0]!;
    const paragraph = target.paragraphs[0];
    if (paragraph) {
      const shortened = dropLastSentence(paragraph.text);
      if (
        shortened &&
        shortened.length >= 40 &&
        shortened !== paragraph.text
      ) {
        return {
          ...next,
          projects: next.projects.map((project) =>
            project.id === target.id
              ? {
                  ...project,
                  paragraphs: [
                    {
                      ...paragraph,
                      text: shortened,
                      source: "verified_evidence",
                    },
                    ...project.paragraphs.slice(1),
                  ],
                }
              : project,
          ),
        };
      }
    }
  }

  // 6. Remove lowest-priority project only when above the one-page target of 2.
  if (next.projects.length > 2) {
    const sorted = [...next.projects].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    return { ...next, projects: sorted.slice(0, -1) };
  }

  // 7. Drop an extra project paragraph from the weakest project (keep ≥1).
  if (next.projects.length > 0) {
    const projects = [...next.projects].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
    );
    const target = projects[0]!;
    if (target.paragraphs.length > 1) {
      return {
        ...next,
        projects: next.projects.map((project) =>
          project.id === target.id
            ? { ...project, paragraphs: project.paragraphs.slice(0, -1) }
            : project,
        ),
      };
    }
  }

  // 8. Remove weakest final bullet from lowest-priority experience (keep ≥1).
  if (next.experience.length > 0) {
    const roles = [...next.experience].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
    );
    const target = roles[0]!;
    if (target.bullets.length > 1) {
      return {
        ...next,
        experience: next.experience.map((role) =>
          role.id === target.id
            ? { ...role, bullets: role.bullets.slice(0, -1) }
            : role,
        ),
      };
    }
  }

  // 9. Trim skill breadth - trim items from skill groups.
  if (next.skills.length > 0) {
    const groupWithItems = next.skills.find((g) => g.items.length > 2);
    if (groupWithItems) {
      return {
        ...next,
        skills: next.skills.map((group) =>
          group.category === groupWithItems.category
            ? { ...group, items: group.items.slice(0, -1) }
            : group,
        ),
      };
    }
  }

  // 10. If still overflowing, drop lowest-priority experience role when above 2 roles.
  if (next.experience.length > 2) {
    const sorted = [...next.experience].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    return { ...next, experience: sorted.slice(0, -1) };
  }

  // 11. If still overflowing, drop lowest-priority project from 2 down to 1.
  if (next.projects.length > 1) {
    const sorted = [...next.projects].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    return { ...next, projects: sorted.slice(0, 1) };
  }

  // 12. Trim skill groups down to 1 item each if needed.
  if (next.skills.length > 0) {
    const groupWithItems = next.skills.find((g) => g.items.length > 1);
    if (groupWithItems) {
      return {
        ...next,
        skills: next.skills.map((group) =>
          group.category === groupWithItems.category
            ? { ...group, items: group.items.slice(0, -1) }
            : group,
        ),
      };
    }
  }

  // 13. Drop empty skill categories.
  const nonEmptySkills = next.skills.filter((g) => g.items.length > 0);
  if (nonEmptySkills.length < next.skills.length) {
    return { ...next, skills: nonEmptySkills };
  }

  // 14. If still overflowing, drop to 1 single experience role if projects exist.
  if (next.experience.length > 1 && next.projects.length > 0) {
    const sorted = [...next.experience].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    return { ...next, experience: sorted.slice(0, 1) };
  }

  return next;
}

/**
 * Deterministic two-page overflow reduction. Prefer dropping whole optional
 * blocks and collapsing project depth before removing core experience.
 */
export function reduceResumeForTwoPage(resume: TailoredResume): TailoredResume {
  let next: TailoredResume = structuredClone(resume);
  next = dropIncompleteStrings(next);

  // 1. Drop education rows with missing institution / "Not specified".
  const usableEducation = next.education.filter((item) => {
    const institution = item.institution?.trim() ?? "";
    const qualification = item.qualification?.trim() ?? "";
    if (!qualification) return false;
    if (!institution || /^not\s*specified$/iu.test(institution)) return false;
    return true;
  });
  if (usableEducation.length !== next.education.length) {
    return { ...next, education: usableEducation.slice(0, 2) };
  }

  // 2. Keep at most two education entries; prefer tertiary wording.
  if (next.education.length > 2) {
    const tertiary = next.education.filter((item) =>
      /bsc|ba\b|msc|degree|diploma|university|institute|college/iu.test(
        `${item.qualification} ${item.institution}`,
      ),
    );
    return {
      ...next,
      education: (tertiary.length > 0 ? tertiary : next.education).slice(0, 2),
    };
  }

  // 3. Strip education detail lines (modules) before cutting projects.
  if (next.education.some((item) => item.details.length > 0)) {
    return {
      ...next,
      education: next.education.map((item) => ({ ...item, details: [] })),
    };
  }

  // 4. Drop soft-skill clutter from the Other bucket first.
  const trimmedSkills = trimSoftSkillOtherGroup(next.skills);
  if (JSON.stringify(trimmedSkills) !== JSON.stringify(next.skills)) {
    return { ...next, skills: trimmedSkills };
  }

  // 5. Drop achievements (often duplicated in summary).
  if (next.achievements.length > 0) {
    return { ...next, achievements: [] };
  }

  // 6. Drop weakest certification.
  if (next.certifications.length > 3) {
    return {
      ...next,
      certifications: next.certifications.slice(0, -1),
    };
  }

  // 7. Collapse the longest multi-paragraph project to one paragraph.
  const multi = [...next.projects]
    .filter((project) => project.paragraphs.length > 1)
    .sort((a, b) => projectWordCount(b) - projectWordCount(a));
  if (multi[0]) {
    const targetId = multi[0].id;
    return {
      ...next,
      projects: next.projects.map((project) =>
        project.id === targetId
          ? { ...project, paragraphs: project.paragraphs.slice(0, 1) }
          : project,
      ),
    };
  }

  // 8. Drop projects beyond the two-page target (usually the 5th).
  // Lower priority index = stronger/selected earlier — keep those.
  if (next.projects.length > TWO_PAGE_PROJECT_TARGET) {
    const sorted = [...next.projects].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
    );
    return { ...next, projects: sorted.slice(0, TWO_PAGE_PROJECT_TARGET) };
  }

  // 9. Shorten the longest project paragraph by one sentence.
  if (next.projects.length > 0) {
    const ranked = [...next.projects].sort(
      (a, b) => projectWordCount(b) - projectWordCount(a),
    );
    const target = ranked[0]!;
    const paragraph = target.paragraphs[0];
    if (paragraph) {
      const shortened = dropLastSentence(paragraph.text);
      if (
        shortened &&
        shortened.length >= 40 &&
        shortened !== paragraph.text
      ) {
        return {
          ...next,
          projects: next.projects.map((project) =>
            project.id === target.id
              ? {
                  ...project,
                  paragraphs: [
                    {
                      ...paragraph,
                      text: shortened,
                      source: "verified_evidence",
                    },
                    ...project.paragraphs.slice(1),
                  ],
                }
              : project,
          ),
        };
      }
    }
  }

  // 10. Drop an extra experience bullet (keep ≥2 when possible, else ≥1).
  if (next.experience.length > 0) {
    const roles = [...next.experience].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
    );
    const target = roles[0]!;
    const minKeep = target.bullets.length > 2 ? 2 : 1;
    if (target.bullets.length > minKeep) {
      return {
        ...next,
        experience: next.experience.map((role) =>
          role.id === target.id
            ? { ...role, bullets: role.bullets.slice(0, -1) }
            : role,
        ),
      };
    }
  }

  // 11. Shorten summary by one sentence.
  const shortenedSummary = dropLastSentence(next.summary.text);
  if (
    shortenedSummary &&
    shortenedSummary.length >= 40 &&
    shortenedSummary !== next.summary.text
  ) {
    return {
      ...next,
      summary: {
        ...next.summary,
        text: shortenedSummary,
        source: "verified_evidence",
      },
    };
  }

  // 12. Trim trailing skill items from the last group.
  if (next.skills.length > 0) {
    const skills = next.skills.map((group, index) =>
      index === next.skills.length - 1 && group.items.length > 2
        ? { ...group, items: group.items.slice(0, -1) }
        : group,
    );
    const changed = skills.some(
      (group, index) => group.items.length !== next.skills[index]!.items.length,
    );
    if (changed) return { ...next, skills };
  }

  // 13. Drop a project only as a last resort while keeping ≥3 on two-page.
  if (next.projects.length > 3) {
    const sorted = [...next.projects].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
    );
    return { ...next, projects: sorted.slice(0, -1) };
  }

  return next;
}

const SOFT_SKILL_PATTERN =
  /^(adaptability|leadership(\s+capability)?|creative(\s+and\s+analytical)?\s+thinking|teamwork|communication|problem[\s-]?solving|time\s+management|critical\s+thinking)$/iu;

function trimSoftSkillOtherGroup(
  skills: TailoredResume["skills"],
): TailoredResume["skills"] {
  return skills
    .map((group) => {
      if (group.category.toLocaleLowerCase() !== "other") return group;
      return {
        ...group,
        items: group.items.filter((item) => !SOFT_SKILL_PATTERN.test(item.trim())),
      };
    })
    .filter((group) => group.items.length > 0);
}

function dropIncompleteStrings(resume: TailoredResume): TailoredResume {
  return {
    ...resume,
    summary: looksIncompleteProse(resume.summary.text)
      ? {
          ...resume.summary,
          text: "Software professional targeting engineering roles with project and internship experience.",
          source: "verified_evidence",
        }
      : resume.summary,
    experience: resume.experience
      .map((role) => ({
        ...role,
        bullets: role.bullets.filter(
          (bullet) => !looksIncompleteProse(bullet.text),
        ),
      }))
      .filter((role) => role.bullets.length > 0),
    projects: resume.projects
      .map((project) => ({
        ...project,
        paragraphs: project.paragraphs.filter(
          (paragraph) => !looksIncompleteProse(paragraph.text),
        ),
      }))
      .filter((project) => project.paragraphs.length > 0),
    achievements: resume.achievements.filter(
      (item) => !looksIncompleteProse(item.text),
    ),
  };
}

function dropLastSentence(text: string): string | null {
  const trimmed = text.trim();
  const sentences =
    trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/gu)?.map((part) => part.trim()) ??
    [];
  if (sentences.length <= 1) return null;
  const next = sentences.slice(0, -1).join(" ").trim();
  return next.length >= 20 ? next : null;
}

function projectWordCount(project: TailoredResume["projects"][number]): number {
  return project.paragraphs.reduce(
    (sum, paragraph) =>
      sum + paragraph.text.trim().split(/\s+/u).filter(Boolean).length,
    0,
  );
}
