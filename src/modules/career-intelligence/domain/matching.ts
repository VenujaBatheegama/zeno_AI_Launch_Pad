import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import { normalizeCapabilityLabel } from "./capability-taxonomy";
import { MULTI_TERM_COVERAGE_THRESHOLD } from "./policy";
import type { JobRequirement, RequirementMatch } from "./schemas";

type EvidenceTerm = {
  id: string;
  term: string;
  key: string;
  context: "skill_list" | "project" | "work" | "education" | "certification";
};

type EvidenceIndex = {
  terms: EvidenceTerm[];
  internshipMonths: number;
  employmentMonths: number;
  workEvidenceIds: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "by",
  "as",
  "at",
  "from",
  "into",
  "over",
  "under",
  "using",
  "use",
  "used",
  "via",
  "etc",
  "ideally",
  "similar",
  "related",
  "strong",
  "hands",
  "hand",
  "on",
  "experience",
  "experiences",
  "proficiency",
  "proficient",
  "understanding",
  "knowledge",
  "skills",
  "skill",
  "ability",
  "abilities",
  "building",
  "build",
  "solutions",
  "solution",
  "tools",
  "tool",
  "tooling",
  "frameworks",
  "framework",
  "technologies",
  "technology",
  "modern",
  "practices",
  "practice",
  "deep",
  "high",
  "good",
  "excellent",
  "working",
  "work",
  "team",
  "teams",
  "development",
  "developer",
  "engineering",
  "engineer",
  "software",
  "platform",
  "services",
  "service",
  "systems",
  "system",
  "applications",
  "application",
  "management",
  "configuration",
  "automation",
  "native",
  "architectures",
  "architecture",
  "required",
  "preferred",
  "must",
  "should",
  "including",
  "include",
  "such",
  "like",
  "other",
  "etc",
  "code",
  "reviews",
  "review",
  "team",
  "collaborated",
  "using",
]);

const SHORT_TECH_ALLOWLIST = new Set([
  "go",
  "c",
  "r",
  "c++",
  "c#",
  "js",
  "ts",
  "sql",
  "aws",
  "gcp",
  "azure",
  "ci/cd",
  "cicd",
]);

export function buildEvidenceIndex(
  evidence: CareerEvidence,
  internshipMonths: number,
  employmentMonths: number,
): EvidenceIndex {
  const terms: EvidenceTerm[] = [];

  for (const skill of evidence.skills) {
    const normalized = normalizeCapabilityLabel(skill.name, "technology");
    terms.push({
      id: skill.id,
      term: normalize(skill.name),
      key: normalized.key,
      context: "skill_list",
    });
  }

  for (const project of evidence.projects) {
    for (const tech of project.technologies) {
      const normalized = normalizeCapabilityLabel(tech, "technology");
      terms.push({
        id: project.id,
        term: normalize(tech),
        key: normalized.key,
        context: "project",
      });
    }
    for (const phrase of extractSignificantPhrases(
      [project.name, project.role, ...project.bullets].filter(Boolean).join(" "),
    )) {
      terms.push({
        id: project.id,
        term: phrase,
        key: normalizeCapabilityLabel(phrase).key,
        context: "project",
      });
    }
  }

  for (const work of evidence.work_experience) {
    for (const phrase of extractSignificantPhrases(
      [work.role, ...work.bullets].filter(Boolean).join(" "),
    )) {
      terms.push({
        id: work.id,
        term: phrase,
        key: normalizeCapabilityLabel(phrase).key,
        context: "work",
      });
    }
  }

  return {
    terms: dedupeTerms(terms),
    internshipMonths,
    employmentMonths,
    workEvidenceIds: evidence.work_experience.map((item) => item.id),
  };
}

/**
 * Deterministic first-pass matching. Remaining requirements stay unclassified
 * so AI-assisted semantic comparison can fill only those gaps.
 *
 * Only concrete significant terms / aliases may produce positive matches.
 * Generic words like "experience", "frameworks", or "tools" never match.
 */
