/**
 * Content integrity helpers — never ship mid-word / mid-sentence truncation.
 */

/** Trailing words that almost always indicate an unfinished phrase. */
const INCOMPLETE_TRAILING =
  /\b(the|a|an|to|for|of|and|or|with|in|on|at|by|from|into|as|is|are|was|were|be|been|being|that|this|these|those|contributing|administrative|implementing|developing|building|using|supporting|enabling)\s*$/iu;

export function looksIncompleteProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Explicit truncation ellipsis without completion.
  if (/\.\.\.$|…$/u.test(trimmed) && trimmed.length < 80) return true;

  if (INCOMPLETE_TRAILING.test(trimmed)) return true;

  // Ends on a 1–2 letter fragment that is not a known short word.
  const last = trimmed.split(/\s+/u).at(-1)?.replace(/[)\].,;:!?]+$/u, "") ?? "";
  const allowedShort = new Set([
    "ai",
    "ml",
    "ui",
    "ux",
    "qa",
    "ci",
    "cd",
    "db",
    "js",
    "ts",
    "go",
    "c",
    "r",
  ]);
  if (
    last.length > 0 &&
    last.length <= 2 &&
    !allowedShort.has(last.toLocaleLowerCase()) &&
    /^[a-z]+$/iu.test(last)
  ) {
    return true;
  }

  // Trailing cut punctuation without a following clause.
  if (/[,:;]\s*$/u.test(trimmed)) return true;

  return false;
}

/**
 * Prefer whole verified bullets. Never character-slice prose to fit a budget.
 */
export function selectCompleteBullets(
  bullets: string[],
  maxBullets: number,
): string[] {
  const selected: string[] = [];
  for (const bullet of bullets) {
    const text = bullet.trim();
    if (text.length < 8) continue;
    if (looksIncompleteProse(text)) continue;
    selected.push(text);
    if (selected.length >= maxBullets) break;
  }
  return selected;
}

export function buildCompleteSummary(
  parts: Array<string | null | undefined>,
  softMaxChars: number,
): string {
  const sentences = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .map((part) => (/[.!?]$/u.test(part) ? part : `${part}.`));

  let summary = "";
  for (const sentence of sentences) {
    const next = summary ? `${summary} ${sentence}` : sentence;
    if (next.length > softMaxChars && summary) break;
    summary = next;
  }
  return summary.trim() || "Software professional seeking engineering roles.";
}

/**
 * Build a richer third-person professional summary from verified evidence only.
 * Prefer concrete experience, stack, and projects over generic filler.
 */
export function buildProfessionalSummaryParts(input: {
  targetTitle: string;
  mode: "one_page" | "two_page";
  work?: {
    role: string;
    employer: string;
    bullets: string[];
  } | null;
  education?: {
    qualification: string | null;
    field_of_study: string | null;
    institution: string;
    details: string[];
  } | null;
  skills: string[];
  projects: Array<{ name: string; technologies: string[]; bullets: string[] }>;
  achievements: Array<{ name: string; result: string | null }>;
  transferableKeywords?: string[];
}): Array<string | null> {
  const skillNames = input.skills.filter(Boolean).slice(0, 6);
  const skillLower = new Set(skillNames.map((name) => name.toLocaleLowerCase()));
  const projectNames = input.projects.map((project) => project.name).slice(0, 3);
  const projectTechs = [
    ...new Set(input.projects.flatMap((project) => project.technologies)),
  ]
    .filter((tech) => !skillLower.has(tech.toLocaleLowerCase()))
    .slice(0, 6);
  const achievementLine = input.achievements
    .map((item) => [item.name, item.result].filter(Boolean).join(" - "))
    .find((text) => text.length >= 8);

  const educationLabel = input.education
    ? (() => {
        const qual = input.education.qualification?.trim() || "";
        const field = input.education.field_of_study?.trim() || "";
        if (qual && field) {
          if (qual.toLocaleLowerCase().includes(field.toLocaleLowerCase())) {
            return qual;
          }
          return `${qual} in ${field}`;
        }
        return qual || field || input.education.institution;
      })()
    : null;

  const who = input.work
    ? `${input.work.role} at ${input.work.employer}`
    : educationLabel
      ? `${educationLabel} graduate`
      : "Software professional";

  const positioning = educationLabel && input.work
    ? `${who}, with a ${educationLabel} background, targeting ${input.targetTitle} roles`
    : `${who} targeting ${input.targetTitle} roles`;

  if (input.mode === "one_page") {
    const stackBit =
      skillNames.length > 0
        ? `Technical strengths include ${skillNames.slice(0, 3).join(", ")}`
        : projectTechs.length > 0
          ? `Hands-on delivery across ${projectTechs.slice(0, 3).join(", ")}`
          : null;
    const projectBit =
      projectNames.length === 0
        ? null
        : `Key projects include ${formatList(projectNames.slice(0, 2))}`;
    return [positioning, stackBit, projectBit];
  }

  const stackBit =
    skillNames.length > 0
      ? `Technical strengths include ${skillNames
          .slice(0, 5)
          .join(", ")}${
          projectTechs.length > 0
            ? `, with additional hands-on work in ${projectTechs
                .slice(0, 4)
                .join(", ")}`
            : ""
        }`
      : projectTechs.length > 0
        ? `Hands-on delivery across ${projectTechs.slice(0, 5).join(", ")}`
        : null;

  const projectBit =
    projectNames.length === 0
      ? null
      : projectNames.length === 1
        ? `Recent build focus centres on ${projectNames[0]}, turning requirements into working application features`
        : `Recent build focus includes ${formatList(projectNames)}, turning requirements into working application features`;

  const proofBit = achievementLine
    ? `Recognised for ${achievementLine}`
    : input.education?.details[0]
      ? `Academic grounding includes ${trimTrailingPunctuation(input.education.details[0])}`
      : input.work && input.work.bullets.length > 0
        ? `Internship delivery emphasises reliable feature work, debugging, and collaboration in a live engineering environment`
        : null;

  const closeBit =
    input.transferableKeywords && input.transferableKeywords.length > 0
      ? `Brings transferable strengths in ${formatList(
          input.transferableKeywords.slice(0, 3),
        )} alongside solid implementation depth ready for contribution from day one`
      : "Combines internship experience with multi-project implementation depth, ready to contribute from day one";

  return [positioning, stackBit, projectBit, proofBit, closeBit];
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function trimTrailingPunctuation(text: string): string {
  return text.trim().replace(/[.!?]+$/u, "");
}

export function stripIncompleteResumeText(resumeTexts: string[]): string[] {
  return resumeTexts.filter((text) => !looksIncompleteProse(text));
}
