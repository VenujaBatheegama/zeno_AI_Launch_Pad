import type { AssessmentDimensionKey } from "./policy";
import type {
  AdvisorRecommendation,
  CampaignIntent,
  GrowthAssessmentDimension,
  MarketSignals,
  ProposedMilestone,
  VerifiedEvidenceSummary,
  WorkloadSnapshot,
} from "./schemas";
import { estimateEffort, recommendActionType } from "./workload";

export function buildFallbackRecommendation(input: {
  intent: CampaignIntent;
  gapKey: AssessmentDimensionKey;
  dimensions: GrowthAssessmentDimension[];
  evidence: VerifiedEvidenceSummary;
  market: MarketSignals | null;
  workload: WorkloadSnapshot;
}): AdvisorRecommendation {
  const type = recommendActionType({
    gapKey: input.gapKey,
    workload: input.workload,
  });
  const effort = estimateEffort({
    type,
    availableWeeklyHours: input.workload.availableWeeklyHours,
    overcommitted: input.workload.overcommitted,
  });
  const dimension = input.dimensions.find((item) => item.key === input.gapKey);
  const stack = input.intent.preferredTechnologies;
  const role = input.intent.primaryRole;
  const stackLabel = stack.length ? stack.join(", ") : role;
  const marketSummary = input.market
    ? input.market.requirements[0]
      ? `${input.market.requirements[0].label} appeared in ${input.market.requirements[0].frequency} of ${input.market.relevantJobCount} analysed roles in this campaign.`
      : null
    : null;

  const title = titleFor(type, stackLabel, role, input.workload.coveringProjectTitle);
  const evidenceGap =
    dimension?.explanation ??
    `Verified evidence for ${role} is incomplete on ${dimension?.label ?? input.gapKey}.`;
  const expectedEvidence = expectedEvidenceFor(type, stackLabel, input.gapKey);
  const milestones = milestonesFor(type, stackLabel, effort.hoursPerWeek);

  return {
    type,
    gapKey: input.gapKey,
    title,
    summary: summaryFor(type, stackLabel, role, effort),
    rationale: rationaleFor({
      type,
      role,
      stackLabel,
      evidenceGap,
      workload: input.workload,
      marketSummary,
      modeHasMarket: Boolean(marketSummary),
    }),
    evidenceGap,
    expectedEvidence,
    estimatedWeeks: effort.weeks,
    estimatedHoursPerWeek: effort.hoursPerWeek,
    proposedMilestones: milestones,
    supportingCampaignIds: [
      input.intent.id,
      ...input.workload.campaignOverlapIds.filter((id) => id !== input.intent.id),
    ],
    marketEvidenceSummary: marketSummary,
  };
}

export function mergeProposalRevision(
  current: AdvisorRecommendation,
  revision: Partial<AdvisorRecommendation> | null,
): AdvisorRecommendation {
  if (!revision) return current;
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(revision).filter(([, value]) => value !== undefined),
    ),
    gapKey: current.gapKey,
    supportingCampaignIds: revision.supportingCampaignIds ?? current.supportingCampaignIds,
    proposedMilestones: revision.proposedMilestones ?? current.proposedMilestones,
  };
}

export function groundedAgainstEvidence(
  recommendation: AdvisorRecommendation,
  evidence: VerifiedEvidenceSummary,
): string[] {
  const invented: string[] = [];
  const claimed = [
    ...recommendation.summary.matchAll(/\b(?:you have|your verified profile contains|you already demonstrate)\s+([^.]{3,80})/gi),
  ];
  const known = new Set(
    [
      ...evidence.skills.map((item) => item.name.toLocaleLowerCase()),
      ...evidence.projects.flatMap((item) => [
        item.name.toLocaleLowerCase(),
        ...(item.technologies ?? []).map((tech) => tech.toLocaleLowerCase()),
      ]),
      ...evidence.workExperience.map((item) => (item.role ?? "").toLocaleLowerCase()),
    ].filter(Boolean),
  );
  for (const match of claimed) {
    const phrase = match[1]?.toLocaleLowerCase() ?? "";
    const token = phrase.split(/,| and /)[0]?.trim() ?? "";
    if (token && token.length < 40 && known.size > 0 && ![...known].some((item) => phrase.includes(item) || item.includes(token))) {
      invented.push(token);
    }
  }
  return invented;
}

function titleFor(
  type: AdvisorRecommendation["type"],
  stackLabel: string,
  role: string,
  coveringTitle: string | null,
): string {
  if (type === "extend_existing_project" && coveringTitle) {
    return `Extend ${coveringTitle} for ${role}`;
  }
  if (type === "improve_portfolio") return `Publish a clearer ${role} portfolio`;
  if (type === "document_existing_work") {
    return `Document existing ${stackLabel} work`;
  }
  if (type === "learning_artifact") {
    return `Produce a ${stackLabel} learning artifact`;
  }
  return `Build and deploy a ${stackLabel} ${role} project`;
}

