export function formatTelegramMarkdown(text: string): string {
  if (!text) return "";

  let html = text;

  // 1. Escape HTML special characters to prevent Telegram from breaking on random < or >
  // Telegram requires <, >, and & to be escaped if not part of a valid tag, but since we are generating valid tags,
  // we first escape everything, then convert markdown to tags.
  html = html
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");

  // 2. Bold: **text** -> <b>text</b>
  html = html.replace(/\*\*([^*]+)\*\*/gu, "<b>$1</b>");

  // 3. Italic: *text* or _text_ -> <i>text</i>
  // Note: we must avoid replacing bold markers, so we use a lookbehind/lookahead or just simple regex for single markers.
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/gu, "<i>$1</i>");
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/gu, "<i>$1</i>");

  // 4. Code block: ```code``` -> <pre><code>code</code></pre>
  html = html.replace(/```([\s\S]+?)```/gu, "<pre><code>$1</code></pre>");

  // 5. Inline code: `code` -> <code>code</code>
  html = html.replace(/`([^`]+)`/gu, "<code>$1</code>");

  // 6. Links: [text](url) -> <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '<a href="$2">$1</a>');

  // 7. Bullet points: - item or * item -> • item
  // Matches start of line, optional spaces, hyphen or asterisk, space
  html = html.replace(/^(\s*)[-*]\s+/gmu, "$1• ");

  // 8. Headers: # Header -> <b>Header</b>
  // Telegram doesn't support header tags, so we make them bold.
  html = html.replace(/^(#{1,6})\s+(.*)$/gmu, "<b>$2</b>");

  return html;
}
