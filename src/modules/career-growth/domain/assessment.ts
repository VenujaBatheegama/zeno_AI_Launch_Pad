import {
  DIMENSION_LABELS,
  GAP_PRIORITY,
  type AssessmentDimensionKey,
} from "./policy";
import type {
  CampaignIntent,
  GrowthAssessmentDimension,
  MarketSignals,
  VerifiedEvidenceSummary,
} from "./schemas";

const TEST_PATTERN =
  /\b(test|tests|testing|jest|vitest|junit|cypress|playwright|coverage|tdd|unit test|integration test)\b/i;
const DEPLOY_PATTERN =
  /\b(deploy|deployment|docker|kubernetes|k8s|ci\/cd|github actions|production|hosted|aws|gcp|azure|vercel|railway)\b/i;
const PRODUCTION_PATTERN =
  /\b(production|users|customers|uptime|monitoring|observability|incident|slo|real[- ]user)\b/i;
const COMPLEXITY_PATTERN =
  /\b(auth|authentication|queue|background|worker|event|integration|api gateway|postgres|redis|kafka|graphql|websocket)\b/i;
const DEPTH_PATTERN =
  /\b(architect|performance|scale|concurrency|throughput|latency|distributed|transaction)\b/i;
const COLLAB_PATTERN =
  /\b(team|collaborat|pull request|code review|stakeholder|pair|mentored|cross-functional)\b/i;
const DOCS_PATTERN =
  /\b(readme|document|documentation|runbook|adr|wiki|wrote docs)\b/i;
const CRUD_PATTERN = /\b(crud|todo app|coursework|assignment|lab exercise)\b/i;

