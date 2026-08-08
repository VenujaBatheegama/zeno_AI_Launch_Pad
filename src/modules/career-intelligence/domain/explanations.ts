import type { JobRequirement, RequirementMatch, ScoreBreakdown } from "./schemas";
import type { CareerLevelSuitability, ConfidenceLevel } from "./schemas";

export function buildMatchExplanation(input: {
  title: string;
  company: string | null;
  score: ScoreBreakdown;
  careerLevel: CareerLevelSuitability;
  confidence: ConfidenceLevel;
  requirements: JobRequirement[];
  matches: RequirementMatch[];
  hardConstraintReasons: string[];
}): string {
  const byId = new Map(input.requirements.map((item) => [item.id, item]));
  const matched = input.matches.filter((item) => item.status === "matched");
  const gaps = input.matches.filter((item) => item.status === "gap");
  const company = input.company ? ` at ${input.company}` : "";

  const gapText =
    gaps.length > 0
      ? ` Main gaps: ${gaps
          .slice(0, 3)
          .map((item) => byId.get(item.requirement_id)?.statement ?? item.requirement_id)
          .join(", ")}.`
      : " No major verified-evidence gaps were identified among extracted requirements.";

  const hard =
    input.hardConstraintReasons.length > 0
      ? ` Hard constraints: ${input.hardConstraintReasons.join(" ")}`
      : "";

  return `${input.title}${company} scores ${input.score.evidence_fit_score}% evidence fit with career level “${input.careerLevel.replaceAll("_", " ")}” (${input.confidence} confidence). ${matched.length} requirement(s) are supported by verified evidence.${gapText}${hard}`;
}
