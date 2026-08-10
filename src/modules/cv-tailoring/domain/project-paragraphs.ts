/**
 * Helpers for balanced project paragraph prose (not bullet lists).
 */

export function sentencesToParagraph(sentences: string[]): string {
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => (/[.!?]"?$/u.test(sentence) ? sentence : `${sentence}.`))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function splitIntoBalancedParagraphs(
  sentences: string[],
  paragraphCount: number,
): string[] {
  const cleaned = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
  if (cleaned.length === 0) return [];

  // Prefer one fuller paragraph over several thin fragments.
  if (cleaned.length < 3 || paragraphCount <= 1) {
    return [sentencesToParagraph(cleaned)];
  }

  const count = Math.min(paragraphCount, Math.floor(cleaned.length / 2) || 1);
  if (count <= 1) return [sentencesToParagraph(cleaned)];

  const paragraphs: string[] = [];
  const size = Math.ceil(cleaned.length / count);
  for (let index = 0; index < count; index += 1) {
    const chunk = cleaned.slice(index * size, (index + 1) * size);
    if (chunk.length === 0) continue;
    paragraphs.push(sentencesToParagraph(chunk));
  }
  return paragraphs;
}

/** Prefer a similar fact count per project so depth stays balanced. */
export function selectBalancedProjectSentences(
  sentences: string[],
  targetCount: number,
): string[] {
  if (sentences.length <= targetCount) return [...sentences];
  return sentences.slice(0, targetCount);
}

/**
 * When a project has fewer narrative facts, weave verified technologies into
 * existing prose so selected projects stay closer in substance.
 */
export function withTechnologyContext(
  sentences: string[],
  technologies: string[],
  targetMinWords: number,
): string[] {
  if (sentences.length === 0) {
    if (technologies.length === 0) return [];
    return [
      `Implemented core functionality using ${technologies.slice(0, 8).join(", ")}`,
    ];
  }

  const next = [...sentences];
  const wordCount = sentencesToParagraph(next)
    .split(/\s+/u)
    .filter(Boolean).length;
  if (wordCount >= targetMinWords || technologies.length === 0) return next;

  const mentioned = sentencesToParagraph(next).toLocaleLowerCase();
  const missing = technologies.filter(
    (tech) => !mentioned.includes(tech.toLocaleLowerCase()),
  );
  if (missing.length === 0) return next;

  const lastIndex = next.length - 1;
  const last = next[lastIndex]!.replace(/[.!?]+$/u, "");
  next[lastIndex] =
    `${last}, using ${missing.slice(0, 8).join(", ")}`;
  return next;
}

export function projectParagraphWordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}
