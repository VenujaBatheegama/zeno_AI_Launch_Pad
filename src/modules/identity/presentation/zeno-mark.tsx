export function ZenoMark(props: { className?: string; size?: number }) {
  const size = props.size ?? 28;
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold tracking-tight text-[var(--zeno-ink)] ${props.className ?? ""}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="28" height="28" rx="8" fill="var(--zeno-primary)" />
        <rect x="6" y="7" width="4" height="4" fill="var(--zeno-violet-soft)" />
        <rect x="12" y="7" width="4" height="4" fill="#fff" />
        <rect x="18" y="7" width="4" height="4" fill="var(--zeno-violet)" />
        <rect x="6" y="13" width="16" height="3" fill="#fff" opacity="0.9" />
        <rect x="6" y="18" width="10" height="3" fill="var(--zeno-violet-soft)" />
      </svg>
      <span>Zeno</span>
    </span>
  );
}

export function ZenoPixelAvatar(props: { size?: number; className?: string }) {
  const size = props.size ?? 28;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={props.className}
    >
      <rect width="28" height="28" rx="8" fill="var(--zeno-violet-soft)" />
      <rect x="7" y="8" width="4" height="4" fill="var(--zeno-primary)" />
      <rect x="17" y="8" width="4" height="4" fill="var(--zeno-primary)" />
      <rect x="7" y="16" width="3" height="3" fill="var(--zeno-primary-deep)" />
      <rect x="18" y="16" width="3" height="3" fill="var(--zeno-primary-deep)" />
      <rect x="9" y="19" width="10" height="3" fill="var(--zeno-violet)" />
    </svg>
  );
}
