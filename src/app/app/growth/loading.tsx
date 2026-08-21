export default function GrowthLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="space-y-2">
        <div className="h-8 w-44 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-elevated)]" />
        <div className="h-4 w-80 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="h-4 w-1/2 rounded bg-[var(--zeno-surface-elevated)]" />
            <div className="mt-3 h-7 w-1/4 rounded bg-[var(--zeno-surface-sunken)]" />
          </div>
        ))}
      </div>

      <div className="rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-sm)]">
        <div className="h-5 w-48 rounded bg-[var(--zeno-surface-elevated)]" />
        <div className="mt-4 space-y-3">
          <div className="h-16 rounded-[12px] bg-[var(--zeno-surface-sunken)]" />
          <div className="h-16 rounded-[12px] bg-[var(--zeno-surface-sunken)]" />
        </div>
      </div>
    </div>
  );
}
