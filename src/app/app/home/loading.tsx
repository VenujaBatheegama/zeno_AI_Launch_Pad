export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-9 w-64 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)]" />
        <div className="h-4 w-96 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-surface-sunken)] opacity-60" />
      </div>

      <div className="rounded-[24px] border border-[var(--zeno-border)] bg-white p-6 shadow-[var(--zeno-shadow-sm)]">
        <div className="h-40 rounded-[16px] bg-[var(--zeno-violet-wash)] opacity-70" />
      </div>
    </div>
  );
}
