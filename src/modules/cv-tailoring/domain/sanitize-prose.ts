/**
 * Normalize CV prose so it reads like a human-written resume.
 * Avoid em/en dashes, curly quotes, and ellipsis glyphs that look AI-generated.
 */
export function sanitizeCvProse(text: string): string {
  return text
    .replace(/\u2014/gu, " - ") // em dash
    .replace(/\u2013/gu, "-") // en dash
    .replace(/\u2026/gu, "...") // ellipsis
    .replace(/[\u2018\u2019]/gu, "'") // curly single quotes
    .replace(/[\u201C\u201D]/gu, '"') // curly double quotes
    .replace(/\u00A0/gu, " ") // non-breaking space
    .replace(/\s+-\s+/gu, " - ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

export function sanitizeCvResumeTextFields<T extends { text: string }>(
  items: T[],
): T[] {
  return items.map((item) => ({
    ...item,
    text: sanitizeCvProse(item.text),
  }));
}