function summaryFor(
  type: AdvisorRecommendation["type"],
  stackLabel: string,
  role: string,
  effort: { weeks: number; hoursPerWeek: number },
): string {
  if (type === "document_existing_work") {
    return `Write deployment and testing notes for existing ${stackLabel} work so employers can see how it runs. Estimated ${effort.weeks} week at ${effort.hoursPerWeek} hours per week.`;
  }
  if (type === "improve_portfolio") {
    return `Publish a focused ${role} portfolio entry with a live link and a short case write-up. Estimated ${effort.weeks} week at ${effort.hoursPerWeek} hours per week.`;
  }
  if (type === "extend_existing_project") {
    return `Add the missing production, testing, or documentation evidence to the project you are already tracking instead of starting another one. Estimated ${effort.weeks} weeks at ${effort.hoursPerWeek} hours per week.`;
  }
  return `Build and deploy a production-style ${stackLabel} project aligned to ${role}, including tests and deployment notes. Estimated ${effort.weeks} weeks at ${effort.hoursPerWeek} hours per week.`;
}

function rationaleFor(input: {
  type: AdvisorRecommendation["type"];
  role: string;
  stackLabel: string;
  evidenceGap: string;
  workload: WorkloadSnapshot;
  marketSummary: string | null;
  modeHasMarket: boolean;
}): string {
  const basis = input.modeHasMarket
    ? "This uses both the campaign’s target role and requirements already seen in analysed campaign jobs."
    : "This is a role-level recommendation from the campaign criteria and verified profile. It is not yet refined by analysed campaign jobs.";
  const capacity = input.workload.coveringProjectId
    ? `Your active project “${input.workload.coveringProjectTitle}” already supports most of this campaign, so the next action extends that work.`
    : input.workload.overcommitted
      ? "Your current Growth workload leaves little spare time, so this is a smaller documentation or portfolio action rather than another large project."
      : "No existing Growth project currently covers this gap.";
  return `${input.evidenceGap} ${capacity} ${basis}`;
}

function expectedEvidenceFor(
  type: AdvisorRecommendation["type"],
  stackLabel: string,
  gapKey: AssessmentDimensionKey,
): string[] {
  if (type === "document_existing_work") {
    return [
      "A public README or runbook covering setup and deployment",
      "A short note of what was tested and how",
    ];
  }
  if (type === "improve_portfolio") {
    return ["A live portfolio or GitHub URL", "A one-page case summary of the work"];
  }
  return [
    `A repository demonstrating ${stackLabel}`,
    gapKey === "testing_practices"
      ? "Automated tests in CI"
      : "Automated tests for core behaviour",
    "A deployed environment or deployment documentation",
    "A short write-up of the problem, constraints, and outcome",
  ];
}

function milestonesFor(
  type: AdvisorRecommendation["type"],
  stackLabel: string,
  hoursPerWeek: number,
): ProposedMilestone[] {
  if (type === "document_existing_work" || type === "improve_portfolio") {
    return [
      {
        title: "Collect existing artifacts",
        description: `Gather the current ${stackLabel} work, links, and what an employer should understand.`,
        estimatedHours: Math.max(2, hoursPerWeek),
      },
      {
        title: "Publish the write-up",
        description: "Add setup, tests, and deployment notes a hiring manager can follow without asking you.",
        estimatedHours: Math.max(2, hoursPerWeek),
      },
    ];
  }
  if (type === "extend_existing_project") {
    return [
      {
        title: "Identify the missing proof",
        description: `List what the current project still does not show for ${stackLabel}.`,
        estimatedHours: Math.max(2, hoursPerWeek - 1),
      },
      {
        title: "Add the missing capability",
        description: "Implement the smallest production, test, or operations improvement that closes the gap.",
        estimatedHours: Math.max(3, hoursPerWeek),
      },
      {
        title: "Record the evidence",
        description: "Document the change and capture a link or screenshot for profile review.",
        estimatedHours: Math.max(2, hoursPerWeek - 1),
      },
    ];
  }
  return [
    {
      title: "Define the problem and stack",
      description: `Specify the ${stackLabel} problem, constraints, and completion criteria.`,
      estimatedHours: Math.max(2, hoursPerWeek - 1),
    },
    {
      title: "Build the core path",
      description: "Implement the main user or API flow with persistence.",
      estimatedHours: Math.max(4, hoursPerWeek),
    },
    {
      title: "Add tests and deployment",
      description: "Cover the core path with tests and deploy or document a reproducible deployment.",
      estimatedHours: Math.max(3, hoursPerWeek),
    },
    {
      title: "Write the hiring evidence",
      description: "Publish a short case write-up with links that can be verified into the career profile.",
      estimatedHours: Math.max(2, hoursPerWeek - 1),
    },
  ];
}