export function matchRequirementsDeterministically(input: {
  requirements: JobRequirement[];
  evidence: CareerEvidence;
  internshipMonths: number;
  employmentMonths: number;
}): RequirementMatch[] {
  const index = buildEvidenceIndex(
    input.evidence,
    input.internshipMonths,
    input.employmentMonths,
  );
  const matches: RequirementMatch[] = [];

  for (const requirement of input.requirements) {
    const statement = normalize(requirement.statement);

    if (requirement.category === "work_authorization") {
      matches.push({
        requirement_id: requirement.id,
        status: "unknown",
        evidence_ids: [],
        reason:
          "Work authorization is only evaluated when both the vacancy and verified evidence/preferences explicitly state it.",
        confidence: "low",
        classifier: "deterministic",
      });
      continue;
    }

    if (requirement.category === "experience") {
      const years = extractYears(requirement.statement);
      if (years !== null) {
        const months = years * 12;
        const available = index.internshipMonths + index.employmentMonths;
        if (available >= months) {
          matches.push({
            requirement_id: requirement.id,
            status: "matched",
            evidence_ids: index.workEvidenceIds.slice(0, 3),
            reason: `Verified non-overlapping experience totals about ${available} months, meeting the stated ${years}-year threshold.`,
            confidence: "medium",
            classifier: "deterministic",
          });
        } else if (available > 0) {
          matches.push({
            requirement_id: requirement.id,
            status: "partial",
            evidence_ids: index.workEvidenceIds.slice(0, 3),
            reason: `Verified experience totals about ${available} months, below the stated ${years}-year threshold.`,
            confidence: "medium",
            classifier: "deterministic",
          });
        } else {
          matches.push({
            requirement_id: requirement.id,
            status: "gap",
            evidence_ids: [],
            reason:
              "No verified dated employment or internship experience supports this duration requirement.",
            confidence: "high",
            classifier: "deterministic",
          });
        }
        continue;
      }
    }

    if (/lead|leadership|manage a team|people management/iu.test(statement)) {
      const hasLeadershipEvidence = index.terms.some((term) =>
        /\b(lead|led|mentor(?:ed|ing)?|managed a team|people management)\b/iu.test(
          term.term,
        ),
      );
      if (!hasLeadershipEvidence) {
        matches.push({
          requirement_id: requirement.id,
          status: "gap",
          evidence_ids: [],
          reason:
            "No verified leadership evidence; participation alone is not treated as leadership.",
          confidence: "high",
          classifier: "deterministic",
        });
        continue;
      }
    }

    const requirementTerms = extractRequirementTerms(requirement.statement);
    const covered = findCoveredRequirementTerms(requirementTerms, index.terms);
    const techStackCategories =
      requirement.category === "technology" ||
      requirement.category === "skill" ||
      requirement.category === "domain";
    const conjunctiveStack =
      techStackCategories &&
      requirementTerms.length >= 2 &&
      !isDisjunctiveRequirement(requirement.statement);

    if (conjunctiveStack && covered.length > 0) {
      const coverage = covered.length / requirementTerms.length;
      if (coverage < MULTI_TERM_COVERAGE_THRESHOLD) {
        matches.push({
          requirement_id: requirement.id,
          status: "gap",
          evidence_ids: dedupeIds(covered.map((item) => item.hit.id)).slice(
            0,
            3,
          ),
          reason: `Only ${covered.length} of ${requirementTerms.length} concrete technologies in this requirement appear in verified evidence (${covered
            .map((item) => item.term)
            .join(", ")}); minority overlap is not enough to treat the stack as supported.`,
          confidence: "high",
          classifier: "deterministic",
        });
        continue;
      }
    }

    const hit = covered[0]?.hit ?? null;

    if (hit) {
      const wantsProduction = /production|professional|commercial/iu.test(
        requirement.statement,
      );
      const incompleteStack =
        conjunctiveStack && covered.length < requirementTerms.length;
      if (hit.context === "skill_list" || incompleteStack) {
        matches.push({
          requirement_id: requirement.id,
          status: "partial",
          evidence_ids: dedupeIds(covered.map((item) => item.hit.id)).slice(
            0,
            3,
          ),
          reason: incompleteStack
            ? `Verified evidence covers ${covered.length} of ${requirementTerms.length} technologies in this requirement (${covered
                .map((item) => item.term)
                .join(", ")}); remaining stack items are unsupported.`
            : `Verified skill-list entry “${hit.term}” mentions this topic, but practical depth is not established by that entry alone.`,
          confidence: hit.context === "skill_list" ? "low" : "medium",
          classifier: "deterministic",
        });
        continue;
      }
      if (hit.context === "project" && wantsProduction) {
        matches.push({
          requirement_id: requirement.id,
          status: "partial",
          evidence_ids: [hit.id],
          reason:
            "Verified project exposure supports this topic, but professional/production experience is not established.",
          confidence: "medium",
          classifier: "deterministic",
        });
        continue;
      }
      matches.push({
        requirement_id: requirement.id,
        status: hit.context === "project" ? "partial" : "matched",
        evidence_ids: [hit.id],
        reason:
          hit.context === "project"
            ? `Verified project evidence mentions “${hit.term}”; this is project exposure, not employment experience.`
            : `Verified ${hit.context} evidence specifically mentions “${hit.term}”.`,
        confidence: "medium",
        classifier: "deterministic",
      });
      continue;
    }

    if (
      requirement.category === "technology" ||
      requirement.category === "skill" ||
      requirement.category === "domain" ||
      requirement.category === "responsibility"
    ) {
      matches.push({
        requirement_id: requirement.id,
        status: "gap",
        evidence_ids: [],
        reason:
          "No verified evidence specifically supports this requirement; generic wording overlap is ignored.",
        confidence: "high",
        classifier: "deterministic",
      });
    }
  }

  return matches;
}

