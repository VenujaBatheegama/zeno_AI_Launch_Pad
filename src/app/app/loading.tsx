export default function AppLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
        <div className="h-4 w-72 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)] opacity-60" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] opacity-50" />
        <div className="h-32 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] opacity-50" />
        <div className="h-32 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] opacity-50" />
      </div>

      <div className="space-y-3 pt-4">
        <div className="h-24 rounded-[16px] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]">
          <div className="h-4 w-1/3 rounded bg-[var(--zeno-surface-sunken)]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[var(--zeno-surface-sunken)] opacity-60" />
        </div>
        <div className="h-24 rounded-[16px] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]">
          <div className="h-4 w-1/4 rounded bg-[var(--zeno-surface-sunken)]" />
          <div className="mt-2 h-3 w-2/5 rounded bg-[var(--zeno-surface-sunken)] opacity-60" />
        </div>
      </div>
    </div>
  );
}
