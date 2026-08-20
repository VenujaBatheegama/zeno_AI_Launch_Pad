export default function JobsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-44 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
          <div className="h-4 w-72 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)] opacity-60" />
        </div>
        <div className="h-9 w-32 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-[16px] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="h-4 w-1/2 rounded bg-[var(--zeno-surface-sunken)]" />
            <div className="mt-3 h-6 w-1/3 rounded bg-[var(--zeno-surface-sunken)]" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="h-5 w-36 rounded bg-[var(--zeno-surface-sunken)]" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-[16px] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="h-4 w-1/3 rounded bg-[var(--zeno-surface-sunken)]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[var(--zeno-surface-sunken)] opacity-60" />
          </div>
        ))}
      </div>
    </div>
  );
}
