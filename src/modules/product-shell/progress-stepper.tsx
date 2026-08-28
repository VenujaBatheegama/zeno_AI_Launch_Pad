type StepStatus = "complete" | "active" | "pending";

export type ProgressStep = {
  id: string;
  title: string;
  description: string;
};

type Props = {
  steps: ProgressStep[];
  /** Zero-based index of the current active step. */
  activeIndex: number;
  /** Optional elapsed seconds shown under the stepper. */
  elapsedSec?: number;
  /** Extra hint under the elapsed line. */
  hint?: string | null;
  className?: string;
};

function statusFor(index: number, activeIndex: number): StepStatus {
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "active";
  return "pending";
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return (
      <span
        className="flex size-9 items-center justify-center rounded-full bg-[var(--zeno-primary)] text-white shadow-[var(--zeno-shadow-sm)] transition-all duration-500 transform scale-100"
        aria-hidden
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.2 6.4 11l6.1-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (status === "active") {
    return (
      <span
        className="relative flex size-9 items-center justify-center rounded-full bg-[var(--zeno-primary)] shadow-[0_0_12px_rgba(242,121,60,0.4)] ring-4 ring-[var(--zeno-primary)]/25 transition-all duration-500 scale-105"
        aria-hidden
      >
        <span className="size-3.5 animate-pulse rounded-full bg-[var(--zeno-surface)]" />
      </span>
    );
  }

  return (
    <span
      className="flex size-9 items-center justify-center rounded-full bg-[var(--zeno-surface-elevated)] border border-[var(--zeno-border)] transition-all duration-500"
      aria-hidden
    >
      <span className="size-3 rounded-full bg-[var(--zeno-ink-faint)]/60" />
    </span>
  );
}

/**
 * Horizontal multi-step progress visual for long-running jobs/CV work.
 */
export function ProgressStepper({
  steps,
  activeIndex,
  elapsedSec,
  hint,
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(activeIndex, steps.length - 1));

  return (
    <div
      className={`rounded-[18px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-5 shadow-[var(--zeno-shadow-sm)] sm:px-6 transition-all duration-300 ${className ?? ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Progress: ${steps[clamped]?.title ?? "Working"}`}
    >
      <ol className="flex w-full items-start justify-between gap-1">
        {steps.map((step, index) => {
          const status = statusFor(index, clamped);
          const connectorComplete = index < clamped;
          return (
            <li
              key={step.id}
              className="relative flex min-w-0 flex-1 flex-col items-center text-center"
            >
              {index < steps.length - 1 ? (
                <div
                  className="absolute left-[calc(50%+1.15rem)] right-[calc(-50%+1.15rem)] top-[1.125rem] h-[3px] overflow-hidden rounded-full bg-[var(--zeno-border)]"
                  aria-hidden
                >
                  <div
                    className={`h-full w-full bg-[var(--zeno-primary)] transition-transform duration-700 ease-out origin-left ${
                      connectorComplete ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </div>
              ) : null}
              <div className="relative z-[1]">
                <StepIcon status={status} />
              </div>
              <p
                className={`mt-3 text-[12px] font-semibold sm:text-[13px] transition-colors duration-300 ${
                  status === "pending"
                    ? "text-[var(--zeno-ink-faint)]"
                    : status === "active"
                      ? "text-[var(--zeno-primary-deep)]"
                      : "text-[var(--zeno-ink)]"
                }`}
              >
                {step.title}
              </p>
              <p
                className={`mt-0.5 max-w-[9.5rem] text-[11px] leading-snug transition-colors duration-300 ${
                  status === "active"
                    ? "text-[var(--zeno-ink-muted)]"
                    : "text-[var(--zeno-ink-faint)]"
                }`}
              >
                {step.description}
              </p>
            </li>
          );
        })}
      </ol>
      {typeof elapsedSec === "number" || hint ? (
        <div className="mt-4 text-center text-xs text-[var(--zeno-ink-faint)] flex items-center justify-center gap-2">
          {typeof elapsedSec === "number" ? (
            <span className="tabular-nums font-medium text-[var(--zeno-ink-muted)]">
              {elapsedSec}s
            </span>
          ) : null}
          {typeof elapsedSec === "number" && hint ? (
            <span>•</span>
          ) : null}
          {hint ? (
            <span className="text-[var(--zeno-ink-muted)] transition-opacity duration-300 animate-in fade-in">
              {hint}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
