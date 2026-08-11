"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { CvLibrary } from "./cv-library";

type Tab = "mine" | "create";

/**
 * CVs hub: keep the existing library as "CV", add Lovable-styled Create CV entry.
 */
export function CvsHub() {
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "create" ? "create" : "mine";

  const createHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tab", "create");
    return `/app/cvs?${params.toString()}`;
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--zeno-ink)]">
          CVs
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Every tailored CV is assembled from your verified profile. Zeno does
          not invent experience.
        </p>
      </header>

      <div className="inline-flex rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-0.5">
        {(
          [
            ["mine", "CV", "/app/cvs"],
            ["create", "Create CV", createHref],
          ] as const
        ).map(([value, label, href]) => (
          <Link
            key={value}
            href={href}
            className={`inline-flex h-8 items-center rounded-[7px] px-3 text-xs font-medium transition-colors ${
              tab === value
                ? "bg-white text-[var(--zeno-ink)] shadow-[var(--zeno-shadow-sm)]"
                : "text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "mine" ? (
        <CvLibrary embedded />
      ) : (
        <CreateCvPanel />
      )}
    </div>
  );
}

function CreateCvPanel() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        <Link
          href="/app/cvs/paste"
          className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)] transition hover:border-[var(--zeno-border-hover)]"
        >
          <span className="flex size-9 items-center justify-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-violet-wash)] text-[var(--zeno-primary)]">
            <ClipboardIcon />
          </span>
          <p className="mt-3 text-[14px] font-semibold text-[var(--zeno-ink)]">
            Paste a job description
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--zeno-ink-muted)]">
            Add a job description from anywhere and create a grounded CV.
          </p>
        </Link>
        <Link
          href="/app/cvs/matched"
          className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)] transition hover:border-[var(--zeno-border-hover)]"
        >
          <span className="flex size-9 items-center justify-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-violet-wash)] text-[var(--zeno-primary)]">
            <ListIcon />
          </span>
          <p className="mt-3 text-[14px] font-semibold text-[var(--zeno-ink)]">
            Choose from matched jobs
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--zeno-ink-muted)]">
            Select one of the opportunities Zeno has already analysed.
          </p>
        </Link>
      </div>
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
