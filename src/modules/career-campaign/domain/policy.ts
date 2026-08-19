/**
 * Feedback signal weights for application outcomes.
 *
 * Terminal application states emit feedback signals stored in feedback_signals table.
 * FU-1 will consume these weights to adjust ranking scores for future matches.
 */
export const APPLICATION_OUTCOME_SIGNAL_WEIGHTS: Record<string, number> = {
  offer: 1.0,
  rejected: -0.5,
  withdrawn: 0.0,
};
