import type { JobRequirement } from "@/modules/career-intelligence/domain/schemas";

import type { EvidenceSnapshot, EvidenceSnapshotItem } from "./facts";
import {
  ONE_PAGE_PROJECT_MAX,
  ONE_PAGE_PROJECT_TARGET,
  TWO_PAGE_PROJECT_MAX,
  TWO_PAGE_PROJECT_TARGET,
} from "./policy";
import type { CvMode } from "./schemas";

export type RankedProject = {
  id: string;
  name: string;
  relevanceScore: number;
  strengthScore: number;
  transferableScore: number;
  totalScore: number;
  technologies: string[];
  bulletCount: number;
  directlyRelevant: boolean;
};

export type ProjectSelectionResult = {
  selectedIds: string[];
  ranked: RankedProject[];
  includedFifth: boolean;
  fifthReasons: string[];
  warnings: string[];
};

export function selectProjectsForCv(input: {
  mode: CvMode;
  snapshot: EvidenceSnapshot;
  requirements: JobRequirement[];
  matchEvidenceIds?: string[];
}): ProjectSelectionResult {
  const projects = input.snapshot.items.filter(
    (item): item is Extract<EvidenceSnapshotItem, { type: "project" }> =>
      item.type === "project",
  );
  const ranked = rankProjects({
    projects,
    requirements: input.requirements,
    matchEvidenceIds: input.matchEvidenceIds ?? [],
  });

  if (input.mode === "one_page") {
    return selectOnePage(ranked);
  }
  return selectTwoPage(ranked);
}

export function rankProjects(input: {
  projects: Array<Extract<EvidenceSnapshotItem, { type: "project" }>>;
  requirements: JobRequirement[];
  matchEvidenceIds: string[];
}): RankedProject[] {
  const requirementTerms = input.requirements.flatMap((requirement) => [
    ...tokenize(requirement.statement),
  ]);
  const matchSet = new Set(input.matchEvidenceIds);

  return input.projects
    .map((project) => {
      const corpus = tokenize(
        [project.name, project.role ?? "", ...project.bullets, ...project.technologies].join(
          " ",
        ),
      );
      const overlap = requirementTerms.filter((term) => corpus.has(term)).length;
      const relevanceScore = overlap + (matchSet.has(project.id) ? 2 : 0);
      const bulletDepth = project.bullets.reduce(
        (sum, bullet) => sum + Math.min(40, bullet.trim().split(/\s+/u).length),
        0,
      );
      const techDepth = project.technologies.length;
      const strengthScore =
        Math.min(4, project.bullets.length) * 1.4 +
        Math.min(6, techDepth) * 1.1 +
        Math.min(4, bulletDepth / 25) +
        (project.role ? 0.5 : 0);
      const transferableScore = Math.min(
        3,
        project.technologies.filter((tech) =>
          requirementTerms.includes(normalize(tech)),
        ).length +
          (hasTransferableEngineeringSignal(project) ? 1 : 0),
      );
      // Prioritize: relevance, then technical depth / evidence strength.
      const totalScore =
        relevanceScore * 2.5 + strengthScore * 2.2 + transferableScore * 1.4;
      return {
        id: project.id,
        name: project.name,
        relevanceScore,
        strengthScore,
        transferableScore,
        totalScore,
        technologies: project.technologies,
        bulletCount: project.bullets.length,
        directlyRelevant: relevanceScore >= 2 || overlap >= 2,
      };
    })
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        b.strengthScore - a.strengthScore ||
        a.name.localeCompare(b.name),
    );
}

function selectOnePage(ranked: RankedProject[]): ProjectSelectionResult {
  const warnings: string[] = [];
  if (ranked.length === 0) {
    return {
      selectedIds: [],
      ranked,
      includedFifth: false,
      fifthReasons: [],
      warnings: [
        "No verified projects available; Projects section will be omitted.",
      ],
    };
  }

  const selected: string[] = [];
  const relevant = ranked.filter((item) => item.directlyRelevant);
  for (const project of relevant) {
    if (selected.length >= ONE_PAGE_PROJECT_TARGET) break;
    selected.push(project.id);
  }
  for (const project of ranked) {
    if (selected.length >= ONE_PAGE_PROJECT_TARGET) break;
    if (!selected.includes(project.id)) selected.push(project.id);
  }

  if (ranked.length === 1) {
    warnings.push(
      "Only one verified project exists; one-page mode includes that single project.",
    );
  } else if (
    relevant.length < ONE_PAGE_PROJECT_TARGET &&
    selected.length === ONE_PAGE_PROJECT_TARGET
  ) {
    warnings.push(
      "Filled a one-page project slot with the strongest remaining verified project for transferable relevance.",
    );
  }

  return {
    selectedIds: selected.slice(0, ONE_PAGE_PROJECT_MAX),
    ranked,
    includedFifth: false,
    fifthReasons: [],
    warnings,
  };
}

