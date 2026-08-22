"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { CoverLetterLibrary } from "./cover-letter-library";
import { CvLibrary } from "./cv-library";

type Tab = "mine" | "cover_letters";

/**
 * CVs and Cover Letters hub — library tabs and create entry.
 */
export function CvsHub() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "cover_letters" ? "cover_letters" : "mine";
  const [coverLetterModalOpen, setCoverLetterModalOpen] = useState(false);

  const coverLettersHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tab", "cover_letters");
    return `/app/cvs?${params.toString()}`;
  }, []);

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.35rem] leading-none tracking-[-0.03em] text-[var(--zeno-ink)]">
          CVs & Cover Letters
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
          Every tailored CV and cover letter is assembled from your verified profile. Zeno does
          not invent experience.
        </p>
      </header>

      {/* Controls Bar: Tabs on Left, Dynamic Action Button on Right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-2">
          {(
            [
              ["mine", "My CVs", "/app/cvs"],
              ["cover_letters", "Cover Letters", coverLettersHref],
            ] as const
          ).map(([value, label, href]) => {
            const active = tab === value;
            return (
              <Link
                key={value}
                href={href}
                className={`inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium transition ${
                  active
                    ? "border border-[var(--zeno-border-hover)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink)] shadow-[var(--zeno-shadow-sm)]"
                    : "border border-[var(--zeno-border)] bg-[var(--zeno-surface)] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Dynamic Action Button based on active tab */}
        {tab === "cover_letters" ? (
          <button
            type="button"
            onClick={() => setCoverLetterModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 hover:shadow-md"
          >
            <span className="text-sm font-bold">+</span>
            <span>Create Cover Letter</span>
          </button>
        ) : (
          <Link
            href="/app/cvs/paste"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 hover:shadow-md"
          >
            <span className="text-sm font-bold">+</span>
            <span>Create CV</span>
          </Link>
        )}
      </div>

      {tab === "mine" ? (
        <CvLibrary embedded />
      ) : (
        <CoverLetterLibrary
          isModalOpen={coverLetterModalOpen}
          onCloseModal={() => setCoverLetterModalOpen(false)}
        />
      )}
    </div>
  );
}

function CreateCvPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link
        href="/app/cvs/paste"
        className="rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)] transition hover:border-[var(--zeno-border-hover)]"
      >
        <span className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--zeno-violet-wash)] text-[var(--zeno-primary)]">
          <ClipboardIcon />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-[var(--zeno-ink)]">
          Paste a job description
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
          Add a job description from anywhere and create a grounded CV.
        </p>
      </Link>
      <Link
        href="/app/cvs/matched"
        className="rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)] transition hover:border-[var(--zeno-border-hover)]"
      >
        <span className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--zeno-violet-wash)] text-[var(--zeno-primary)]">
          <ListIcon />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-[var(--zeno-ink)]">
          Choose from matched jobs
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
          Select one of the opportunities Zeno has already analysed.
        </p>
      </Link>
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
