"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DecisionReason, JobRecommendation } from "../domain/schemas";

const REJECTION_REASONS: Array<{ value: DecisionReason; label: string }> = [
  { value: "wrong_technology", label: "Wrong technology" },
  { value: "wrong_role", label: "Wrong role" },
  { value: "wrong_seniority", label: "Wrong seniority" },
  { value: "location", label: "Location" },
  { value: "work_mode", label: "Work mode" },
  { value: "salary", label: "Salary" },
  { value: "company", label: "Company" },
  { value: "poor_match", label: "Poor match" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
];

export function RecommendationInbox(props: {
  recommendations: JobRecommendation[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState<DecisionReason>("not_interested");
  const [error, setError] = useState<string | null>(null);

  async function decide(
    id: string,
    action: "save" | "accept" | "reject",
    decisionReason?: DecisionReason,
  ) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/recommendations/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          decisionReason,
          prepare: action === "accept",
        }),
      });
      const json = (await response.json()) as {
        error?: string;
        packet?: { id: string };
      };
      if (!response.ok) {
        setError(json.error ?? "Decision failed");
        return;
      }
      if (action === "accept" && json.packet?.id) {
        router.push(`/app/packets/${json.packet.id}`);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
      setRejectId(null);
    }
  }

  if (props.recommendations.length === 0) {
    return (
      <p className="text-sm text-[var(--zeno-ink-muted)]">
        No recommendations yet. Run Zeno to check for matching jobs.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {props.recommendations.map((rec) => {
        const fit = rec.fitSummarySnapshot;
        const score = rec.scoreSnapshot;
        return (
          <article
            key={rec.id}
            className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--zeno-ink)]">
                  {fit.title ?? "Job recommendation"}
                </h3>
                <p className="text-sm text-[var(--zeno-ink-muted)]">
                  {[fit.organizationName, fit.location, fit.workMode]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="text-sm font-medium text-[var(--zeno-primary-deep)]">
                Evidence fit {score.evidenceFitScore}%
                {score.careerLevel ? ` · ${score.careerLevel}` : ""}
              </p>
            </div>

            <p className="mt-3 text-sm leading-6 text-[var(--zeno-ink)]">
              {fit.explanation || "No explanation snapshot."}
            </p>

            {fit.topMatched.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
                  Supported strengths
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm text-[var(--zeno-ink-muted)]">
                  {[...new Set(fit.topMatched)].map((item, index) => (
                    <li key={`${rec.id}-matched-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {fit.primaryGaps.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
                  Missing / unsupported
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm text-[var(--zeno-ink-muted)]">
                  {[...new Set(fit.primaryGaps)].map((item, index) => (
                    <li key={`${rec.id}-gap-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-3 text-xs text-[var(--zeno-ink-faint)]">
              Status: {rec.status}
            </p>

            {rec.status === "pending_review" || rec.status === "saved" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === rec.id}
                  onClick={() => void decide(rec.id, "save")}
                  className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm font-semibold"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={busyId === rec.id}
                  onClick={() => void decide(rec.id, "accept")}
                  className="inline-flex items-center gap-2 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3 py-2 text-sm font-semibold text-white"
                >
                  {busyId === rec.id ? (
                    <>
                      <span
                        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
                        aria-hidden
                      />
                      Working…
                    </>
                  ) : (
                    "Accept"
                  )}
                </button>
                <button
                  type="button"
                  disabled={busyId === rec.id}
                  onClick={() => setRejectId(rec.id)}
                  className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm font-semibold"
                >
                  Reject
                </button>
              </div>
            ) : null}

            {rejectId === rec.id ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  Reason
                  <select
                    className="ml-2 rounded border border-[var(--zeno-border)] px-2 py-1"
                    value={reason}
                    onChange={(event) =>
                      setReason(event.target.value as DecisionReason)
                    }
                  >
                    {REJECTION_REASONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busyId === rec.id}
                  onClick={() => void decide(rec.id, "reject", reason)}
                  className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-ink)] px-3 py-2 text-sm font-semibold text-white"
                >
                  Confirm reject
                </button>
              </div>
            ) : null}

            {rec.status === "accepted" ? (
              <Link
                href={`/app/recommendations`}
                className="mt-3 inline-flex text-sm font-semibold text-[var(--zeno-primary)]"
              >
                Open related packet from Applications when ready
              </Link>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
