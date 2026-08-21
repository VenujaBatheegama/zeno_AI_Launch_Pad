"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CareerSprint } from "../domain/schemas";

export function SprintCard({ sprint }: { sprint: CareerSprint }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string>();
  const [evidenceUrl, setEvidenceUrl] = useState(sprint.evidenceUrl ?? "");
  const [evidenceNote, setEvidenceNote] = useState(sprint.evidenceNote ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const done = sprint.milestones.filter((item) => item.completed).length;
  const canSubmit = done === sprint.milestones.length && sprint.status === "active";

  async function toggleMilestone(milestoneId: string, completed: boolean) {
    setPendingId(milestoneId);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/career-friend/sprints/${sprint.id}/milestones/${milestoneId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Milestone could not be updated.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Milestone could not be updated.");
    } finally {
      setPendingId(undefined);
    }
  }

  async function submitEvidence(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/career-friend/sprints/${sprint.id}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evidenceUrl: evidenceUrl.trim() || undefined,
          evidenceNote: evidenceNote.trim() || undefined,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Evidence could not be submitted.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--zeno-violet-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--zeno-primary-deep)]">
              {sprint.gapType} gap
            </span>
            <span className="text-xs text-[var(--zeno-ink-faint)]">{sprint.estimatedHours}h estimate</span>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[var(--zeno-ink)]">{sprint.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--zeno-ink-muted)]">{sprint.objective}</p>
        </div>
        <span className="rounded-full border border-[var(--zeno-border)] px-3 py-1 text-xs font-medium capitalize text-[var(--zeno-ink-muted)]">
          {sprint.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-5 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-violet-wash)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--zeno-primary-deep)]">Why now</p>
        <p className="mt-1 text-sm leading-6 text-[var(--zeno-ink)]">{sprint.whyNow}</p>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sprint milestones</h3>
          <span className="text-xs text-[var(--zeno-ink-muted)]">{done}/{sprint.milestones.length}</span>
        </div>
        <div className="mt-3 space-y-2">
          {sprint.milestones.map((milestone) => (
            <label key={milestone.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--zeno-border)] p-3 text-sm">
              <input
                type="checkbox"
                checked={milestone.completed}
                disabled={pendingId === milestone.id || sprint.status !== "active"}
                onChange={(event) => toggleMilestone(milestone.id, event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--zeno-primary)]"
              />
              <span className={milestone.completed ? "text-[var(--zeno-ink-faint)] line-through" : "text-[var(--zeno-ink)]"}>
                {milestone.title}
              </span>
            </label>
          ))}
        </div>
      </div>

      {sprint.status === "evidence_submitted" ? (
        <div className="mt-5 rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-success)] bg-[var(--zeno-success-soft)] p-4">
          <p className="text-sm font-semibold text-emerald-950">Evidence submitted for your review</p>
          <p className="mt-1 text-sm text-[var(--zeno-success)]">
            Zeno has not added this to your verified profile automatically. Review it, then update your career profile when the claim is accurate.
          </p>
          <Link href="/app/career-profile" className="mt-3 inline-flex text-sm font-semibold text-[var(--zeno-success)] underline">
            Review career profile
          </Link>
        </div>
      ) : (
        <form onSubmit={submitEvidence} className="mt-5 border-t border-[var(--zeno-border)] pt-5">
          <h3 className="text-sm font-semibold">Submit real evidence</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--zeno-ink-muted)]">
            Complete the milestones, then add a repository, portfolio, post, certificate, or a concise result note. Submission never edits your verified profile automatically.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder="https://github.com/…"
              disabled={!canSubmit || submitting}
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm disabled:bg-[var(--zeno-surface-sunken)]"
            />
            <input
              value={evidenceNote}
              onChange={(event) => setEvidenceNote(event.target.value)}
              placeholder="What did you build or demonstrate?"
              maxLength={2000}
              disabled={!canSubmit || submitting}
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm disabled:bg-[var(--zeno-surface-sunken)]"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit || submitting || (!evidenceUrl.trim() && !evidenceNote.trim())}
            className="mt-3 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit evidence"}
          </button>
        </form>
      )}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </article>
  );
}