export function validateMatchReferences(input: {
  matches: RequirementMatch[];
  requirementIds: Set<string>;
  evidenceIds: Set<string>;
}): RequirementMatch[] {
  return input.matches.map((match) => {
    if (!input.requirementIds.has(match.requirement_id)) {
      return {
        ...match,
        status: "unknown" as const,
        evidence_ids: [],
        reason:
          "Classifier referenced an unknown requirement ID; treated as unknown.",
        confidence: "low" as const,
      };
    }
    const validEvidence = match.evidence_ids.filter((id) =>
      input.evidenceIds.has(id),
    );
    if (
      (match.status === "matched" || match.status === "partial") &&
      validEvidence.length === 0
    ) {
      return {
        ...match,
        status: "unknown" as const,
        evidence_ids: [],
        reason:
          "Classifier cited evidence IDs that are not present in verified career evidence.",
        confidence: "low" as const,
      };
    }
    return { ...match, evidence_ids: validEvidence };
  });
}

/**
 * Concrete comparable terms from a requirement statement. Used by matching and
 * capability-alignment coverage so thin single-term hits cannot ignore the rest
 * of a stack.
 */
export function extractComparableRequirementTerms(statement: string): string[] {
  return extractRequirementTerms(statement);
}

function findCoveredRequirementTerms(
  requirementTerms: string[],
  evidenceTerms: EvidenceTerm[],
): Array<{ term: string; hit: EvidenceTerm }> {
  const covered: Array<{ term: string; hit: EvidenceTerm }> = [];
  const seenKeys = new Set<string>();

  for (const requirementTerm of requirementTerms) {
    const requirementKey = normalizeCapabilityLabel(requirementTerm).key;
    if (seenKeys.has(requirementKey)) continue;
    const hit = findBestEvidenceHit([requirementTerm], evidenceTerms);
    if (!hit) continue;
    seenKeys.add(requirementKey);
    covered.push({ term: requirementTerm, hit });
  }

  // Prefer stronger evidence contexts first when later logic picks a representative.
  const contextRank: Record<EvidenceTerm["context"], number> = {
    work: 0,
    project: 1,
    certification: 2,
    education: 3,
    skill_list: 4,
  };
  return covered.sort(
    (a, b) => contextRank[a.hit.context] - contextRank[b.hit.context],
  );
}

