export default function CvsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="space-y-2">
        <div className="h-8 w-36 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-elevated)]" />
        <div className="h-4 w-72 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
      </header>

      <div className="flex gap-2">
        <div className="h-9 w-24 rounded-full bg-[var(--zeno-surface-elevated)]" />
        <div className="h-9 w-24 rounded-full bg-[var(--zeno-surface-sunken)]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="h-4 w-2/3 rounded bg-[var(--zeno-surface-elevated)]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[var(--zeno-surface-sunken)]" />
            <div className="mt-14 h-8 w-28 rounded-full bg-[var(--zeno-surface-elevated)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
