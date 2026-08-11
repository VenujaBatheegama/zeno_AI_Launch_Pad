import Link from "next/link";

/**
 * Paste-job-description entry point.
 * Kept as a Create CV option; matched-job tailoring is the wired pipeline.
 */
export default function CvsPastePage() {
  return (
    <div className="space-y-4">
      <Link
        href="/app/cvs?tab=create"
        className="text-xs text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
      >
        ← Back to Create CV
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--zeno-ink)]">
          Paste a job description
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          This entry path is unchanged for Create CV. For the full generate →
          edit → PDF flow, choose a job Zeno has already searched and analysed.
        </p>
      </header>
      <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)]">
        <label className="block text-xs font-semibold text-[var(--zeno-ink-muted)]">
          Job description
          <textarea
            rows={10}
            disabled
            placeholder="Paste a job description here (matched-job flow is enabled for tailoring)."
            className="mt-2 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 py-2 text-sm opacity-70"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/app/cvs/matched"
            className="inline-flex h-9 items-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3.5 text-[13px] font-semibold text-white"
          >
            Choose from matched jobs
          </Link>
          <Link
            href="/app/matching"
            className="inline-flex h-9 items-center rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3.5 text-[13px] font-semibold"
          >
            Find jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