export function assessEvidenceDimensions(input: {
  intent: CampaignIntent;
  evidence: VerifiedEvidenceSummary;
  market?: MarketSignals | null;
}): GrowthAssessmentDimension[] {
  const { intent, evidence, market } = input;
  if (!evidence.verified) {
    return GAP_PRIORITY.map((key) =>
      dimension(key, "unknown", "Zeno does not yet have verified career evidence to assess this dimension.", [], []),
    );
  }

  const allText = collectText(evidence);
  const stack = intent.preferredTechnologies.map((item) => item.trim()).filter(Boolean);
  const role = intent.primaryRole.trim();

  const roleHits = matchingIds(
    [...evidence.workExperience, ...evidence.projects],
    (item) => includesNormalized(item.role ?? "", role) || includesNormalized(item.name, role),
  );
  const techHits = matchingIds(evidence.projects, (item) =>
    (item.technologies ?? []).some((tech) =>
      stack.length
        ? stack.some((wanted) => includesNormalized(tech, wanted))
        : Boolean(tech),
    ),
  );
  const skillHits = matchingIds(evidence.skills, (item) =>
    stack.length
      ? stack.some((wanted) => includesNormalized(item.name, wanted))
      : Boolean(item.name),
  );

  const hasProjects = evidence.projects.length > 0;
  const hasWork = evidence.workExperience.length > 0;
  const hasAnyArtifact = hasProjects || hasWork;

  return [
    dimension(
      "role_alignment",
      roleHits.length > 0 ? "strong" : hasAnyArtifact ? "partial" : "unknown",
      roleHits.length > 0
        ? `Verified roles and projects include work aligned with ${role}.`
        : hasAnyArtifact
          ? `Verified work exists, but it is only loosely aligned with ${role}.`
          : `There is not enough verified role evidence to judge alignment with ${role}.`,
      roleHits,
      roleHits.length ? [] : [`Role-aligned work for ${role}`],
    ),
    dimension(
      "technical_relevance",
      skillHits.length + techHits.length >= 2
        ? "strong"
        : skillHits.length + techHits.length === 1
          ? "partial"
          : hasAnyArtifact
            ? "partial"
            : "unknown",
      skillHits.length + techHits.length > 0
        ? "Verified skills and project technologies overlap the campaign’s technical direction."
        : hasAnyArtifact
          ? "Verified artifacts exist, but their technologies are only weakly related to this campaign."
          : "There is not enough verified technical evidence to judge relevance.",
      [...skillHits, ...techHits],
      [],
    ),
    dimension(
      "technical_depth",
      statusFromPattern(allText, DEPTH_PATTERN, hasAnyArtifact),
      explanationFromPattern(
        allText,
        DEPTH_PATTERN,
        hasAnyArtifact,
        "Verified work mentions performance, architecture, or similar depth signals.",
        "The available evidence describes application work, but not yet technical depth such as performance, architecture, or scale.",
        "There is not enough verified work to judge technical depth.",
      ),
      idsMatchingText(evidence, DEPTH_PATTERN),
      hasAnyArtifact && !DEPTH_PATTERN.test(allText)
        ? ["Architecture, performance, or scale outcomes"]
        : [],
    ),
    dimension(
      "project_complexity",
      !hasProjects
        ? "unknown"
        : COMPLEXITY_PATTERN.test(allText) && !CRUD_PATTERN.test(allText)
          ? "strong"
          : COMPLEXITY_PATTERN.test(allText)
            ? "partial"
            : "missing",
      !hasProjects
        ? "No verified projects are available, so complexity cannot be judged yet."
        : COMPLEXITY_PATTERN.test(allText)
          ? "Verified projects mention integrations, authentication, or similar non-trivial concerns."
          : "Your projects demonstrate application development, but the available evidence does not yet show production-style complexity such as authentication, background processing, or external integrations.",
      idsMatchingText(evidence, COMPLEXITY_PATTERN),
      hasProjects && !COMPLEXITY_PATTERN.test(allText)
        ? ["Authentication, integrations, or background processing"]
        : [],
    ),
    dimension(
      "production_readiness",
      statusFromPattern(allText, PRODUCTION_PATTERN, hasAnyArtifact),
      explanationFromPattern(
        allText,
        PRODUCTION_PATTERN,
        hasAnyArtifact,
        "Verified work refers to production use, real users, or operational outcomes.",
        "Your projects demonstrate application development, but the available evidence does not yet show production deployment or real-user operation.",
        "There is not enough verified work to judge production readiness.",
      ),
      idsMatchingText(evidence, PRODUCTION_PATTERN),
      hasAnyArtifact && !PRODUCTION_PATTERN.test(allText)
        ? ["Production deployment or real-user outcomes"]
        : [],
    ),
    dimension(
      "testing_practices",
      statusFromPattern(allText, TEST_PATTERN, hasAnyArtifact),
      explanationFromPattern(
        allText,
        TEST_PATTERN,
        hasAnyArtifact,
        "Verified work mentions automated testing or related engineering practice.",
        "The available evidence does not yet show automated testing or similar engineering practices.",
        "There is not enough verified work to judge testing practice.",
      ),
      idsMatchingText(evidence, TEST_PATTERN),
      hasAnyArtifact && !TEST_PATTERN.test(allText)
        ? ["Automated tests or CI evidence"]
        : [],
    ),
    dimension(
      "deployment_ops",
      statusFromPattern(allText, DEPLOY_PATTERN, hasAnyArtifact),
      explanationFromPattern(
        allText,
        DEPLOY_PATTERN,
        hasAnyArtifact,
        "Verified work mentions deployment, hosting, or operations tooling.",
        "The available evidence does not yet show deployment or operations practice.",
        "There is not enough verified work to judge deployment evidence.",
      ),
      idsMatchingText(evidence, DEPLOY_PATTERN),
      hasAnyArtifact && !DEPLOY_PATTERN.test(allText)
        ? ["Deployment, CI, or hosting evidence"]
        : [],
    ),
    dimension(
      "collaboration",
      statusFromPattern(allText, COLLAB_PATTERN, hasWork || hasProjects),
      explanationFromPattern(
        allText,
        COLLAB_PATTERN,
        hasWork || hasProjects,
        "Verified work mentions collaboration with other people.",
        "The available evidence is mostly individual work and does not yet show collaboration.",
        "There is not enough verified work to judge collaboration.",
      ),
      idsMatchingText(evidence, COLLAB_PATTERN),
      [],
    ),
    dimension(
      "public_portfolio",
      evidence.githubUrl || evidence.portfolioUrl
        ? "strong"
        : evidence.linkedinUrl
          ? "partial"
          : "unknown",
      evidence.githubUrl || evidence.portfolioUrl
        ? "A public GitHub or portfolio URL is present on the verified profile."
        : evidence.linkedinUrl
          ? "A LinkedIn URL is present, but no public GitHub or portfolio URL is verified."
          : "No public portfolio URL is present on the verified profile, so portfolio quality cannot be judged.",
      [],
      evidence.githubUrl || evidence.portfolioUrl ? [] : ["Public GitHub or portfolio URL"],
    ),
    dimension(
      "communication_docs",
      statusFromPattern(allText, DOCS_PATTERN, hasAnyArtifact),
      explanationFromPattern(
        allText,
        DOCS_PATTERN,
        hasAnyArtifact,
        "Verified work mentions documentation or similar communication artifacts.",
        "The available evidence does not yet show documentation that an employer could inspect.",
        "There is not enough verified work to judge documentation quality.",
      ),
      idsMatchingText(evidence, DOCS_PATTERN),
      hasAnyArtifact && !DOCS_PATTERN.test(allText)
        ? ["README, runbook, or deployment documentation"]
        : [],
    ),
    dimension(
      "professional_evidence",
      hasWork ? "strong" : hasProjects ? "partial" : "unknown",
      hasWork
        ? "Verified professional work experience is present."
        : hasProjects
          ? "Verified projects exist, but there is no professional or real-user employment evidence yet."
          : "There is not enough verified work to judge professional evidence.",
      evidence.workExperience.map((item) => item.id),
      hasWork ? [] : ["Professional or real-user work"],
    ),
    stackSpecificDimension(intent, evidence, market, stack, skillHits, techHits),
  ];
}

