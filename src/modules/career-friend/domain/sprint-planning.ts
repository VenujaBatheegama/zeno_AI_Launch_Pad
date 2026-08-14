import type { GrowthAction } from "@/modules/career-campaign/domain/schemas";

import type { GapType } from "./schemas";

const QUALIFICATION_PATTERN =
  /\b(degree|bachelor|master|phd|doctorate|certification|certificate|licensed?|qualification|\d+\+?\s*years?)\b/i;
const VISIBILITY_PATTERN =
  /\b(linkedin|portfolio|public profile|thought leadership|personal brand|blog|posting|community)\b/i;
const EVIDENCE_PATTERN =
  /\b(experience|production|hands[- ]on|case study|track record|demonstrat|delivered|built|impact)\b/i;

export function classifyGap(label: string): GapType {
  if (QUALIFICATION_PATTERN.test(label)) return "qualification";
  if (VISIBILITY_PATTERN.test(label)) return "visibility";
  if (EVIDENCE_PATTERN.test(label)) return "evidence";
  return "skill";
}

export function buildSprintPlan(action: GrowthAction) {
  const gapType = classifyGap(action.gapLabel);
  const plans = {
    skill: {
      title: `Build proof of ${action.gapLabel}`,
      objective: `Learn the smallest useful slice of ${action.gapLabel} and demonstrate it in a reviewable artifact.`,
      estimatedHours: 6,
      milestones: [
        `Choose one real problem where ${action.gapLabel} is relevant`,
        "Build a small working artifact with a clear README",
        "Measure or explain one concrete outcome and publish the work",
      ],
    },
    evidence: {
      title: `Turn ${action.gapLabel} into evidence`,
      objective: `Convert an existing claim into specific, verifiable proof that can support future applications.`,
      estimatedHours: 3,
      milestones: [
        "Select the strongest relevant project or work example",
        "Write the problem, your action, and the measurable result",
        "Publish or document the artifact and capture its link",
      ],
    },
    visibility: {
      title: `Make ${action.gapLabel} visible`,
      objective: `Surface existing evidence publicly without manufacturing expertise or posting for its own sake.`,
      estimatedHours: 2,
      milestones: [
        "Choose one existing proof point worth making public",
        "Draft a concise post or portfolio case study",
        "Publish it and update the relevant profile link",
      ],
    },
    qualification: {
      title: `Validate the ${action.gapLabel} requirement`,
      objective: `Decide whether this qualification is truly necessary before committing significant time or money.`,
      estimatedHours: 2,
      milestones: [
        "Review the affected roles and separate required from preferred wording",
        "Compare one credible pathway, cost, and time commitment",
        "Choose to pursue, defer, or target roles where equivalent evidence is accepted",
      ],
    },
  } as const;

  return { gapType, ...plans[gapType] };
}
