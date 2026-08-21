export default function ApplicationsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <header className="space-y-2">
        <div className="h-8 w-44 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-elevated)]" />
        <div className="h-4 w-80 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
      </header>

      <section className="space-y-3">
        <div className="h-5 w-32 rounded bg-[var(--zeno-surface-elevated)]" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="h-4 w-1/3 rounded bg-[var(--zeno-surface-elevated)]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[var(--zeno-surface-sunken)]" />
          </div>
        ))}
      </section>

      <section className="space-y-3 pt-4">
        <div className="h-5 w-44 rounded bg-[var(--zeno-surface-elevated)]" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="h-4 w-1/4 rounded bg-[var(--zeno-surface-elevated)]" />
            <div className="mt-2 h-3 w-1/3 rounded bg-[var(--zeno-surface-sunken)]" />
          </div>
        ))}
      </section>
    </div>
  );
}
