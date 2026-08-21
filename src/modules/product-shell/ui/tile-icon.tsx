/**
 * Icon tile — the block-with-icon treatment used for feature cards and
 * category markers, replacing plain text headers. "tint" is the soft
 * violet wash used for most tiles; "accent" is the solid brand color,
 * reserved for the rare tile that IS the point (e.g. the primary action
 * on Home), not spread across every card.
 */

export type TileTone = "tint" | "accent";

const TONE_STYLE: Record<TileTone, { bg: string; fg: string }> = {
  tint: { bg: "var(--zeno-violet-soft)", fg: "var(--zeno-primary-deep)" },
  accent: { bg: "var(--zeno-primary)", fg: "#ffffff" },
};

export type TileGlyph =
  | "search"
  | "radar"
  | "briefcase"
  | "growth"
  | "badge"
  | "bell"
  | "sparkle";

function Glyph({ name }: { name: TileGlyph }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9 } as const;
  switch (name) {
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16.5 16.5 3.5 3.5" />
        </svg>
      );
    case "radar":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <path d="M12 12 18 7" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2.5" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "growth":
      return (
        <svg {...common}>
          <path d="M5 20V10M12 20V4M19 20v-7" />
        </svg>
      );
    case "badge":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="5.5" />
          <path d="m8 14-1.5 6L12 17l5.5 3L16 14" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "sparkle":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 13.8 9.2 21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z" />
        </svg>
      );
    default:
      return null;
  }
}

export function TileIcon(props: {
  tone: TileTone;
  glyph: TileGlyph;
  /** Smaller, centered variant for use inline inside empty states. */
  inline?: boolean;
}) {
  const size = props.inline ? "size-11 mx-auto" : "size-11";
  const style = TONE_STYLE[props.tone];
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-[16px]`}
      style={{ backgroundColor: style.bg, color: style.fg }}
      aria-hidden
    >
      <span className="size-5">
        <Glyph name={props.glyph} />
      </span>
    </span>
  );
}
