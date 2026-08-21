"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type {
  InstantSearchSession,
  JobCampaignOverview,
  JobCampaignTile,
  JobSearchCampaign,
  RecentOpportunity,
} from "../domain/job-campaign";
import type { CampaignGrowthState } from "@/modules/career-growth/domain/schemas";
import { GrowthAssessmentPoller } from "@/modules/career-growth/presentation/growth-assessment-poller";

export type JobsOverviewProps = {
  overview: JobCampaignOverview;
  campaigns: JobSearchCampaign[];
  instantSearch: InstantSearchSession | null;
  recentOpportunities: RecentOpportunity[];
  growthByCampaignId?: Record<string, CampaignGrowthState>;
};

export function JobsOverview({
  overview,
  campaigns,
  instantSearch,
  recentOpportunities,
  growthByCampaignId = {},
}: JobsOverviewProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const mutate = async (campaignId: string, action: "run" | "pause" | "resume" | "archive") => {
    setBusyId(campaignId);
    setError(null);
    try {
      if (action === "run") {
        const response = await fetch(`/api/job-campaigns/${campaignId}/run`, {
          method: "POST",
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not run this campaign.");
      } else if (action === "archive") {
        const response = await fetch(`/api/job-campaigns/${campaignId}`, {
          method: "DELETE",
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not delete this campaign.");
      } else {
        const response = await fetch(`/api/job-campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: action === "pause" ? "paused" : "active",
          }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not update this campaign.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[1.85rem] sm:text-[2.35rem] leading-tight tracking-[-0.02em] text-[var(--zeno-ink)]">
          Jobs
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
          Find jobs now or let Zeno keep watch for the roles you care about.
        </p>
      </header>

      {error ? (
        <p className="rounded-[12px] border border-[var(--zeno-warning)] bg-[var(--zeno-warning-soft)] px-4 py-3 text-[13px] text-[var(--zeno-warning)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]">
          <h2 className="text-[16px] font-semibold text-[var(--zeno-ink)]">Instant Job Search</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
            Run a hybrid search now and rank the strongest available jobs against your verified profile.
          </p>
          {instantSearch ? (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-[var(--zeno-ink-muted)]">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
                  Last search
                </dt>
                <dd className="mt-0.5 text-[var(--zeno-ink)]">
                  {formatWhen(instantSearch.completedAt ?? instantSearch.startedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
                  Found / analysed
                </dt>
                <dd className="mt-0.5 text-[var(--zeno-ink)]">
                  {instantSearch.jobsFound} found · {instantSearch.analysedCount} analysed
                </dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/app/jobs/search"
              className="inline-flex h-9 items-center rounded-[8px] bg-[var(--zeno-primary)] px-3 text-[12px] font-semibold text-white"
            >
              Search jobs now
            </Link>
            {overview.instantSearch.hasResults ? (
              <Link
                href="/app/jobs/search"
                className="inline-flex h-9 items-center rounded-[8px] border border-[var(--zeno-border)] px-3 text-[12px] font-semibold text-[var(--zeno-ink)]"
              >
                View latest results
              </Link>
            ) : null}
          </div>
        </section>

        <section className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]">
          <h2 className="text-[16px] font-semibold text-[var(--zeno-ink)]">Job Campaigns</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
            Zeno checks for fresh matching jobs in the background and keeps each career target organised separately.
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
                Active
              </dt>
              <dd className="mt-0.5 font-semibold text-[var(--zeno-ink)]">{overview.campaigns.active}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
                Paused
              </dt>
              <dd className="mt-0.5 font-semibold text-[var(--zeno-ink)]">{overview.campaigns.paused}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
                New results
              </dt>
              <dd className="mt-0.5 font-semibold text-[var(--zeno-ink)]">{overview.campaigns.newResults}</dd>
            </div>
          </dl>
          <Link
            href="/app/jobs/campaigns/new"
            className="mt-4 inline-flex h-9 items-center rounded-[8px] border border-[var(--zeno-border)] px-3 text-[12px] font-semibold text-[var(--zeno-ink)]"
          >
            New campaign
          </Link>
        </section>
      </div>

      <section>
        <h2 className="text-[16px] font-semibold text-[var(--zeno-ink)]">Your campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="mt-3 rounded-[14px] border border-dashed border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-10 text-center">
            <p className="text-[14px] text-[var(--zeno-ink-muted)]">
              No job campaigns yet. Create one and Zeno will keep watching for matching roles.
            </p>
            <Link
              href="/app/jobs/campaigns/new"
              className="mt-4 inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white"
            >
              Create your first campaign
            </Link>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overview.tiles.map((tile) => {
              const campaign = campaigns.find((item) => item.id === tile.id);
              return (
                <li key={tile.id}>
                  <CampaignTile
                    tile={tile}
                    status={campaign?.status ?? "active"}
                    growth={growthByCampaignId[tile.id] ?? { kind: "none" }}
                    busy={busyId === tile.id}
                    confirmDelete={confirmId === tile.id}
                    onConfirmDelete={() => setConfirmId(tile.id)}
                    onCancelDelete={() => setConfirmId(null)}
                    onAction={(action) => {
                      if (action === "archive") {
                        void mutate(tile.id, "archive");
                        return;
                      }
                      void mutate(tile.id, action);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recentOpportunities.length > 0 ? (
        <section>
          <h2 className="text-[16px] font-semibold text-[var(--zeno-ink)]">Recent opportunities</h2>
          <ul className="mt-3 divide-y divide-[var(--zeno-border)] rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)]">
            {recentOpportunities.slice(0, 5).map((item) => (
              <li key={`${item.originLabel}-${item.listingId}`}>
                <Link href={item.href} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-[var(--zeno-violet-wash)]">
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--zeno-ink)]">{item.title}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--zeno-ink-muted)]">
                      {item.organizationName ?? "Unknown organisation"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--zeno-surface-sunken)] px-2.5 py-1 text-[11px] font-medium text-[var(--zeno-ink-muted)]">
                    {item.originLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CampaignTile(props: {
  tile: JobCampaignTile;
  status: "active" | "paused" | "archived";
  growth: CampaignGrowthState;
  busy: boolean;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onAction: (action: "run" | "pause" | "resume" | "archive") => void;
}) {
  const { tile } = props;
  return (
    <article className="relative rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 shadow-[var(--zeno-shadow-sm)]">
      <Link href={`/app/jobs/campaigns/${tile.id}`} className="block pr-10">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[var(--zeno-ink)]">{tile.name}</h3>
        </div>
        <p className="mt-1 text-[12px] text-[var(--zeno-ink-muted)]">
          {tile.primaryRole} · {tile.location} · {humanize(tile.workMode)}
        </p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
          {statusLabel(tile.status)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-[var(--zeno-ink-muted)]">
          <div>
            <dt>New jobs</dt>
            <dd className="font-semibold text-[var(--zeno-ink)]">{tile.newlyDiscovered}</dd>
          </div>
          <div>
            <dt>Qualifying</dt>
            <dd className="font-semibold text-[var(--zeno-ink)]">{tile.qualifyingMatches}</dd>
          </div>
          <div>
            <dt>LinkedIn</dt>
            <dd>{formatWhen(tile.lastLinkedInSearchAt)}</dd>
          </div>
          <div>
            <dt>Broad search</dt>
            <dd>{formatWhen(tile.lastBroadSearchAt)}</dd>
          </div>
        </dl>
        {tile.providerWarning ? (
          <p className="mt-3 text-[12px] text-amber-800">{tile.providerWarning}</p>
        ) : null}
      </Link>
      <GrowthChip state={props.growth} />
      <CampaignMenu
        status={props.status}
        busy={props.busy}
        confirmDelete={props.confirmDelete}
        campaignId={tile.id}
        onConfirmDelete={props.onConfirmDelete}
        onCancelDelete={props.onCancelDelete}
        onAction={props.onAction}
      />
    </article>
  );
}

function CampaignMenu(props: {
  campaignId: string;
  status: "active" | "paused" | "archived";
  busy: boolean;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onAction: (action: "run" | "pause" | "resume" | "archive") => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="absolute right-3 top-3">
      <button
        type="button"
        aria-label="Campaign actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={props.busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-8 items-center justify-center rounded-[8px] text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-violet-wash)] hover:text-[var(--zeno-ink)]"
      >
        ···
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-10 mt-1 w-44 rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] py-1 shadow-[var(--zeno-shadow-lg)]"
        >
          <Link
            role="menuitem"
            href={`/app/jobs/campaigns/${props.campaignId}/edit`}
            className="block px-3 py-2 text-[13px] text-[var(--zeno-ink)] hover:bg-[var(--zeno-violet-wash)]"
            onClick={() => setOpen(false)}
          >
            Edit campaign
          </Link>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-[13px] text-[var(--zeno-ink)] hover:bg-[var(--zeno-violet-wash)]"
            onClick={() => {
              setOpen(false);
              props.onAction("run");
            }}
          >
            Run now
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-[13px] text-[var(--zeno-ink)] hover:bg-[var(--zeno-violet-wash)]"
            onClick={() => {
              setOpen(false);
              props.onAction(props.status === "paused" ? "resume" : "pause");
            }}
          >
            {props.status === "paused" ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--zeno-danger-soft)]"
            style={{ color: "var(--zeno-danger)" }}
            onClick={() => {
              setOpen(false);
              props.onConfirmDelete();
            }}
          >
            Delete campaign
          </button>
        </div>
      ) : null}
      {props.confirmDelete ? (
        <div
          role="dialog"
          aria-labelledby={`${menuId}-confirm`}
          className="absolute right-0 z-20 mt-1 w-64 rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-3 shadow-[var(--zeno-shadow-lg)]"
        >
          <p id={`${menuId}-confirm`} className="text-[13px] text-[var(--zeno-ink)]">
            Monitoring will stop. Job listings, saved jobs, and application history stay in place.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[8px] bg-[var(--zeno-danger)] px-3 text-[12px] font-semibold text-white"
              onClick={() => props.onAction("archive")}
            >
              Delete campaign
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[8px] px-3 text-[12px] font-semibold text-[var(--zeno-ink-muted)]"
              onClick={props.onCancelDelete}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(status: JobCampaignTile["status"]) {
  if (status === "paused") return "Paused";
  if (status === "attention") return "Attention needed";
  return "Active";
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function formatWhen(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function GrowthChip(props: { state: CampaignGrowthState }) {
  const { state } = props;
  if (state.kind === "none") {
    return (
      <p className="px-4 pb-4 text-[12px] text-[var(--zeno-ink-faint)]">No current action</p>
    );
  }
  if (state.kind === "assessing") {
    return (
      <div className="px-4 pb-4">
        <Link
          href={state.href}
          className="text-[12px] font-semibold text-[var(--zeno-primary-deep)] hover:underline"
        >
          Assessing profile
        </Link>
        <GrowthAssessmentPoller requestId={state.requestId} compact />
      </div>
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
      className="block px-4 pb-4 text-[12px] font-semibold text-[var(--zeno-primary-deep)] hover:underline"
    >
      {label}
    </Link>
  );
}
