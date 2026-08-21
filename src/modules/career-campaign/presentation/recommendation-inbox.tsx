"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CompanyMark } from "@/modules/product-shell/ui/company-mark";
import { MatchScoreBadge } from "@/modules/product-shell/ui/match-score-badge";

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
  /** Map of campaign id → campaign name for attribution. Empty map is safe — no badge rendered. */
  campaignNames: Map<string, string>;
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
      <div className="rounded-[var(--zeno-radius-md)] border border-dashed border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-6 py-10 text-center">
        <span
          className="zeno-live-dot mx-auto inline-block size-2.5 rounded-full"
          style={{ backgroundColor: "var(--zeno-primary)" }}
          aria-hidden
        />
        <p className="mt-3 text-sm font-medium text-[var(--zeno-ink)]">
          No job recommendations yet
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--zeno-ink-muted)]">
          Your active campaigns are checking for matches in the background —
          strong ones will land here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm" role="alert" style={{ color: "var(--zeno-danger)" }}>
          {error}
        </p>
      ) : null}
      {props.recommendations.map((rec) => {
        const fit = rec.fitSummarySnapshot;
        const score = rec.scoreSnapshot;
        return (
          <article
            key={rec.id}
            className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <CompanyMark name={fit.organizationName ?? fit.title ?? "?"} size="md" />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[var(--zeno-ink)]">
                    {fit.title ?? "Job recommendation"}
                  </h3>
                  <p className="text-sm text-[var(--zeno-ink-muted)]">
                    {[fit.organizationName, fit.location, fit.workMode]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(() => {
                    const campaignName = rec.jobSearchCampaignId
                      ? props.campaignNames.get(rec.jobSearchCampaignId)
                      : undefined;
                    return campaignName ? (
                      <span className="mt-1 inline-block rounded-full border border-[var(--zeno-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--zeno-ink-faint)]">
                        via {campaignName}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              <MatchScoreBadge score={score.evidenceFitScore} detail={score.careerLevel ?? undefined} />
            </div>

            <p className="mt-3 text-sm leading-6 text-[var(--zeno-ink)]">
              {fit.explanation || "No explanation snapshot."}
            </p>

            {fit.topMatched.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
                  Supported strengths
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {[...new Set(fit.topMatched)].map((item, index) => (
                    <li
                      key={`${rec.id}-matched-${index}`}
                      className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                      style={{ backgroundColor: "var(--zeno-success-soft)", color: "var(--zeno-success)" }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {fit.primaryGaps.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
                  Missing / unsupported
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {[...new Set(fit.primaryGaps)].map((item, index) => (
                    <li
                      key={`${rec.id}-gap-${index}`}
                      className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                      style={{ backgroundColor: "var(--zeno-danger-soft)", color: "var(--zeno-danger)" }}
                    >
                      {item}
                    </li>
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
                  className="flex-1 sm:flex-none min-h-[42px] rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 py-2 text-sm font-semibold text-[var(--zeno-ink)] transition hover:border-[var(--zeno-border-hover)] disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={busyId === rec.id}
                  onClick={() => void decide(rec.id, "accept")}
                  className="flex-1 sm:flex-none min-h-[42px] inline-flex items-center justify-center gap-2 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === rec.id ? (
                    <>
                      <span
                        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
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
                  className="flex-1 sm:flex-none min-h-[42px] rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 py-2 text-sm font-semibold text-[var(--zeno-ink-muted)] transition hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)] disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            ) : null}

            {rejectId === rec.id ? (
              <div className="mt-3 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 rounded-lg border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3">
                <label className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-[var(--zeno-ink-muted)] flex-1">
                  <span>Reason:</span>
                  <select
                    className="h-10 flex-1 rounded border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-3 text-sm text-[var(--zeno-ink)] outline-none"
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === rec.id}
                    onClick={() => void decide(rec.id, "reject", reason)}
                    className="flex-1 sm:flex-none min-h-[40px] rounded bg-[var(--zeno-danger)] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Confirm reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectId(null)}
                    className="flex-1 sm:flex-none min-h-[40px] rounded border border-[var(--zeno-border)] px-3 py-2 text-xs text-[var(--zeno-ink-muted)]"
                  >
                    Cancel
                  </button>
                </div>
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
