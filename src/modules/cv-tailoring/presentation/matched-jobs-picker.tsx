"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";

import {
  buildMatchedJobRows,
  type MatchedJobRow,
} from "./build-matched-job-rows";

type Props = {
  initialListingId?: string;
};

/**
 * Choose from the authenticated user's stored discovered/matched jobs.
 * Does not call external job providers.
 */
export function MatchedJobsPicker({ initialListingId }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<MatchedJobRow[]>([]);
  const [selected, setSelected] = useState<string | undefined>(initialListingId);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, matchesRes] = await Promise.all([
        fetch("/api/jobs", { credentials: "same-origin" }),
        fetch("/api/career-intelligence/matches", {
          credentials: "same-origin",
        }),
      ]);
      const jobsBody = (await jobsRes.json()) as
        | DiscoveredJob[]
        | { error?: string };
      if (!jobsRes.ok) {
        throw new Error(
          !Array.isArray(jobsBody) && jobsBody.error
            ? jobsBody.error
            : "Could not load discovered jobs.",
        );
      }
      const jobs = Array.isArray(jobsBody) ? jobsBody : [];
      let matches: RankedJobMatchCard[] = [];
      if (matchesRes.ok) {
        matches = (await matchesRes.json()) as RankedJobMatchCard[];
      }
      const nextRows = buildMatchedJobRows(jobs, matches);
      setRows(nextRows);
      if (
        initialListingId &&
        nextRows.some((row) => row.listingId === initialListingId)
      ) {
        setSelected(initialListingId);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load matched jobs.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount fetch
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.title.toLocaleLowerCase().includes(needle) ||
        (row.company ?? "").toLocaleLowerCase().includes(needle) ||
        (row.location ?? "").toLocaleLowerCase().includes(needle),
    );
  }, [query, rows]);

  const selectedRow = filtered.find((row) => row.listingId === selected);

  function tailor(listingId: string) {
    router.push(`/app/cvs/tailor/${listingId}`);
  }

  return (
    <div className="space-y-4">
      <Link
        href="/app/cvs?tab=create"
        className="text-xs text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
      >
        ← Back to Create CV
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--zeno-ink)]">
          Choose from matched jobs
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Only jobs Zeno has analysed for you. Search on Jobs first if this list
          is empty.
        </p>
      </header>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search matched roles"
        className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--zeno-border-hover)]"
      />

      {error ? (
        <div className="rounded-[var(--zeno-radius-sm)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-xs font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--zeno-ink-muted)]">Loading your jobs…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-6">
          <p className="text-sm font-semibold text-[var(--zeno-ink)]">
            No matched jobs yet
          </p>
          <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
            Run Find new jobs and wait for analysis to finish, then return here
            to tailor a CV.
          </p>
          <Link
            href="/app/matching"
            className="mt-4 inline-flex rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3.5 py-2 text-[13px] font-semibold text-white"
          >
            Go to Find jobs
          </Link>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {filtered.map((row) => (
            <article
              key={row.listingId}
              className={`rounded-[var(--zeno-radius-md)] border bg-white px-4 py-3.5 shadow-[var(--zeno-shadow-sm)] transition ${
                selected === row.listingId
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-wash)]"
                  : "border-[var(--zeno-border)] hover:border-[var(--zeno-border-hover)]"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelected(row.listingId)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--zeno-ink)]">
                      {row.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--zeno-ink-muted)]">
                      {[row.company, row.location, row.workMode]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--zeno-ink-faint)]">
                      {[
                        row.employmentType?.replaceAll("_", " "),
                        row.experienceLevel?.replaceAll("_", " "),
                        formatPublished(row.publishedAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {row.fitScore != null ? (
                    <span className="shrink-0 rounded-full bg-[var(--zeno-violet-wash)] px-2 py-0.5 text-[11px] font-semibold text-[var(--zeno-primary-deep)]">
                      {Math.round(row.fitScore)} fit
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-[var(--zeno-surface-sunken)] px-2 py-0.5 text-[11px] font-semibold text-[var(--zeno-ink-muted)]">
                      Not analysed
                    </span>
                  )}
                </div>
                {row.explanation ? (
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--zeno-ink-muted)]">
                    {row.explanation}
                  </p>
                ) : row.description ? (
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--zeno-ink-muted)]">
                    {row.description}
                  </p>
                ) : null}
                {(row.preferredMatches.length > 0 ||
                  row.verifiedMatches.length > 0) && (
                  <p className="mt-2 line-clamp-1 text-[11px] text-[var(--zeno-ink-faint)]">
                    {[...row.preferredMatches, ...row.verifiedMatches]
                      .slice(0, 4)
                      .join(" · ")}
                  </p>
                )}
              </button>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => tailor(row.listingId)}
                  className="inline-flex h-8 items-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--zeno-primary-deep)]"
                >
                  Tailor CV
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white px-4 py-3 shadow-[var(--zeno-shadow-sm)]">
        <p className="text-xs text-[var(--zeno-ink-muted)]">
          {selectedRow
            ? `Selected: ${selectedRow.title}`
            : "Select a role to continue."}
        </p>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            tailor(selected);
          }}
          className="ml-auto inline-flex h-9 items-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3.5 text-[13px] font-semibold text-white hover:bg-[var(--zeno-primary-deep)] disabled:opacity-40"
        >
          Tailor CV
        </button>
      </div>
    </div>
  );
}

function formatPublished(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
