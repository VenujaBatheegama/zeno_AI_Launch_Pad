"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Rocket } from "lucide-react";

import type { ApplicationPacket, JobRecommendation } from "../domain/schemas";

export function ApplicationPacketView(props: {
  packet: ApplicationPacket;
  recommendation: JobRecommendation | null;
  cvHref: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  const fit = props.recommendation?.fitSummarySnapshot;

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/application-packets/${props.packet.id}/prepare`,
        { method: "POST" },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Preparation failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function markApplied() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/application-packets/${props.packet.id}/mark-applied`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const json = (await response.json()) as {
        error?: string;
        application?: { id: string };
      };
      if (!response.ok) {
        setError(json.error ?? "Could not mark applied");
        return;
      }
      router.push(
        json.application?.id
          ? `/app/applications/${json.application.id}`
          : "/app/applications",
      );
      router.refresh();
    } finally {
      setBusy(false);
      setConfirmApply(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--zeno-primary-deep)]">
          <Rocket className="h-4 w-4" />
          <span>Ready-to-Apply Kit</span>
        </div>
        <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em] text-[var(--zeno-ink)] mt-1">
          {fit?.title ?? "Application Kit"}
          {fit?.organizationName ? ` at ${fit.organizationName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Status: {props.packet.status === "ready" ? "Ready to Submit" : props.packet.status}
          {props.packet.failureMessage
            ? ` — ${props.packet.failureMessage}`
            : ""}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-[var(--zeno-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
        <h2 className="text-base font-semibold">Why this job & Key Talking Points</h2>
        <p className="mt-2 text-sm leading-6">
          {fit?.explanation ?? "Fit explanation unavailable."}
        </p>
        {fit?.primaryGaps?.length ? (
          <p className="mt-3 text-sm text-[var(--zeno-warning)]">
            Missing requirements: {fit.primaryGaps.join("; ")}
          </p>
        ) : null}
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
        <h2 className="text-base font-semibold">1. Tailored CV</h2>
        {props.cvHref ? (
          <div className="mt-2">
            <Link
              href={props.cvHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--zeno-primary)] hover:underline"
            >
              <span>Open & Edit Tailored CV ↗</span>
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
            CV not ready yet.
          </p>
        )}
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
        <h2 className="text-base font-semibold">2. Custom Cover Letter Draft</h2>
        <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--zeno-ink)] font-sans">
          {props.packet.coverLetterDraft ?? "No draft yet."}
        </pre>
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
        <h2 className="text-base font-semibold">3. Apply Externally</h2>
        {props.packet.applicationUrl ? (
          <div className="mt-2">
            <a
              href={props.packet.applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--zeno-primary-deep)] transition"
            >
              <span>Open Employer Portal & Apply ↗</span>
            </a>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
            No external application URL captured for this listing.
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--zeno-ink-faint)]">
          Zeno prepares your kit for you to submit. After you apply on the employer portal, click "Confirm I Applied" below to track it in your active pipeline.
        </p>
      </section>

      <div className="flex flex-wrap gap-3 pt-2">
        {props.packet.status === "failed" ||
        props.packet.status === "requested" ||
        props.packet.status === "preparing" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void prepare()}
            className="inline-flex items-center gap-2 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? (
              <>
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
                Preparing Application Kit…
              </>
            ) : (
              "Prepare / Retry Application Kit"
            )}
          </button>
        ) : null}

        {props.packet.status === "ready" ? (
          confirmApply ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void markApplied()}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition shadow-sm"
              >
                Confirm I Applied (Move to Pipeline)
              </button>
              <button
                type="button"
                onClick={() => setConfirmApply(false)}
                className="rounded-xl border border-[var(--zeno-border)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--zeno-surface-elevated)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmApply(true)}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition"
            >
              ✓ Mark as Applied
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

