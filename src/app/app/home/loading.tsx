export default function HomeLoading() {
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center space-y-8 animate-pulse">
      {/* Top greeting skeleton */}
      <div className="mx-auto max-w-2xl text-center space-y-4 flex flex-col items-center">
        <div className="h-10 w-72 rounded-lg bg-[var(--zeno-surface-elevated)]" />
        <div className="h-4 w-96 rounded bg-[var(--zeno-surface-sunken)]" />
      </div>

      {/* Activity stats strip skeleton */}
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-3.5 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="size-11 shrink-0 rounded-[16px] bg-[var(--zeno-surface-elevated)]" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-10 rounded bg-[var(--zeno-surface-elevated)]" />
              <div className="h-3 w-20 rounded bg-[var(--zeno-surface-sunken)]" />
            </div>
          </div>
        ))}
      </div>

      {/* Chat / input box skeleton */}
      <div className="w-full h-44 rounded-[22px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)] flex flex-col justify-between">
        <div className="space-y-2">
          <div className="h-4 w-48 rounded bg-[var(--zeno-surface-elevated)]" />
          <div className="h-3 w-80 rounded bg-[var(--zeno-surface-sunken)]" />
        </div>
        <div className="h-12 w-full rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)]" />
      </div>
    </div>
  );
}
