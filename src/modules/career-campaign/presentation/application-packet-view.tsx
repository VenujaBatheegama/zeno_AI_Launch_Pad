"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
        <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em]">
          Application packet
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Status: {props.packet.status}
          {props.packet.failureMessage
            ? ` — ${props.packet.failureMessage}`
            : ""}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Why this job</h2>
        <p className="mt-2 text-sm leading-6">
          {fit?.explanation ?? "Fit explanation unavailable."}
        </p>
        {fit?.primaryGaps?.length ? (
          <p className="mt-3 text-sm text-amber-800">
            Missing requirements: {fit.primaryGaps.join("; ")}
          </p>
        ) : null}
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Tailored CV</h2>
        {props.cvHref ? (
          <Link
            href={props.cvHref}
            className="mt-2 inline-flex text-sm font-semibold text-[var(--zeno-primary)]"
          >
            Open editable CV
          </Link>
        ) : (
          <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
            CV not ready yet.
          </p>
        )}
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Cover letter draft</h2>
        <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--zeno-ink)]">
          {props.packet.coverLetterDraft ?? "No draft yet."}
        </pre>
      </section>

      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Apply externally</h2>
        {props.packet.applicationUrl ? (
          <a
            href={props.packet.applicationUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-sm font-semibold text-[var(--zeno-primary)]"
          >
            Open application link
          </a>
        ) : (
          <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
            No application URL captured for this listing.
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--zeno-ink-faint)]">
          Zeno does not submit applications for you. After you apply on the
          employer site, mark it applied here.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
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
                Preparing packet…
              </>
            ) : (
              "Prepare / retry packet"
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
                className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-ink)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Confirm I applied
              </button>
              <button
                type="button"
                onClick={() => setConfirmApply(false)}
                className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmApply(true)}
              className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Mark as applied
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
