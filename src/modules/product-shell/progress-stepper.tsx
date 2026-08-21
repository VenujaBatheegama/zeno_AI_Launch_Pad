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
        className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--zeno-primary)] text-white shadow-[var(--zeno-shadow-sm)]"
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
        className="relative flex size-9 items-center justify-center rounded-[10px] bg-[var(--zeno-primary)] shadow-[var(--zeno-shadow-sm)]"
        aria-hidden
      >
        <span className="size-3.5 animate-pulse rounded-[4px] bg-[var(--zeno-surface)]" />
      </span>
    );
  }

  return (
    <span
      className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--zeno-surface-elevated)]"
      aria-hidden
    >
      <span className="size-3.5 rounded-[4px] bg-[var(--zeno-ink-faint)]" />
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
      className={`rounded-[18px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-5 shadow-[var(--zeno-shadow-sm)] sm:px-6 ${className ?? ""}`}
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
                <span
                  className={`absolute left-[calc(50%+1.15rem)] right-[calc(-50%+1.15rem)] top-[1.125rem] h-[3px] rounded-full ${
                    connectorComplete
                      ? "bg-[var(--zeno-primary)]"
                      : "bg-[color-mix(in_srgb,var(--zeno-ink)_12%,white)]"
                  }`}
                  aria-hidden
                />
              ) : null}
              <div className="relative z-[1]">
                <StepIcon status={status} />
              </div>
              <p
                className={`mt-3 text-[12px] font-semibold sm:text-[13px] ${
                  status === "pending"
                    ? "text-[var(--zeno-ink-faint)]"
                    : "text-[var(--zeno-ink)]"
                }`}
              >
                {step.title}
              </p>
              <p
                className={`mt-0.5 max-w-[9.5rem] text-[11px] leading-snug ${
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
      {typeof elapsedSec === "number" ? (
        <p className="mt-4 text-center text-xs text-[var(--zeno-ink-faint)]">
          Elapsed {elapsedSec}s
          {hint ? ` · ${hint}` : ""}
        </p>
      ) : null}
    </div>
  );
}
