"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type {
  GrowthAssessment,
  GrowthMessage,
  GrowthRecommendation,
} from "./recommendation-view-types";

export function GrowthRecommendationWorkspace(props: {
  recommendation: GrowthRecommendation;
  assessment: GrowthAssessment | null;
  campaignName: string;
  campaignId: string;
  messages: GrowthMessage[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const startId = useId();
  const hoursId = useId();
  const targetId = useId();
  const proposal = props.recommendation.currentProposal ?? props.recommendation;
  const [startDate, setStartDate] = useState(today());
  const [targetDate, setTargetDate] = useState(addDays(today(), proposal.estimatedWeeks * 7));
  const [weeklyHours, setWeeklyHours] = useState(proposal.estimatedHoursPerWeek);

  async function send() {
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/growth/recommendations/${props.recommendation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Message failed.");
      setMessage("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Message failed.");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/growth/recommendations/${props.recommendation.id}/dismiss`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Dismiss failed.");
      router.push("/app/recommendations");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dismiss failed.");
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/growth/recommendations/${props.recommendation.id}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, targetDate, weeklyHours }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        project?: { id: string };
      };
      if (!response.ok) throw new Error(body.error ?? "Could not start project.");
      router.push(`/app/growth/projects/${body.project?.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start project.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="space-y-4">
        <p className="text-[12px] text-[var(--zeno-ink-muted)]">
          <Link href="/app/growth" className="hover:underline">Growth</Link>
          <span className="mx-1.5 text-[var(--zeno-ink-faint)]">/</span>
          Recommendation
        </p>
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
            {props.campaignName}
          </p>
          <h1 className="mt-1 font-[family-name:var(--zeno-font-display)] text-[2rem] tracking-[-0.03em] text-[var(--zeno-ink)]">
            {proposal.title}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
            {proposal.summary}
          </p>
        </header>
        {error ? (
          <p className="rounded-[12px] border border-[var(--zeno-warning)] bg-[var(--zeno-warning-soft)] px-4 py-3 text-[13px] text-[var(--zeno-warning)]" role="alert">
            {error}
          </p>
        ) : null}
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">Why</dt>
            <dd className="mt-1 leading-relaxed text-[var(--zeno-ink)]">{proposal.rationale}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">Evidence gap</dt>
            <dd className="mt-1 leading-relaxed text-[var(--zeno-ink)]">{proposal.evidenceGap}</dd>
          </div>
        </dl>
        <div>
          <h2 className="text-[14px] font-semibold">Expected evidence</h2>
          <ul className="mt-2 list-disc pl-5 text-[13px] text-[var(--zeno-ink-muted)]">
            {proposal.expectedEvidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[14px] font-semibold">Proposed milestones</h2>
          <ol className="mt-2 space-y-2 text-[13px]">
            {proposal.proposedMilestones.map((item) => (
              <li key={item.title} className="rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 py-2">
                <p className="font-medium text-[var(--zeno-ink)]">{item.title}</p>
                <p className="text-[var(--zeno-ink-muted)]">{item.description}</p>
                <p className="mt-1 text-[12px] text-[var(--zeno-ink-faint)]">{item.estimatedHours} hours</p>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[12px] text-[var(--zeno-ink-faint)]">
          {proposal.estimatedWeeks} week{proposal.estimatedWeeks === 1 ? "" : "s"} at {proposal.estimatedHoursPerWeek} hours / week
          {proposal.marketEvidenceSummary ? ` · ${proposal.marketEvidenceSummary}` : " · Role-level recommendation from campaign criteria"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || props.recommendation.status === "accepted"}
            onClick={() => setAcceptOpen(true)}
            className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Start this project
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismiss()}
            className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold"
          >
            Dismiss
          </button>
          <Link href={`/app/jobs/campaigns/${props.campaignId}`} className="inline-flex h-10 items-center px-2 text-[13px] font-semibold text-[var(--zeno-ink-muted)]">
            View campaign
          </Link>
        </div>
      </section>

      <section className="flex min-h-[28rem] flex-col rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 shadow-[var(--zeno-shadow-sm)]">
        <h2 className="text-[14px] font-semibold">Talk with Zeno</h2>
        <p className="mt-1 text-[12px] text-[var(--zeno-ink-muted)]">
          Ask why this helps, make it smaller, switch technology, or improve existing work.
        </p>
        <ul className="mt-3 flex-1 space-y-3 overflow-y-auto">
          {props.messages.map((item) => (
            <li
              key={item.id}
              className={
                item.role === "user"
                  ? "ml-8 rounded-[12px] bg-[var(--zeno-violet-wash)] px-3 py-2 text-[13px]"
                  : "mr-8 rounded-[12px] bg-[var(--zeno-surface-sunken)] px-3 py-2 text-[13px]"
              }
            >
              {item.content}
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="growth-chat">
            Message
          </label>
          <input
            id="growth-chat"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Make it a two-week project"
            className="h-10 flex-1 rounded-[10px] border border-[var(--zeno-border)] px-3 text-[13px] outline-none focus:border-[var(--zeno-border-hover)]"
          />
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="h-10 rounded-[10px] bg-[var(--zeno-primary)] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>

      {acceptOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="accept-title"
            className="w-full max-w-md rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-lg)]"
          >
            <h2 id="accept-title" className="text-[16px] font-semibold">
              Start this project
            </h2>
            <p className="mt-1 text-[13px] text-[var(--zeno-ink-muted)]">
              {proposal.title}. Confirm the dates before Zeno starts tracking milestones.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-[13px] font-medium" htmlFor={startId}>
                Start date
                <input
                  id={startId}
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-[10px] border border-[var(--zeno-border)] px-3 text-[13px]"
                />
              </label>
              <label className="block text-[13px] font-medium" htmlFor={hoursId}>
                Hours each week
                <input
                  id={hoursId}
                  type="number"
                  min={1}
                  max={20}
                  value={weeklyHours}
                  onChange={(event) => setWeeklyHours(Number(event.target.value))}
                  className="mt-1 h-10 w-full rounded-[10px] border border-[var(--zeno-border)] px-3 text-[13px]"
                />
              </label>
              <label className="block text-[13px] font-medium" htmlFor={targetId}>
                Target date
                <input
                  id={targetId}
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-[10px] border border-[var(--zeno-border)] px-3 text-[13px]"
                />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void accept()}
                className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Start tracking
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center px-3 text-[13px] font-semibold text-[var(--zeno-ink-muted)]"
                onClick={() => setAcceptOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
