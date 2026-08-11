import type { ContentPlan } from "./content-plan";

/**
 * Default section order for the professional single-column CV.
 * Mirrors content-plan.ts when no stored plan.sectionOrder is available.
 * Early-career / one-page: education before projects.
 * Experienced two-page: projects before education.
 */
export function defaultResumeSectionOrder(
  mode?: ContentPlan["mode"],
  earlyCareer?: boolean,
): string[] {
  if (mode === "one_page" || earlyCareer) {
    return [
      "summary",
      "skills",
      "experience",
      "education",
      "projects",
      "certifications",
      "achievements",
      "references",
    ];
  }
  return [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
    "achievements",
    "references",
  ];
}
