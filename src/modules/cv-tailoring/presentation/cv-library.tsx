"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

type CvCard = {
  id: string;
  listingId: string;
  mode: "one_page" | "two_page";
  status: string;
  targetTitle: string;
  jobAlignment: string;
  pageCount: number | null;
  projectCount: number;
  experienceCount: number;
  canDownload: boolean;
  canRender: boolean;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type StyleFilter = "all" | "modern" | "classic";

type Props = {
  /** When true, omit the outer page header (used inside CvsHub tabs). */
  embedded?: boolean;
};

export function CvLibrary({ embedded = false }: Props) {
  const [variants, setVariants] = useState<CvCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cv-tailoring", {
        method: "GET",
        credentials: "same-origin",
      });
      const body = (await response.json()) as {
        variants?: CvCard[];
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.message ?? body.error ?? "Could not load CVs.");
      }
      setVariants(body.variants ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load CVs.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount fetch
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variants.filter((variant) => {
      if (styleFilter === "modern" && variant.mode !== "one_page") return false;
      if (styleFilter === "classic" && variant.mode !== "two_page") return false;
      if (!q) return true;
      return (
        variant.targetTitle.toLowerCase().includes(q) ||
        variant.jobAlignment.toLowerCase().includes(q) ||
        variant.status.toLowerCase().includes(q)
      );
    });
  }, [variants, query, styleFilter]);

  function finishPdf(variantId: string) {
    setPendingId(variantId);
    setMenuOpenId(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/cv-tailoring/${variantId}/render`, {
          method: "POST",
          credentials: "same-origin",
        });
        const body = (await response.json()) as {
          error?: string;
          message?: string;
        };
        if (!response.ok) {
          throw new Error(body.message ?? body.error ?? "PDF render failed.");
        }
        await load();
      } catch (renderError) {
        setError(
          renderError instanceof Error
            ? renderError.message
            : "PDF render failed.",
        );
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {!embedded ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.35rem] leading-none tracking-[-0.03em]">
              CVs
            </h1>
            <p className="mt-3 text-sm text-[var(--zeno-ink-muted)]">
              Tailored CVs generated from your matched jobs.
            </p>
          </div>
          <Link
            href="/app/cvs?tab=create"
            className="inline-flex rounded-full bg-[var(--zeno-ink)] px-4 py-2 text-[13px] font-medium text-white"
          >
            Create CV
          </Link>
        </header>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search tailored CVs</span>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--zeno-ink-faint)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tailored CVs"
            className="h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white pl-9 pr-3 text-[13px] outline-none placeholder:text-[var(--zeno-ink-faint)] focus:border-[var(--zeno-border-hover)]"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["modern", "Modern Clean"],
              ["classic", "Classic Professional"],
            ] as const
          ).map(([value, label]) => {
            const active = styleFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStyleFilter(value)}
                className={`inline-flex h-9 items-center rounded-full px-3.5 text-[12px] font-medium transition ${
                  active
                    ? "bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)]"
                    : "border border-[var(--zeno-border)] bg-white text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--zeno-ink-muted)]">Loading your CVs…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--zeno-border)] bg-white p-8 text-center">
          <p className="text-sm text-[var(--zeno-ink-muted)]">
            {variants.length === 0
              ? "No tailored CVs yet. Choose a matched job to generate a CV — it will appear here as its own tile."
              : "No CVs match that search."}
          </p>
          {variants.length === 0 ? (
            <Link
              href="/app/cvs/matched"
              className="mt-4 inline-flex text-sm font-semibold text-[var(--zeno-primary)] hover:underline"
            >
              Choose from matched jobs
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((variant) => (
            <li
              key={variant.id}
              className={`relative rounded-[16px] border border-[var(--zeno-border)] bg-white shadow-[var(--zeno-shadow-sm)] ${
                menuOpenId === variant.id ? "z-20" : "z-0"
              }`}
            >
              <div className="cv-dotted-canvas relative h-[148px] overflow-hidden rounded-t-[16px] border-b border-[var(--zeno-border)] px-8 py-6">
                <div className="mx-auto h-full max-w-[132px] rounded-[2px] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
                  <div className="mb-2 h-2 w-16 rounded-sm bg-[var(--zeno-ink)]/80" />
                  <div className="mb-3 h-1.5 w-10 rounded-sm bg-[var(--zeno-primary)]/70" />
                  <div className="space-y-1.5">
                    <div className="h-1 w-full rounded-sm bg-[var(--zeno-ink)]/25" />
                    <div className="h-1 w-[92%] rounded-sm bg-[var(--zeno-ink)]/20" />
                    <div className="h-1 w-[85%] rounded-sm bg-[var(--zeno-ink)]/15" />
                    <div className="mt-2 h-1 w-full rounded-sm bg-[var(--zeno-ink)]/20" />
                    <div className="h-1 w-[88%] rounded-sm bg-[var(--zeno-ink)]/15" />
                    <div className="h-1 w-[70%] rounded-sm bg-[var(--zeno-ink)]/10" />
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-[var(--zeno-ink)]">
                      {variant.targetTitle || "Tailored CV"}
                    </h2>
                    <p className="mt-1 truncate text-[12px] text-[var(--zeno-ink-muted)]">
                      {formatAlignment(variant.jobAlignment)} ·{" "}
                      {formatRelativeDay(variant.updatedAt)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--zeno-ink-faint)]">
                      {variant.mode === "one_page"
                        ? "Modern Clean"
                        : "Classic Professional"}
                      {variant.pageCount ? ` · ${variant.pageCount} page` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--zeno-violet-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--zeno-primary-deep)]">
                    {statusChip(variant.status)}
                  </span>
                </div>

                {variant.errorMessage ? (
                  <p className="mt-2 text-xs text-red-700">
                    {variant.errorMessage}
                  </p>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-2">
                  <Link
                    href={`/app/cvs/tailor/${variant.listingId}`}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-3 text-[12px] font-medium text-[var(--zeno-ink)] transition hover:bg-[var(--zeno-violet-wash)]"
                  >
                    Open
                  </Link>
                  <div className="relative">
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-[8px] text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-violet-wash)]"
                      aria-label="More actions"
                      aria-expanded={menuOpenId === variant.id}
                      onClick={() =>
                        setMenuOpenId((current) =>
                          current === variant.id ? null : variant.id,
                        )
                      }
                    >
                      <MoreIcon />
                    </button>
                    {menuOpenId === variant.id ? (
                      <div className="absolute bottom-full right-0 z-30 mb-1 w-44 rounded-[10px] border border-[var(--zeno-border)] bg-white p-1 shadow-[var(--zeno-shadow-md)]">
                        {variant.canDownload ? (
                          <a
                            href={`/api/cv-tailoring/${variant.id}/download`}
                            className="block rounded-md px-3 py-2 text-[12px] hover:bg-[var(--zeno-violet-wash)]"
                            onClick={() => setMenuOpenId(null)}
                          >
                            Download PDF
                          </a>
                        ) : null}
                        {variant.canRender ? (
                          <button
                            type="button"
                            disabled={isPending && pendingId === variant.id}
                            onClick={() => finishPdf(variant.id)}
                            className="block w-full rounded-md px-3 py-2 text-left text-[12px] hover:bg-[var(--zeno-violet-wash)] disabled:opacity-60"
                          >
                            {isPending && pendingId === variant.id
                              ? "Rendering…"
                              : "Finish PDF"}
                          </button>
                        ) : null}
                        {!variant.canDownload && !variant.canRender ? (
                          <p className="px-3 py-2 text-[12px] text-[var(--zeno-ink-muted)]">
                            {statusLabel(variant.status)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusChip(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "ready_to_render":
      return "Draft";
    case "rendering":
      return "Rendering";
    case "failed":
      return "Fix needed";
    default:
      return status.replaceAll("_", " ");
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "ready_to_render":
      return "Content ready";
    case "rendering":
      return "Rendering";
    case "failed":
      return "Needs attention";
    default:
      return status.replaceAll("_", " ");
  }
}

function formatAlignment(value: string): string {
  return value.replaceAll("_", " ");
}

function formatRelativeDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}
