export default function RecommendationsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="space-y-2">
        <div className="h-8 w-40 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-elevated)]" />
        <div className="h-4 w-80 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
      </header>

      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 w-2/3">
                <div className="h-5 w-3/4 rounded bg-[var(--zeno-surface-elevated)]" />
                <div className="h-4 w-1/2 rounded bg-[var(--zeno-surface-sunken)]" />
              </div>
              <div className="h-7 w-20 rounded-full bg-[var(--zeno-surface-elevated)]" />
            </div>
            <div className="mt-4 flex gap-2">
              <div className="h-8 w-24 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-elevated)]" />
              <div className="h-8 w-24 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
