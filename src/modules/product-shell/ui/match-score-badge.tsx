/**
 * Evidence-fit score badge with real semantic color banding.
 *
 * A flat "always the same color" badge — regardless of the actual score
 * — undermines the one thing Zeno sells: a trustworthy, evidence-backed
 * number. An 18% match shown the same way as a 90% match breaks trust
 * the moment a user compares two scores.
 *
 * Bands:
 *   < 40   → danger  (weak match, evidence gaps dominate)
 *   40–69  → warning (partial match, worth a look)
 *   ≥ 70   → success (strong match)
 */

const BAND_MAX = { danger: 40, warning: 70 } as const;

export type ScoreBand = "danger" | "warning" | "success";

export function scoreBand(score: number): ScoreBand {
  if (score < BAND_MAX.danger) return "danger";
  if (score < BAND_MAX.warning) return "warning";
  return "success";
}

const BAND_LABEL: Record<ScoreBand, string> = {
  danger: "Weak match",
  warning: "Partial match",
  success: "Strong match",
};

const BAND_STYLE: Record<ScoreBand, { bg: string; fg: string }> = {
  danger: { bg: "var(--zeno-danger-soft)", fg: "var(--zeno-danger)" },
  warning: { bg: "var(--zeno-warning-soft)", fg: "var(--zeno-warning)" },
  success: { bg: "var(--zeno-success-soft)", fg: "var(--zeno-success)" },
};

export function MatchScoreBadge(props: {
  score: number;
  /** Optional trailing detail, e.g. career level. */
  detail?: string;
  size?: "sm" | "md";
}) {
  const rounded = Math.round(props.score);
  const band = scoreBand(rounded);
  const style = BAND_STYLE[band];
  const isSmall = props.size !== "md";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ${
        isSmall ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-sm"
      }`}
      style={{ backgroundColor: style.bg, color: style.fg }}
      title={`${rounded}% evidence fit — ${BAND_LABEL[band]}`}
    >
      <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ backgroundColor: style.fg }} />
      {rounded}% match
      {props.detail ? <span className="opacity-70">· {props.detail}</span> : null}
    </span>
  );
}
