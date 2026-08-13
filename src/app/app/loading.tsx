export default function AppLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 p-8">
      <span
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--zeno-primary)] border-t-transparent"
        aria-hidden
      />
      <p className="text-sm text-[var(--zeno-ink-muted)]">Loading workspace…</p>
    </div>
  );
}
