import type { DecisionReason, FeedbackSignal } from "../domain/schemas";

/** Map controlled rejection reasons to ranking signal categories. */
export function signalFromDecisionReason(
  reason: DecisionReason,
): { signalType: string; signalValue: string } | null {
  switch (reason) {
    case "wrong_seniority":
      return { signalType: "seniority", signalValue: "mismatch" };
    case "work_mode":
      return { signalType: "work_mode", signalValue: "mismatch" };
    case "location":
      return { signalType: "location", signalValue: "mismatch" };
    case "wrong_role":
      return { signalType: "role", signalValue: "mismatch" };
    case "wrong_technology":
      return { signalType: "technology", signalValue: "mismatch" };
    case "company":
      return { signalType: "company", signalValue: "mismatch" };
    default:
      return null;
  }
}

export type RankableForFeedback = {
  listingId: string;
  finalScore: number;
  workMode?: string | null;
  location?: string | null;
  title?: string | null;
  organizationName?: string | null;
  careerLevel?: string | null;
};

export type FeedbackAdjustment = {
  listingId: string;
  delta: number;
  reasons: string[];
};

const MAX_TOTAL_PENALTY = 12;
const SIGNAL_THRESHOLD = 2;

/**
 * Deterministic, capped adjustment from explicit rejection signals.
 * Prefer explicit profile preferences elsewhere; this only nudges ordering.
 */
export function computeFeedbackAdjustments(
  candidates: RankableForFeedback[],
  signals: FeedbackSignal[],
): FeedbackAdjustment[] {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    const key = `${signal.signalType}:${signal.signalValue}`;
    counts.set(key, (counts.get(key) ?? 0) + signal.weight);
  }

  return candidates.map((candidate) => {
    let delta = 0;
    const reasons: string[] = [];

    const apply = (signalKey: string, label: string, amount: number) => {
      const count = counts.get(signalKey) ?? 0;
      if (count < SIGNAL_THRESHOLD) return;
      delta -= amount;
      reasons.push(`${label} (×${count})`);
    };

    if (candidate.workMode) {
      apply("work_mode:mismatch", `work mode ${candidate.workMode}`, 3);
    }
    if (candidate.location) {
      apply("location:mismatch", "location", 3);
    }
    if (candidate.careerLevel) {
      apply("seniority:mismatch", "seniority", 4);
    }
    if (candidate.title) {
      apply("role:mismatch", "role", 3);
    }
    if (candidate.organizationName) {
      apply("company:mismatch", "company", 2);
    }
    apply("technology:mismatch", "technology", 2);

    delta = Math.max(-MAX_TOTAL_PENALTY, delta);
    return { listingId: candidate.listingId, delta, reasons };
  });
}

export function applyFeedbackAdjustments<T extends RankableForFeedback>(
  candidates: T[],
  signals: FeedbackSignal[],
): Array<T & { adjustedScore: number; feedbackReasons: string[] }> {
  const adjustments = new Map(
    computeFeedbackAdjustments(candidates, signals).map((item) => [
      item.listingId,
      item,
    ]),
  );
  return candidates
    .map((candidate) => {
      const adjustment = adjustments.get(candidate.listingId);
      const delta = adjustment?.delta ?? 0;
      return {
        ...candidate,
        adjustedScore: candidate.finalScore + delta,
        feedbackReasons: adjustment?.reasons ?? [],
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}
