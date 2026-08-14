"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";

import type {
  JobSearchCampaign,
  JobSearchCampaignRun,
} from "../domain/job-campaign";
import type { CampaignGrowthState } from "@/modules/career-growth/domain/schemas";
import { GrowthAssessmentPoller } from "@/modules/career-growth/presentation/growth-assessment-poller";
import { JobsBreadcrumb } from "./jobs-breadcrumb";

type Props = {
  campaign: JobSearchCampaign;
  matches: RankedJobMatchCard[];
  jobs: DiscoveredJob[];
  runs: JobSearchCampaignRun[];
  providerWarning: string | null;
  growthState?: CampaignGrowthState;
};

export function JobCampaignDetail({
  campaign,
  matches,
  jobs,
  runs,
  providerWarning,
  growthState,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobsByListing = new Map(jobs.map((job) => [job.listing_id, job]));

  const act = async (action: "run" | "pause" | "resume") => {
    setBusy(action);
    setError(null);
    try {
      const response =
        action === "run"
          ? await fetch(`/api/job-campaigns/${campaign.id}/run`, { method: "POST" })
          : await fetch(`/api/job-campaigns/${campaign.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: action === "pause" ? "paused" : "active",
              }),
            });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not update campaign.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <JobsBreadcrumb
        items={[
          { href: "/app/jobs", label: "Jobs" },
          { label: campaign.name },
        ]}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--zeno-ink-faint)]">
            {campaign.status === "paused" ? "Paused" : "Active"}
          </p>
          <h1 className="mt-1 font-[family-name:var(--zeno-font-display)] text-[2rem] tracking-[-0.03em] text-[var(--zeno-ink)]">
            {campaign.name}
          </h1>
          <p className="mt-2 text-[14px] text-[var(--zeno-ink-muted)]">
            {campaign.primaryRole} · {campaign.location} · {campaign.workMode}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || campaign.status !== "active"}
            onClick={() => void act("run")}
            className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "run" ? "Running…" : "Run now"}
          </button>
          <Link
            href={`/app/jobs/campaigns/${campaign.id}/edit`}
            className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold text-[var(--zeno-ink)]"
          >
            Edit
          </Link>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void act(campaign.status === "paused" ? "resume" : "pause")}
            className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold text-[var(--zeno-ink)]"
          >
            {campaign.status === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900" role="alert">
          {error}
        </p>
      ) : null}
      {providerWarning ? (
        <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {providerWarning}
        </p>
      ) : null}
      <GrowthBanner state={growthState ?? { kind: "none" }} />

      <section className="grid gap-3 rounded-[14px] border border-[var(--zeno-border)] bg-white p-4 text-[13px] sm:grid-cols-2">
        <p>
          <span className="text-[var(--zeno-ink-faint)]">Last LinkedIn check</span>
          <br />
          {formatWhen(campaign.lastLinkedInSearchAt)}
        </p>
        <p>
          <span className="text-[var(--zeno-ink-faint)]">Next LinkedIn check</span>
          <br />
          {formatWhen(campaign.nextLinkedInSearchAt)}
        </p>
        <p>
          <span className="text-[var(--zeno-ink-faint)]">Last broad search</span>
          <br />
          {formatWhen(campaign.lastBroadSearchAt)}
        </p>
        <p>
          <span className="text-[var(--zeno-ink-faint)]">Next broad search</span>
          <br />
          {formatWhen(campaign.nextBroadSearchAt)}
        </p>
        <p>
          <span className="text-[var(--zeno-ink-faint)]">Minimum score</span>
          <br />
          {campaign.minimumScore}
        </p>
        <p>
          <span className="text-[var(--zeno-ink-faint)]">Criteria version</span>
          <br />
          {campaign.criteriaVersion}
        </p>
      </section>

      {runs.length > 0 ? (
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--zeno-ink)]">Recent runs</h2>
          <ul className="mt-2 space-y-2 text-[13px] text-[var(--zeno-ink-muted)]">
            {runs.slice(0, 5).map((run) => (
              <li key={run.id} className="rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 py-2">
                {run.origin.replaceAll("_", " ")} · {run.status} · {run.discovered} discovered ·{" "}
                {run.analysed} analysed · {run.qualifying} qualifying
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-[15px] font-semibold text-[var(--zeno-ink)]">Campaign results</h2>
        {matches.length === 0 ? (
          <p className="mt-3 rounded-[14px] border border-[var(--zeno-border)] bg-white px-4 py-8 text-center text-sm text-[var(--zeno-ink-muted)]">
            No analysed campaign results yet. Run now or wait for the next scheduled check.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {matches.map((match) => {
              const job = jobsByListing.get(match.listingId);
              const saved = match.userState === "saved";
              return (
                <li
                  key={match.listingId}
                  className="rounded-[14px] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-[var(--zeno-ink)]">
                        {match.title}
                        {match.organizationName ? ` | ${match.organizationName}` : ""}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--zeno-ink-muted)]">
                        {[job?.location, job?.work_mode, job?.published_at].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">
                      {Math.round(match.evidenceFitScore)}% match
                    </span>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed">{match.explanation}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {match.topMatched.slice(0, 4).map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-[var(--zeno-surface-sunken)] px-2.5 py-1 text-[11px] text-[var(--zeno-ink-muted)]"
                      >
                        {item}
                      </span>
                    ))}
                    {match.primaryGaps.slice(0, 2).map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800"
                      >
                        Gap: {item}
                      </span>
                    ))}
                    {!match.eligible ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800">
                        Constraint warning
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {match.applicationUrl ? (
                      <a
                        href={match.applicationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center rounded-[8px] border border-[var(--zeno-border)] px-3 text-[12px] font-semibold"
                      >
                        View job
                      </a>
                    ) : null}
                    <a
                      href={`/app/cvs/tailor/${match.listingId}`}
                      className="text-[12px] font-semibold text-[var(--zeno-primary)] hover:underline"
                    >
                      Tailor CV
                    </a>
                    <SaveJobButton listingId={match.listingId} saved={saved} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SaveJobButton(props: { listingId: string; saved: boolean }) {
  const [saved, setSaved] = useState(props.saved);
  const toggle = async () => {
    const next = saved ? "discovered" : "saved";
    const response = await fetch(`/api/jobs/${props.listingId}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: next }),
    });
    if (response.ok) setSaved(!saved);
  };
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className="ml-auto text-[12px] font-semibold text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
    >
      {saved ? "Saved" : "Save job"}
    </button>
  );
}

function formatWhen(value: string | null) {
  if (!value) return "Not scheduled yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled yet";
  return date.toLocaleString();
}

function GrowthBanner(props: { state: CampaignGrowthState }) {
  const { state } = props;
  if (state.kind === "assessing") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--zeno-border)] bg-white px-4 py-3 text-[13px]">
        <p className="text-[var(--zeno-ink-muted)]">Zeno is reviewing your profile…</p>
        <GrowthAssessmentPoller requestId={state.requestId} compact />
      </div>
    );
  }
  if (state.kind === "none") {
    return (
      <p className="rounded-[12px] border border-[var(--zeno-border)] bg-white px-4 py-3 text-[13px] text-[var(--zeno-ink-faint)]">
        No current Growth action
      </p>
    );
  }
  const label =
    state.kind === "recommendation_ready"
      ? "Growth recommendation ready"
      : state.count === 1
        ? "1 project in progress"
        : `${state.count} projects in progress`;
  return (
    <Link
      href={state.href}
      className="block rounded-[12px] border border-[var(--zeno-border)] bg-white px-4 py-3 text-[13px] font-semibold text-[var(--zeno-primary-deep)] hover:underline"
    >
      {label}
    </Link>
  );
}
