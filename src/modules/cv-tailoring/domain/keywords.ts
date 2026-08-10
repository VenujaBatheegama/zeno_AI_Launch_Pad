import type { JobRequirement } from "@/modules/career-intelligence/domain/schemas";
import { normalizeCapabilityLabel } from "@/modules/career-intelligence/domain/capability-taxonomy";

import type { EvidenceSnapshot } from "./facts";
import type { KeywordAuditEntry, TailoredCvContent } from "./schemas";

const KNOWN_TECH = [
  "python",
  "java",
  "javascript",
  "typescript",
  "react",
  "node.js",
  "nodejs",
  "docker",
  "kubernetes",
  "terraform",
  "aws",
  "azure",
  "gcp",
  "postgresql",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "django",
  "fastapi",
  "flask",
  "ci/cd",
  "linux",
  "git",
];

/** Adjacent capabilities that support transferable positioning — not claims of the keyword itself. */
const ADJACENCY: Record<string, string[]> = {
  kubernetes: ["docker", "linux", "ci/cd", "git"],
  aws: ["docker", "linux", "git", "python"],
  azure: ["docker", "linux", "git"],
  gcp: ["docker", "linux", "git"],
  terraform: ["docker", "linux", "git", "python"],
  "ci/cd": ["git", "docker", "linux"],
  devops: ["docker", "linux", "git", "python"],
};

export function buildKeywordAudit(input: {
  requirements: JobRequirement[];
  snapshot: EvidenceSnapshot;
  title?: string;
}): KeywordAuditEntry[] {
  const entries: KeywordAuditEntry[] = [];
  const seen = new Set<string>();

  for (const requirement of input.requirements) {
    const terms = extractKeywordTerms(requirement.statement);
    const priority =
      requirement.importance === "required"
        ? requirement.category === "responsibility"
          ? "responsibility"
          : "must_have"
        : requirement.importance === "preferred"
          ? "preferred"
          : "role_language";

    for (const term of terms) {
      const keywordId = `${requirement.id}:${normalizeCapabilityLabel(term).key}`;
      if (seen.has(keywordId)) continue;
      seen.add(keywordId);
      entries.push(classifyKeyword(term, keywordId, priority, input.snapshot));
    }
  }

  if (input.title) {
    for (const term of extractKeywordTerms(input.title)) {
      const key = normalizeCapabilityLabel(term).key;
      const keywordId = `title:${key}`;
      if (seen.has(keywordId)) continue;
      seen.add(keywordId);
      entries.push(
        classifyKeyword(term, keywordId, "role_language", input.snapshot),
      );
    }
  }

  const priorityRank = {
    must_have: 0,
    responsibility: 1,
    preferred: 2,
    role_language: 3,
  } as const;

  return entries.sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.keyword.localeCompare(b.keyword),
  );
}

function classifyKeyword(
  term: string,
  keywordId: string,
  priority: KeywordAuditEntry["priority"],
  snapshot: EvidenceSnapshot,
): KeywordAuditEntry {
  const supporting = findSupportingFacts(term, snapshot);
  if (supporting.length > 0) {
    const partial =
      supporting.length === 1 &&
      supporting.every((id) => id.includes(":skill:"));
    return {
      keyword_id: keywordId,
      keyword: term,
      priority,
      support_state: partial ? "partial" : "supported",
      supporting_fact_ids: supporting,
      used: false,
      locations: [],
      omission_reason: null,
    };
  }

  const adjacent = findAdjacentFacts(term, snapshot);
  if (adjacent.length > 0) {
    return {
      keyword_id: keywordId,
      keyword: term,
      priority,
      support_state: "transferable",
      supporting_fact_ids: adjacent,
      used: false,
      locations: [],
      omission_reason: `${term} is not verified for this candidate; highlighting adjacent evidence instead of inventing ${term}.`,
    };
  }

  return {
    keyword_id: keywordId,
    keyword: term,
    priority,
    support_state: "unsupported",
    supporting_fact_ids: [],
    used: false,
    locations: [],
    omission_reason: `${term} appears in this vacancy, but Zeno found no verified evidence and did not add it to your CV.`,
  };
}