export function selectHighestPriorityGap(
  dimensions: GrowthAssessmentDimension[],
): AssessmentDimensionKey {
  const byKey = new Map(dimensions.map((item) => [item.key, item]));
  for (const key of GAP_PRIORITY) {
    const item = byKey.get(key);
    if (item?.status === "missing") return key;
  }
  for (const key of GAP_PRIORITY) {
    const item = byKey.get(key);
    if (item?.status === "partial") return key;
  }
  return "role_alignment";
}

export function skillWithoutProjectEvidence(
  evidence: VerifiedEvidenceSummary,
  skillName: string,
): boolean {
  const skill = evidence.skills.some((item) => includesNormalized(item.name, skillName));
  if (!skill) return false;
  return !evidence.projects.some((project) =>
    (project.technologies ?? []).some((tech) => includesNormalized(tech, skillName)) ||
    includesNormalized((project.bullets ?? []).join(" "), skillName) ||
    includesNormalized(project.name, skillName),
  );
}

function stackSpecificDimension(
  intent: CampaignIntent,
  evidence: VerifiedEvidenceSummary,
  market: MarketSignals | null | undefined,
  stack: string[],
  skillHits: string[],
  techHits: string[],
): GrowthAssessmentDimension {
  const key: AssessmentDimensionKey = "stack_specific";
  if (stack.length === 0) {
    const marketTop = market?.requirements[0];
    if (!marketTop) {
      return dimension(
        key,
        "unknown",
        "No preferred stack was provided, so stack-specific evidence cannot be judged beyond the target role.",
        [],
        [],
      );
    }
    const demonstrated = evidence.projects.some((project) =>
      includesNormalized(
        `${project.name} ${(project.technologies ?? []).join(" ")} ${(project.bullets ?? []).join(" ")}`,
        marketTop.label,
      ),
    );
    return dimension(
      key,
      demonstrated ? "strong" : evidence.verified ? "missing" : "unknown",
      demonstrated
        ? `Verified projects demonstrate ${marketTop.label}.`
        : `${marketTop.label} appeared in ${marketTop.frequency} of ${marketTop.sampleSize} analysed roles. Your verified profile does not currently demonstrate it in a project.`,
      [],
      demonstrated ? [] : [marketTop.label],
    );
  }

  const missingStack = stack.filter((tech) => skillWithoutProjectEvidence(evidence, tech) || (
    !skillHits.some((id) =>
      evidence.skills.find((skill) => skill.id === id && includesNormalized(skill.name, tech)),
    ) &&
    !techHits.some((id) =>
      evidence.projects.find((project) =>
        project.id === id &&
        (project.technologies ?? []).some((value) => includesNormalized(value, tech)),
      ),
    )
  ));
  const hasSkillNoProject = stack.some((tech) => skillWithoutProjectEvidence(evidence, tech));

  if (hasSkillNoProject) {
    return dimension(
      key,
      "missing",
      `Your verified profile contains ${stack.join(", ")} experience, but no project currently demonstrates ${missingStack[0] ?? stack[0]}.`,
      skillHits,
      [`Project evidence for ${missingStack[0] ?? stack.join(", ")}`],
    );
  }
  if (techHits.length > 0 && missingStack.length === 0) {
    return dimension(
      key,
      "strong",
      `Verified projects demonstrate ${stack.join(", ")}.`,
      techHits,
      [],
    );
  }
  if (!evidence.projects.length && !evidence.skills.length) {
    return dimension(
      key,
      "unknown",
      `There is not enough verified evidence to judge ${stack.join(", ")}.`,
      [],
      [],
    );
  }
  return dimension(
    key,
    missingStack.length ? "missing" : "partial",
    missingStack.length
      ? `The ${intent.primaryRole} campaign targets ${stack.join(", ")}, but verified projects do not yet demonstrate ${missingStack.join(", ")}.`
      : `Some verified work relates to ${stack.join(", ")}, but the evidence is incomplete.`,
    [...skillHits, ...techHits],
    missingStack,
  );
}

