/** Max characters sent to the extractor after normalization. */
export const MAX_EXTRACTION_DESCRIPTION_CHARS = 6_000;

/**
 * Deterministic description cleanup for hashing and Groq prompts.
 * Conservative: keeps requirements/responsibilities; strips HTML noise and
 * duplicated paragraphs; never invents content.
 */
export function normalizeJobDescription(raw: string | null | undefined): string {
  if (!raw) return "";

  let text = raw;
  text = text.replace(/<script[\s\S]*?<\/script>/giu, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/giu, " ");
  text = text.replace(/<br\s*\/?>/giu, "\n");
  text = text.replace(/<\/(p|div|li|h[1-6]|tr)>/giu, "\n");
  text = text.replace(/<[^>]+>/gu, " ");
  text = text
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'");
  text = text.replace(/\r\n?/gu, "\n");
  text = text.replace(/[ \t]+\n/gu, "\n");
  text = text.replace(/\n{3,}/gu, "\n\n");
  text = text.replace(/[ \t]{2,}/gu, " ");
  text = text.trim();

  const paragraphs = text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const paragraph of paragraphs) {
    const key = paragraph.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(paragraph);
  }
  text = deduped.join("\n\n");

  if (text.length <= MAX_EXTRACTION_DESCRIPTION_CHARS) return text;

  // Prefer keeping the front of the posting (usually summary + requirements).
  return `${text.slice(0, MAX_EXTRACTION_DESCRIPTION_CHARS).trimEnd()}\n…[truncated]`;
}