function findBestEvidenceHit(
  requirementTerms: string[],
  evidenceTerms: EvidenceTerm[],
): EvidenceTerm | null {
  const rankedContexts: EvidenceTerm["context"][] = [
    "work",
    "project",
    "skill_list",
    "certification",
    "education",
  ];
  for (const context of rankedContexts) {
    for (const requirementTerm of requirementTerms) {
      const requirementKey = normalizeCapabilityLabel(requirementTerm).key;
      const hit = evidenceTerms.find((evidence) => {
        if (evidence.context !== context) return false;
        if (
          !isSignificantTerm(evidence.term) &&
          !SHORT_TECH_ALLOWLIST.has(evidence.term)
        ) {
          return false;
        }
        // Exact normalized key/term only. Never substring-match fragments
        // like "code" into "infrastructure-as-code".
        return (
          evidence.key === requirementKey || evidence.term === requirementTerm
        );
      });
      if (hit) return hit;
    }
  }
  return null;
}

function isDisjunctiveRequirement(statement: string): boolean {
  const normalized = normalize(statement);
  if (/\b(?:either|any of|one of)\b/u.test(normalized)) return true;
  if (/\bor\b/u.test(normalized)) return true;
  if (/(?:^|[\s,;])\/(?:[\s,]|$)/u.test(normalized)) return true;
  return false;
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function extractRequirementTerms(statement: string): string[] {
  const normalized = normalize(statement);
  const phrases = extractSignificantPhrases(normalized);

  // Prefer longer concrete phrases first (terraform before "code").
  const known = [
    "site reliability",
    "platform engineering",
    "infrastructure as code",
    "infrastructure-as-code",
    "ci/cd",
    "devops",
    "kubernetes",
    "terraform",
    "docker",
    "aws",
    "azure",
    "gcp",
    "python",
    "java",
    "django",
    "fastapi",
    "flask",
    "postgresql",
    "postgres",
    "nodejs",
    "node.js",
    "react",
    "typescript",
    "javascript",
  ];
  const foundKnown = known.filter((term) => containsWholeTerm(normalized, term));

  return dedupeStrings([...foundKnown, ...phrases]).sort(
    (a, b) => b.length - a.length,
  );
}

function extractSignificantPhrases(text: string): string[] {
  const normalized = normalize(text);
  const tokens = normalized
    .split(/[^a-z0-9.+#/-]+/u)
    .map((token) => token.trim())
    .filter(Boolean);

  const phrases: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const unigram = tokens[index]!;
    if (isSignificantTerm(unigram) || SHORT_TECH_ALLOWLIST.has(unigram)) {
      phrases.push(unigram);
    }
    const bigram = `${tokens[index]} ${tokens[index + 1] ?? ""}`.trim();
    if (tokens[index + 1] && isSignificantTerm(bigram.replace(/\s+/gu, " "))) {
      // Keep multi-word tech phrases only when both parts are non-stop or known.
      if (!STOP_WORDS.has(tokens[index]!) || SHORT_TECH_ALLOWLIST.has(unigram)) {
        phrases.push(normalize(bigram));
      }
    }
  }
  return dedupeStrings(phrases);
}

function isSignificantTerm(term: string): boolean {
  const normalized = normalize(term);
  if (!normalized) return false;
  if (STOP_WORDS.has(normalized)) return false;
  if (SHORT_TECH_ALLOWLIST.has(normalized)) return true;
  if (normalized.length < 3) return false;
  // Avoid matching broad soft words still slipping through.
  if (
    /^(experience|knowledge|understanding|proficiency|frameworks?|tools?|technologies|solutions?|practices?)$/u.test(
      normalized,
    )
  ) {
    return false;
  }
  return true;
}

function containsWholeTerm(haystack: string, needle: string): boolean {
  const escaped = normalize(needle).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (!escaped) return false;
  return new RegExp(
    `(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`,
    "iu",
  ).test(normalize(haystack));
}

function dedupeTerms(terms: EvidenceTerm[]): EvidenceTerm[] {
  const seen = new Set<string>();
  const result: EvidenceTerm[] = [];
  for (const term of terms) {
    const key = `${term.id}:${term.key}:${term.context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => normalize(value)).filter(Boolean))];
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function extractYears(statement: string): number | null {
  const match = statement.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/iu);
  if (!match) return null;
  return Number(match[1]);
}