function findAdjacentFacts(
  term: string,
  snapshot: EvidenceSnapshot,
): string[] {
  const key = normalizeCapabilityLabel(term).key;
  const neighbors = ADJACENCY[key] ?? ADJACENCY[term.toLocaleLowerCase()] ?? [];
  const ids: string[] = [];
  for (const neighbor of neighbors) {
    ids.push(...findSupportingFacts(neighbor, snapshot));
  }
  return [...new Set(ids)];
}

export function applyKeywordUsage(
  audit: KeywordAuditEntry[],
  content: TailoredCvContent,
): KeywordAuditEntry[] {
  return audit.map((entry) => {
    // Transferable/unsupported keywords must never appear as candidate claims.
    if (
      entry.support_state === "unsupported" ||
      entry.support_state === "transferable"
    ) {
      return { ...entry, used: false, locations: [] };
    }
    const locations: string[] = [];
    for (const experience of content.experience) {
      for (const [index, bullet] of experience.bullets.entries()) {
        if (
          bullet.supported_keyword_ids.includes(entry.keyword_id) ||
          containsTerm(bullet.text, entry.keyword)
        ) {
          locations.push(`experience:${experience.career_item_id}:${index}`);
        }
      }
    }
    for (const project of content.projects) {
      for (const [index, bullet] of project.bullets.entries()) {
        if (
          bullet.supported_keyword_ids.includes(entry.keyword_id) ||
          containsTerm(bullet.text, entry.keyword)
        ) {
          locations.push(`project:${project.career_item_id}:${index}`);
        }
      }
    }
    if (
      content.summary &&
      containsTerm(content.summary.text, entry.keyword)
    ) {
      locations.push("summary");
    }

    const used = locations.length > 0;
    return {
      ...entry,
      used,
      locations,
      omission_reason: used
        ? null
        : entry.support_state === "supported"
          ? `Supported keyword “${entry.keyword}” was available but not naturally incorporated in this variant.`
          : entry.omission_reason,
    };
  });
}

export function extractKeywordTerms(statement: string): string[] {
  const normalized = statement.toLocaleLowerCase();
  const found = KNOWN_TECH.filter((term) => containsTerm(normalized, term));
  // Prefer known technologies. Only keep other tokens that look like concrete
  // capabilities (not generic role/seniority language).
  const tokens = normalized
    .split(/[^a-z0-9.+#/-]+/u)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !STOP.has(token) &&
        !GENERIC_ROLE_LANGUAGE.has(token),
    );
  return [...new Set([...found, ...tokens])].slice(0, 8);
}

export function isClaimableCapabilityKeyword(keyword: string): boolean {
  const normalized = keyword.trim().toLocaleLowerCase();
  if (!normalized || STOP.has(normalized) || GENERIC_ROLE_LANGUAGE.has(normalized)) {
    return false;
  }
  if (KNOWN_TECH.some((term) => term === normalized)) return true;
  // Concrete capability-looking tokens (languages, tools, frameworks).
  return /^[a-z][a-z0-9.+#/-]{1,30}$/u.test(normalized);
}

function findSupportingFacts(
  term: string,
  snapshot: EvidenceSnapshot,
): string[] {
  const key = normalizeCapabilityLabel(term).key;
  return snapshot.facts
    .filter((fact) => {
      const factKey = normalizeCapabilityLabel(fact.text).key;
      return (
        factKey === key ||
        fact.text.toLocaleLowerCase() === term.toLocaleLowerCase()
      );
    })
    .map((fact) => fact.id);
}

function containsTerm(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`,
    "iu",
  ).test(haystack);
}

const STOP = new Set([
  "and",
  "the",
  "with",
  "for",
  "experience",
  "knowledge",
  "proficiency",
  "skills",
  "ability",
  "strong",
  "using",
  "required",
  "preferred",
  "familiarity",
  "fundamentals",
]);

const GENERIC_ROLE_LANGUAGE = new Set([
  "engineer",
  "engineering",
  "developer",
  "software",
  "associate",
  "junior",
  "senior",
  "intern",
  "internship",
  "graduate",
  "trainee",
  "aspiring",
  "role",
  "roles",
  "title",
  "position",
  "candidate",
  "team",
  "work",
  "working",
  "building",
  "build",
  "develop",
  "development",
  "application",
  "applications",
  "service",
  "services",
  "platform",
  "systems",
  "system",
  "cloud",
  "devops",
  "sre",
]);