function selectTwoPage(ranked: RankedProject[]): ProjectSelectionResult {
  const warnings: string[] = [];
  if (ranked.length === 0) {
    return {
      selectedIds: [],
      ranked,
      includedFifth: false,
      fifthReasons: [],
      warnings: [
        "No verified projects available; Projects section will be omitted.",
      ],
    };
  }

  const selected: string[] = [];
  const relevant = ranked.filter((item) => item.directlyRelevant);
  for (const project of relevant) {
    if (selected.length >= TWO_PAGE_PROJECT_TARGET) break;
    selected.push(project.id);
  }
  for (const project of ranked) {
    if (selected.length >= TWO_PAGE_PROJECT_TARGET) break;
    if (!selected.includes(project.id)) selected.push(project.id);
  }

  if (ranked.length < TWO_PAGE_PROJECT_TARGET) {
    warnings.push(
      `Only ${ranked.length} verified project(s) available; two-page mode includes all of them.`,
    );
  } else if (relevant.length < TWO_PAGE_PROJECT_TARGET) {
    warnings.push(
      "Filled remaining two-page project slots with strongest remaining verified projects.",
    );
  }

  let includedFifth = false;
  const fifthReasons: string[] = [];
  const candidate = ranked.find((item) => !selected.includes(item.id));
  if (candidate && ranked.length >= TWO_PAGE_PROJECT_MAX) {
    const complete = candidate.bulletCount >= 2 && candidate.technologies.length > 0;
    const relevantOrStrong =
      candidate.directlyRelevant || candidate.strengthScore >= 3.5;
    const nonRedundant =
      candidate.technologies.some(
        (tech) =>
          !selected.some((id) => {
            const prior = ranked.find((item) => item.id === id);
            return prior?.technologies
              .map((value) => normalize(value))
              .includes(normalize(tech));
          }),
      ) || candidate.relevanceScore >= 2;
    // Long verified projects already consume two-page budget; a 5th project
    // is what previously pushed real renders onto page 3.
    const selectedBulletTotal = selected.reduce((sum, id) => {
      const prior = ranked.find((item) => item.id === id);
      return sum + (prior?.bulletCount ?? 0);
    }, 0);
    const hasHeavyProject = selected.some((id) => {
      const prior = ranked.find((item) => item.id === id);
      return (prior?.bulletCount ?? 0) >= 4;
    });
    const fitsBudget =
      !hasHeavyProject &&
      selectedBulletTotal + candidate.bulletCount <= 12 &&
      candidate.bulletCount <= 3;

    if (complete) fifthReasons.push("complete_verified_facts");
    if (relevantOrStrong) fifthReasons.push("direct_or_strong_capability");
    if (nonRedundant) fifthReasons.push("non_redundant_evidence");
    if (fitsBudget) fifthReasons.push("fits_two_page_budget");
    else fifthReasons.push("skipped_over_two_page_budget");

    if (complete && relevantOrStrong && nonRedundant && fitsBudget) {
      selected.push(candidate.id);
      includedFifth = true;
    }
  }

  return {
    selectedIds: selected.slice(0, TWO_PAGE_PROJECT_MAX),
    ranked,
    includedFifth,
    fifthReasons,
    warnings,
  };
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase()
      .split(/[^a-z0-9.+#/-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Engineering signals that strengthen transferable ranking even without JD keyword hits. */
function hasTransferableEngineeringSignal(
  project: Extract<EvidenceSnapshotItem, { type: "project" }>,
): boolean {
  const corpus = [
    project.name,
    ...project.bullets,
    ...project.technologies,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return /\b(auth|jwt|rbac|api|rest|database|sql|react|\.net|entity framework|docker|integration|report|excel|audit|architecture|full[- ]?stack)\b/u.test(
    corpus,
  );
}
