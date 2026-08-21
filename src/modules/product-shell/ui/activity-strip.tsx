import Link from "next/link";

import { TileIcon, type TileGlyph } from "./tile-icon";

/**
 * Proof-of-work strip for the Home screen.
 *
 * Zeno's pitch is a proactive agent working in the background — a blank
 * chat greeting looks identical to any stateless chatbot. This strip is
 * the single place that visibly proves the agent is doing something
 * even when the user isn't actively searching, so Home reads as "an
 * agent working for me" instead of "an empty text box."
 *
 * Real counts only, styled as small icon-tile cards — renders nothing
 * if there's genuinely no activity yet (empty strip would be noise).
 */

export type ActivityStat = {
  label: string;
  value: number;
  href: string;
  glyph: TileGlyph;
  /** Show the live pulse dot — reserve for things actually in motion (active campaigns), not static counts. */
  live?: boolean;
};

export function ActivityStrip(props: { stats: ActivityStat[] }) {
  const visible = props.stats.filter((stat) => stat.value > 0);
  if (visible.length === 0) return null;

  return (
    <div
      className={`mx-auto grid gap-2.5 ${
        visible.length === 1
          ? "max-w-sm"
          : visible.length === 2
            ? "max-w-2xl sm:grid-cols-2"
            : "max-w-3xl sm:grid-cols-3"
      }`}
    >
      {visible.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="flex items-center gap-3 rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-3.5 shadow-[var(--zeno-shadow-sm)] transition-colors hover:border-[var(--zeno-border-hover)]"
        >
          <TileIcon tone="tint" glyph={stat.glyph} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[17px] font-bold text-[var(--zeno-ink)]">{stat.value}</span>
              {stat.live ? (
                <span
                  className="zeno-live-dot inline-block size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--zeno-primary)" }}
                  aria-hidden
                />
              ) : null}
            </div>
            <p className="truncate text-[12px] text-[var(--zeno-ink-muted)]">{stat.label}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
