"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { JobRecommendation } from "@/modules/career-campaign/domain/schemas";
import { RecommendationInbox } from "@/modules/career-campaign/presentation/recommendation-inbox";

import type { GrowthInboxItem } from "../domain/schemas";

type Filter = "all" | "jobs" | "growth";

export function UnifiedInbox(props: {
  growth: GrowthInboxItem[];
  jobRecommendations: JobRecommendation[];
  /** Map of campaign id → campaign name, for attribution badges. Empty map is safe. */
  campaignNames?: Map<string, string>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const growthVisible = filter !== "jobs";
  const jobsVisible = filter !== "growth";

  async function dismiss(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/growth/recommendations/${id}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not dismiss.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dismiss failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Inbox filters">
        {(["all", "jobs", "growth"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`h-9 rounded-full px-3 text-[13px] font-medium transition ${
              filter === value
                ? "border border-[var(--zeno-border-hover)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink)] shadow-[var(--zeno-shadow-sm)]"
                : "border border-[var(--zeno-border)] bg-[var(--zeno-surface)] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
            }`}
          >
            {value === "all" ? "All" : value === "jobs" ? "Jobs" : "Growth"}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-[13px] text-[var(--zeno-warning)]" role="alert">
          {error}
        </p>
      ) : null}
      {growthVisible && props.growth.length === 0 && !jobsVisible ? (
        <p className="text-[14px] text-[var(--zeno-ink-muted)]">
          No Growth recommendations yet. Create a job campaign and Zeno will review your profile.
        </p>
      ) : null}
      {growthVisible && props.growth.length > 0 ? (
        <ul className="space-y-3">
          {props.growth.map((item) => (
            <GrowthCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onDismiss={() => void dismiss(item.id)}
            />
          ))}
        </ul>
      ) : null}
      {jobsVisible ? (
        <RecommendationInbox recommendations={props.jobRecommendations} campaignNames={props.campaignNames ?? new Map()} />
      ) : null}
    </div>
  );
}

function GrowthCard(props: {
  item: GrowthInboxItem;
  busy: boolean;
  onDismiss: () => void;
}) {
  return (
    <li className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
        Growth recommendation
      </p>
      <h3 className="mt-1 text-[16px] font-semibold text-[var(--zeno-ink)]">
        Strengthen your {props.item.campaignName} campaign
      </h3>
      <p className="mt-1 text-[14px] font-medium text-[var(--zeno-ink)]">{props.item.title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
        {props.item.reason}
      </p>
      <p className="mt-2 text-[12px] text-[var(--zeno-ink-faint)]">
        {props.item.estimatedWeeks} week{props.item.estimatedWeeks === 1 ? "" : "s"} ·{" "}
        {props.item.estimatedHoursPerWeek} hours / week
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={props.item.href}
          className="inline-flex h-9 items-center rounded-[10px] bg-[var(--zeno-primary)] px-3 text-[13px] font-semibold text-white"
        >
          Open
        </Link>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onDismiss}
          className="inline-flex h-9 items-center rounded-[10px] border border-[var(--zeno-border)] px-3 text-[13px] font-semibold text-[var(--zeno-ink)] disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}
