"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { isTerminalApplicationStatus } from "../domain/application-transitions";
import type {
  ApplicationStatus,
  JobApplication,
  JobApplicationEvent,
} from "../domain/schemas";

const NEXT: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  applied: ["interview", "rejected", "offer", "withdrawn"],
  interview: ["rejected", "offer", "withdrawn"],
  ready: ["withdrawn"],
};

export function ApplicationDetail(props: {
  application: JobApplication;
  events: JobApplicationEvent[];
  title: string | null;
  company: string | null;
  cvHref: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextStatuses = NEXT[props.application.status] ?? [];

  async function updateStatus(status: ApplicationStatus) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${props.application.id}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Update failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em]">
            {props.title ?? "Application"}
          </h1>
          {isTerminalApplicationStatus(props.application.status) ? (
            <span className="rounded-full bg-[var(--zeno-surface)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-muted)]">
              Closed ({props.application.status})
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          {[props.company, props.application.status].filter(Boolean).join(" · ")}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-[var(--zeno-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--zeno-ink-faint)]">Applied</dt>
          <dd>{props.application.appliedAt?.slice(0, 10) ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--zeno-ink-faint)]">
            {isTerminalApplicationStatus(props.application.status)
              ? "Outcome recorded"
              : "Follow-up due"}
          </dt>
          <dd>
            {isTerminalApplicationStatus(props.application.status)
              ? props.application.outcomeAt?.slice(0, 10) ?? "—"
              : props.application.followUpDueAt?.slice(0, 10) ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--zeno-ink-faint)]">CV variant</dt>
          <dd>
            {props.cvHref ? (
              <a href={props.cvHref} className="font-semibold text-[var(--zeno-primary)]">
                Open CV
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {isTerminalApplicationStatus(props.application.status) ? (
        <p className="text-xs text-[var(--zeno-ink-faint)]">
          Outcomes are logged and will be factored into future match scoring.
        </p>
      ) : null}

      {nextStatuses.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy}
              onClick={() => void updateStatus(status)}
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm font-semibold capitalize"
            >
              Mark {status}
            </button>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className="text-base font-semibold">Event history</h2>
        <ul className="mt-2 space-y-2 text-sm text-[var(--zeno-ink-muted)]">
          {props.events.length === 0 ? (
            <li>No events yet.</li>
          ) : (
            props.events.map((event) => (
              <li key={event.id}>
                {event.occurredAt.slice(0, 19).replace("T", " ")} ·{" "}
                {event.fromStatus ?? "—"} → {event.toStatus} ({event.source})
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