function dimension(
  key: AssessmentDimensionKey,
  status: GrowthAssessmentDimension["status"],
  explanation: string,
  supportingEvidenceIds: string[],
  missingEvidence: string[],
): GrowthAssessmentDimension {
  return {
    key,
    label: DIMENSION_LABELS[key],
    status,
    explanation,
    supportingEvidenceIds,
    missingEvidence,
  };
}

function statusFromPattern(
  text: string,
  pattern: RegExp,
  hasContext: boolean,
): GrowthAssessmentDimension["status"] {
  if (!hasContext) return "unknown";
  return pattern.test(text) ? "strong" : "missing";
}

function explanationFromPattern(
  text: string,
  pattern: RegExp,
  hasContext: boolean,
  strong: string,
  missing: string,
  unknown: string,
): string {
  if (!hasContext) return unknown;
  return pattern.test(text) ? strong : missing;
}

function collectText(evidence: VerifiedEvidenceSummary): string {
  return [
    ...evidence.projects.flatMap((item) => [
      item.name,
      item.role ?? "",
      ...(item.bullets ?? []),
      ...(item.technologies ?? []),
    ]),
    ...evidence.workExperience.flatMap((item) => [
      item.role ?? "",
      item.employer ?? "",
      ...(item.bullets ?? []),
    ]),
  ].join(" ");
}

function matchingIds(
  items: VerifiedEvidenceSummary["skills"],
  predicate: (item: VerifiedEvidenceSummary["skills"][number]) => boolean,
): string[] {
  return items.filter(predicate).map((item) => item.id);
}

function idsMatchingText(
  evidence: VerifiedEvidenceSummary,
  pattern: RegExp,
): string[] {
  const ids: string[] = [];
  for (const item of [...evidence.projects, ...evidence.workExperience]) {
    const text = `${item.name} ${item.role ?? ""} ${(item.bullets ?? []).join(" ")} ${(item.technologies ?? []).join(" ")}`;
    if (pattern.test(text)) ids.push(item.id);
  }
  return ids;
}

function includesNormalized(haystack: string, needle: string): boolean {
  if (!needle.trim()) return false;
  return haystack.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());
}
