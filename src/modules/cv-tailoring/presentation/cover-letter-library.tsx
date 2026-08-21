"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CreateCoverLetterModal } from "./create-cover-letter-modal";
import {
  CoverLetterPreviewModal,
  type CoverLetterItem,
} from "./cover-letter-preview-modal";

type Props = {
  isModalOpen?: boolean;
  onCloseModal?: () => void;
};

export function CoverLetterLibrary({ isModalOpen = false, onCloseModal }: Props) {
  const [items, setItems] = useState<CoverLetterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CoverLetterItem | null>(null);

  const modalActive = isModalOpen || internalModalOpen;
  const handleCloseModal = () => {
    setInternalModalOpen(false);
    onCloseModal?.();
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cover-letters", {
        method: "GET",
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        coverLetters?: CoverLetterItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load cover letters.");
      }
      setItems(data.coverLetters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cover letters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.jobTitle.toLowerCase().includes(q) ||
        item.companyName.toLowerCase().includes(q) ||
        item.draft.toLowerCase().includes(q),
    );
  }, [items, query]);

  async function downloadPdf(item: CoverLetterItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    setDownloadingId(item.id);
    try {
      const response = await fetch("/api/cover-letters/render-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letterText: item.draft,
          jobTitle: item.jobTitle,
          organizationName: item.companyName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to render cover letter PDF.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const clean = (str: string) =>
        str.trim().replace(/[^a-zA-Z0-9_-]/gu, "_").replace(/_+/gu, "_");

      const isGeneral =
        !item.jobTitle ||
        item.jobTitle.toLowerCase().includes("general") ||
        !item.companyName ||
        item.companyName.toLowerCase() === "general" ||
        item.companyName.toLowerCase() === "company";

      const roleSlug = clean(item.jobTitle || "Professional");
      const compSlug = clean(item.companyName || "");

      let filename: string;
      if (isGeneral) {
        filename =
          roleSlug !== "Professional" && roleSlug !== "General"
            ? `Cover_Letter_General_${roleSlug}.pdf`
            : "Cover_Letter_General.pdf";
      } else if (compSlug) {
        filename = `Cover_Letter_${roleSlug}_${compSlug}.pdf`;
      } else {
        filename = `Cover_Letter_${roleSlug}.pdf`;
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  function copyText(item: CoverLetterItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    void navigator.clipboard.writeText(item.draft);
    setCopiedId(item.id);
    window.setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[var(--zeno-ink-muted)]">
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--zeno-primary)] border-t-transparent"
            aria-hidden
          />
          <span>Loading cover letters…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="rounded-[var(--zeno-radius-md)] border border-[color-mix(in_srgb,var(--zeno-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--zeno-danger)_10%,transparent)] p-4 text-sm text-[var(--zeno-danger)]"
        >
          {error}
        </div>
      ) : null}

      {/* Search Filter */}
      {items.length > 0 ? (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cover letters by title, company, or keyword…"
              className="h-9 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] pl-9 pr-3 text-xs text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)]"
            />
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--zeno-ink-faint)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <span className="text-xs text-[var(--zeno-ink-muted)]">
            {filtered.length} {filtered.length === 1 ? "letter" : "letters"}
          </span>
        </div>
      ) : null}

      {/* Grid or Empty State */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--zeno-surface)] border border-[var(--zeno-border)] text-[var(--zeno-primary)] shadow-[var(--zeno-shadow-sm)]">
            <CoverLetterIcon />
          </div>
          <h2 className="mt-4 text-[1.15rem] font-semibold text-[var(--zeno-ink)]">
            {items.length === 0
              ? "No cover letters generated yet"
              : "No matching cover letters found"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-[var(--zeno-ink-muted)]">
            {items.length === 0
              ? "When you create a cover letter or ask Zeno in chat, your grounded letters will appear here."
              : "Try adjusting your search keywords."}
          </p>
          {items.length === 0 ? (
            <button
              type="button"
              onClick={() => setInternalModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--zeno-primary)] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 hover:shadow-md"
            >
              <span>+ Create Cover Letter</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const isDownloading = downloadingId === item.id;
            const isCopied = copiedId === item.id;

            return (
              <article
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group relative flex flex-col justify-between rounded-[18px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--zeno-primary)] hover:shadow-[var(--zeno-shadow-md)] cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-flex rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--zeno-primary)]">
                        {item.companyName && item.companyName !== "Company"
                          ? item.companyName
                          : "General"}
                      </span>
                      <h3 className="mt-2 text-[1.05rem] font-semibold leading-snug text-[var(--zeno-ink)] group-hover:text-[var(--zeno-primary)] transition">
                        {item.companyName && item.companyName !== "Company"
                          ? `${item.jobTitle} · ${item.companyName}`
                          : item.jobTitle?.toLowerCase().includes("general")
                            ? item.jobTitle
                            : `General · ${item.jobTitle}`}
                      </h3>
                    </div>
                    <span className="opacity-0 group-hover:opacity-100 transition text-[11px] font-semibold text-[var(--zeno-primary)] bg-[var(--zeno-surface-elevated)] border border-[var(--zeno-border)] px-2 py-0.5 rounded-full shrink-0">
                      Edit →
                    </span>
                  </div>

                  {/* Letter preview card */}
                  <div className="relative mt-3.5 max-h-36 overflow-hidden rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3.5 text-xs leading-relaxed text-[var(--zeno-ink-muted)]">
                    <p className="line-clamp-4 whitespace-pre-line font-sans">
                      {item.draft}
                    </p>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--zeno-surface-sunken)] to-transparent" />
                  </div>
                </div>

                {/* Footer action bar */}
                <div className="mt-5 flex items-center justify-between border-t border-[var(--zeno-border)] pt-3.5">
                  <span className="text-[11px] text-[var(--zeno-ink-faint)]">
                    {new Date(item.updatedAt || item.createdAt).toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => copyText(item, e)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs font-medium text-[var(--zeno-ink-muted)] transition hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
                    >
                      {isCopied ? (
                        <>
                          <span className="text-emerald-500">✓</span>
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={(e) => void downloadPdf(item, e)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--zeno-primary)] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--zeno-primary-deep)] disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <span className="inline-block size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <DownloadIcon />
                      )}
                      <span>PDF</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Standalone Create Cover Letter Modal */}
      <CreateCoverLetterModal
        isOpen={modalActive}
        onClose={handleCloseModal}
        onSuccess={load}
      />

      {/* Interactive Cover Letter Preview & Live Editor Modal */}
      <CoverLetterPreviewModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdate={(updated) => {
          setItems((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          );
          setSelectedItem(updated);
        }}
      />
    </div>
  );
}

function CoverLetterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
