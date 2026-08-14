"use client";

import { useMemo, useState } from "react";

import type { FreshJobWatchStatusView } from "@/modules/career-campaign/domain/fresh-watch";

type Props = {
  initialStatus: FreshJobWatchStatusView;
  defaultRole: string;
  defaultLocation: string;
  defaultWorkMode: "onsite" | "hybrid" | "remote" | "any";
};

export function FreshJobWatchPanel({
  initialStatus,
  defaultRole,
  defaultLocation,
  defaultWorkMode,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [primaryRole, setPrimaryRole] = useState(
    initialStatus.primaryRole || defaultRole,
  );
  const [location, setLocation] = useState(
    initialStatus.location ||
      defaultLocation ||
      (defaultWorkMode === "remote" || defaultWorkMode === "any"
        ? "Remote"
        : ""),
  );
  const [workMode, setWorkMode] = useState(initialStatus.workMode ?? defaultWorkMode);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headline = useMemo(() => {
    if (status.status === "paused") return "Paused";
    if (status.enabled) return "Active";
    return "Off";
  }, [status]);

  const save = async (action: "enable" | "pause") => {
    const role = primaryRole.trim();
    const place =
      location.trim() ||
      (workMode === "remote" || workMode === "any" ? "Remote" : "");
    if (action !== "pause" && (!role || !place)) {
      setError("Enter a primary role and location, then enable Fresh Job Watch.");
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/fresh-job-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "pause"
            ? { action: "pause" }
            : {
                action: "enable",
                primaryRole: role,
                location: place,
                workMode,
              },
        ),
      });
      const payload = (await response.json()) as {
        error?: string;
        watch?: FreshJobWatchStatusView & { status?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update Fresh Job Watch.");
      }
      const next = await fetch("/api/fresh-job-watch");
      const body = (await next.json()) as { watch: FreshJobWatchStatusView };
      setStatus(body.watch);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--zeno-ink-muted)]">
            Fresh Job Watch
          </p>
          <h2 className="mt-1 font-[family-name:var(--zeno-font-display)] text-[1.35rem] text-[var(--zeno-ink)]">
            {headline}
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
            Zeno searches broadly twice daily and checks LinkedIn approximately
            every 15 minutes for newly listed jobs matching your primary role.
          </p>
        </div>
        <button
          type="button"
          onClick={() => save(status.enabled ? "pause" : "enable")}
          disabled={busy !== null}
          className="inline-flex h-10 cursor-pointer items-center rounded-[10px] border border-[var(--zeno-border)] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white shadow-[var(--zeno-shadow-sm)] hover:bg-[var(--zeno-primary-deep)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "enable"
            ? "Enabling…"
            : busy === "pause"
              ? "Pausing…"
              : status.enabled
                ? "Pause"
                : "Enable Fresh Job Watch"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block text-[12px] text-[var(--zeno-ink-muted)]">
          Primary role
          <input
            value={primaryRole}
            onChange={(event) => setPrimaryRole(event.target.value)}
            placeholder="e.g. Backend Developer"
            className="mt-1 h-10 w-full rounded-[10px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] text-[var(--zeno-ink)]"
          />
        </label>
        <label className="block text-[12px] text-[var(--zeno-ink-muted)]">
          Location
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="e.g. Sri Lanka or Remote"
            className="mt-1 h-10 w-full rounded-[10px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] text-[var(--zeno-ink)]"
          />
        </label>
        <label className="block text-[12px] text-[var(--zeno-ink-muted)]">
          Work mode
          <select
            value={workMode}
            onChange={(event) => {
              const next = event.target.value as typeof workMode;
              setWorkMode(next);
              if (
                !location.trim() &&
                (next === "remote" || next === "any")
              ) {
                setLocation("Remote");
              }
            }}
            className="mt-1 h-10 w-full rounded-[10px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] text-[var(--zeno-ink)]"
          >
            <option value="any">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
      </div>

      {status.enabled || status.status === "paused" ? (
        <dl className="mt-4 grid gap-2 text-[12px] text-[var(--zeno-ink-muted)] sm:grid-cols-2">
          <div>
            <dt>Last LinkedIn check</dt>
            <dd className="text-[var(--zeno-ink)]">
              {formatStamp(status.lastLinkedInCheckAt)}
            </dd>
          </div>
          <div>
            <dt>Next expected LinkedIn check</dt>
            <dd className="text-[var(--zeno-ink)]">
              {formatStamp(status.nextLinkedInCheckAt)}
            </dd>
          </div>
          <div>
            <dt>Last successful broad search</dt>
            <dd className="text-[var(--zeno-ink)]">
              {formatStamp(status.lastBroadSearchAt)}
            </dd>
          </div>
          <div>
            <dt>Next expected broad search</dt>
            <dd className="text-[var(--zeno-ink)]">
              {formatStamp(status.nextBroadSearchAt)}
            </dd>
          </div>
          <div>
            <dt>Most recent discovery</dt>
            <dd className="text-[var(--zeno-ink)]">
              {formatStamp(status.lastDiscoveryAt)}
            </dd>
          </div>
        </dl>
      ) : null}

      {status.providerWarning ? (
        <p className="mt-3 rounded-[10px] bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
          {status.providerWarning}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-[10px] bg-rose-50 px-3 py-2 text-[13px] text-rose-900">
          {error}
        </p>
      ) : null}

      <p className="mt-4 text-[12px] text-[var(--zeno-ink-muted)]">
        Find new jobs stays a one-time search.{" "}
        <a className="underline" href={status.recommendationsHref}>
          Open recent recommendations
        </a>
        . Zeno checks approximately every 15 minutes and cannot guarantee
        discovery time.
      </p>
    </section>
  );
}

function formatStamp(value: string | null): string {
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
