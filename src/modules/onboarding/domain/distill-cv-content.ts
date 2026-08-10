/**
 * Turn conversational answers into CV-worthy profile text.
 * Keep the idea/gist — not the raw chat dump, absences, or filler.
 */

const LOW_VALUE_PATTERNS: RegExp[] = [
  /\b(no|not|never|without|didn'?t|did\s+not|don'?t|do\s+not|haven'?t|wasn'?t|weren'?t)\b.{0,40}\b(ci\s*\/?\s*cd|cicd|devops|tests?|testing|pipeline|automation|docker|kubernetes|k8s)\b/i,
  /\b(we|i|they)\s+(didn'?t|did\s+not|don'?t|do\s+not|never)\b/i,
  /\b(no|without)\s+(any\s+)?(ci\s*\/?\s*cd|cicd|tests?|devops)\b/i,
  /\bprefer not to say\b/i,
  /\b(idk|i don'?t know|not sure)\b/i,
  /\b(skip|n\/a|none)\b/i,
];

const TECH_ALIASES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bc\s*#(?:\b|(?=[^a-z0-9])|$)/i, label: "C#" },
  { pattern: /\bcsharp\b/i, label: "C#" },
  { pattern: /\.?\s*net\s*core\b|\bdotnet\s*core\b/i, label: ".NET Core" },
  { pattern: /\basp\.?\s*net\b/i, label: "ASP.NET" },
  { pattern: /\b\.net\b(?!\s*core)/i, label: ".NET" },
  { pattern: /\bangular\b/i, label: "Angular" },
  { pattern: /\breact\b/i, label: "React" },
  { pattern: /\bvue\.?js\b|\bvue\b/i, label: "Vue" },
  { pattern: /\bnode\.?js\b|\bnodejs\b/i, label: "Node.js" },
  { pattern: /\btypescript\b|\bts\b/i, label: "TypeScript" },
  { pattern: /\bjavascript\b|\bjs\b/i, label: "JavaScript" },
  { pattern: /\bpython\b/i, label: "Python" },
  { pattern: /\bjava\b(?!\s*script)/i, label: "Java" },
  { pattern: /\bkotlin\b/i, label: "Kotlin" },
  { pattern: /\bms\s*sql\b|\bmssql\b|\bsql\s*server\b/i, label: "MSSQL" },
  { pattern: /\bpostgres(ql)?\b/i, label: "PostgreSQL" },
  { pattern: /\bmysql\b/i, label: "MySQL" },
  { pattern: /\bmongodb\b|\bmongo\b/i, label: "MongoDB" },
  { pattern: /\bdocker\b/i, label: "Docker" },
  { pattern: /\bkubernetes\b|\bk8s\b/i, label: "Kubernetes" },
  { pattern: /\baws\b/i, label: "AWS" },
  { pattern: /\bazure\b/i, label: "Azure" },
  { pattern: /\bgcp\b|\bgoogle\s+cloud\b/i, label: "GCP" },
  { pattern: /\bredis\b/i, label: "Redis" },
  { pattern: /\bgraphql\b/i, label: "GraphQL" },
  { pattern: /\brest\b|\brestful\b/i, label: "REST" },
  { pattern: /\bspring\s*boot\b/i, label: "Spring Boot" },
  { pattern: /\bflutter\b/i, label: "Flutter" },
  { pattern: /\bfirebase\b/i, label: "Firebase" },
  { pattern: /\bgit\b/i, label: "Git" },
];

export function isLowValueCvText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < 3) return true;
  return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function extractTechnologies(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const alias of TECH_ALIASES) {
    if (!alias.pattern.test(text)) continue;
    const key = alias.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(alias.label);
  }
  return found;
}

/**
 * Rewrite a chatty answer into short CV bullets.
 * Prefers the idea (what was done / stack used) over the raw wording.
 */
export function distillBullets(raw: string | string[]): string[] {
  const inputs = (Array.isArray(raw) ? raw : [raw])
    .map((entry) => entry.trim())
    .filter(Boolean);

  const distilled: string[] = [];
  for (const input of inputs) {
    for (const piece of splitIdeas(input)) {
      const bullet = distillOneBullet(piece);
      if (!bullet || isLowValueCvText(bullet)) continue;
      if (
        distilled.some(
          (existing) => existing.toLowerCase() === bullet.toLowerCase(),
        )
      ) {
        continue;
      }
      distilled.push(bullet);
    }
  }
  return distilled.slice(0, 6);
}

function splitIdeas(text: string): string[] {
  // Keep tech-list dumps as one idea so we can compress them.
  if (looksLikeTechStackDump(text)) return [text];
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function looksLikeTechStackDump(text: string): boolean {
  const techs = extractTechnologies(text);
  if (techs.length >= 2) return true;
  return /\b(backend|frontend|database|db|stack|tech)\b/i.test(text) && techs.length >= 1;
}

function distillOneBullet(text: string): string | null {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/^[-•*]\s*/, "")
    .trim();
  if (!cleaned) return null;

  // Tech dumps often include low-value asides ("no CI/CD") — summarize the stack first.
  if (looksLikeTechStackDump(cleaned)) {
    const techs = extractTechnologies(cleaned);
    if (techs.length === 0) return null;
    return `Used ${joinList(techs)}`;
  }

  if (isLowValueCvText(cleaned)) return null;

  // Strip trailing low-value clauses ("… we didn't have any cicd").
  let gist = cleaned
    .replace(
      /[.;,]?\s*(and\s+)?(we|i)\s+(didn'?t|did\s+not|don'?t|never)[^.!?]*/gi,
      "",
    )
    .replace(
      /[.;,]?\s*(with\s+)?no\s+(any\s+)?(ci\s*\/?\s*cd|cicd|devops|tests?)[^.!?]*/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .replace(/[.;,\s]+$/g, "")
    .trim();

  if (!gist || isLowValueCvText(gist)) return null;

  // Cap very long chat dumps into a tighter sentence.
  if (gist.length > 160) {
    gist = `${gist.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  }

  // Prefer sentence case without forcing awkward capitalization of tech names.
  return gist;
}

export function distillTechnologies(raw: string | string[]): string[] {
  const text = (Array.isArray(raw) ? raw.join(" ") : raw).trim();
  if (!text) return [];
  const fromAliases = extractTechnologies(text);
  if (fromAliases.length > 0) return fromAliases;

  return text
    .split(/,|\/|&| and /i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !isLowValueCvText(part))
    .slice(0, 12);
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
