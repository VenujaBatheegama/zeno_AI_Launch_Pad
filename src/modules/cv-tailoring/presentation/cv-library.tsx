"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

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

type Props = {
  /** When true, omit the outer page header (used inside CvsHub tabs). */
  embedded?: boolean;
};

export function CvLibrary({ embedded = false }: Props) {
  const [variants, setVariants] = useState<CvCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  function finishPdf(variantId: string) {
    setPendingId(variantId);
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
    <div className="space-y-4">
      {!embedded ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CVs</h1>
            <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
              Tailored CVs generated from your matched jobs.
            </p>
          </div>
          <Link
            href="/app/cvs?tab=create"
            className="inline-flex rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--zeno-primary-deep)]"
          >
            Create CV
          </Link>
        </header>
      ) : null}

      {error ? (
        <p className="rounded-[var(--zeno-radius-sm)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--zeno-ink-muted)]">Loading your CVs…</p>
      ) : variants.length === 0 ? (
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-6">
          <p className="text-sm text-[var(--zeno-ink-muted)]">
            No tailored CVs yet. Choose a matched job to generate a CV — it will
            appear here as its own tile.
          </p>
          <Link
            href="/app/cvs/matched"
            className="mt-4 inline-flex text-sm font-semibold text-[var(--zeno-primary)] hover:underline"
          >
            Choose from matched jobs
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {variants.map((variant) => (
            <li
              key={variant.id}
              className="flex flex-col rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold leading-snug text-[var(--zeno-ink)]">
                  {variant.targetTitle || "Tailored CV"}
                </h2>
                <span className="shrink-0 rounded-full bg-[var(--zeno-violet-wash)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-primary-deep)]">
                  {variant.mode === "one_page" ? "1 page" : "2 page"}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--zeno-ink-muted)]">
                {statusLabel(variant.status)}
                {variant.pageCount ? ` · ${variant.pageCount} page PDF` : ""}
                {` · ${variant.projectCount} projects`}
                {` · ${formatAlignment(variant.jobAlignment)} fit`}
              </p>
              <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
                Updated {formatDate(variant.updatedAt)}
              </p>
              {variant.errorMessage ? (
                <p className="mt-2 text-xs text-red-700">{variant.errorMessage}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/app/cvs/tailor/${variant.listingId}`}
                  className="inline-flex rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--zeno-ink)] hover:border-[var(--zeno-border-hover)]"
                >
                  Open
                </Link>
                {variant.canDownload ? (
                  <a
                    href={`/api/cv-tailoring/${variant.id}/download`}
                    className="inline-flex rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--zeno-primary-deep)]"
                  >
                    Download PDF
                  </a>
                ) : null}
                {variant.canRender ? (
                  <button
                    type="button"
                    disabled={isPending && pendingId === variant.id}
                    onClick={() => finishPdf(variant.id)}
                    className="inline-flex rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--zeno-ink)] hover:border-[var(--zeno-border-hover)] disabled:opacity-60"
                  >
                    {isPending && pendingId === variant.id
                      ? "Rendering…"
                      : "Finish PDF"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
