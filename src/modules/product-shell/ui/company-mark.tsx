"use client";

import { useState } from "react";

/**
 * Company/brand mark for job and campaign cards.
 *
 * No logo API is wired up yet, so this renders deterministic initials
 * (same company → same color, every time) from a restrained fixed
 * palette — a bit of scannable variety without becoming a rainbow. If
 * `logoUrl` is supplied later (a logo API, or a cached column on the
 * job row), it's used instead and falls back to initials automatically
 * if the image fails to load — never a broken-image icon.
 */

const PALETTE = [
  { bg: "var(--zeno-tag-teal-soft)", fg: "var(--zeno-tag-teal)" },
  { bg: "var(--zeno-tag-blue-soft)", fg: "var(--zeno-tag-blue)" },
  { bg: "var(--zeno-tag-berry-soft)", fg: "var(--zeno-tag-berry)" },
  { bg: "var(--zeno-tag-slate-soft)", fg: "var(--zeno-tag-slate)" },
  { bg: "var(--zeno-violet-soft)", fg: "var(--zeno-primary-deep)" },
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyMark(props: {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimension = props.size === "md" ? "size-10" : "size-8";
  const textSize = props.size === "md" ? "text-sm" : "text-[11px]";

  if (props.logoUrl && !imageFailed) {
    return (
      <span
        className={`inline-flex ${dimension} shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--zeno-border)] bg-white`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={props.logoUrl}
          alt=""
          className="h-full w-full object-contain p-1"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  const { bg, fg } = PALETTE[hashString(props.name) % PALETTE.length];

  return (
    <span
      className={`inline-flex ${dimension} shrink-0 items-center justify-center rounded-full font-semibold ${textSize}`}
      style={{ backgroundColor: bg, color: fg }}
      aria-hidden
    >
      {initials(props.name)}
    </span>
  );
}
