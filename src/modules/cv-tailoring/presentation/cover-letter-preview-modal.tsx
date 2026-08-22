"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type CoverLetterItem = {
  id: string;
  listingId: string;
  jobTitle: string;
  companyName: string;
  draft: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  item: CoverLetterItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updated: CoverLetterItem) => void;
};

export function CoverLetterPreviewModal({
  item,
  isOpen,
  onClose,
  onUpdate,
}: Props) {
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<"saved" | "unsaved" | "saving" | "error" | "idle">("idle");
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (item) {
      setDraftText(item.draft);
      setSavedStatus("idle");
      setError(null);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const isGeneral =
    !item.jobTitle ||
    item.jobTitle.toLowerCase().includes("general") ||
    !item.companyName ||
    item.companyName.toLowerCase() === "general" ||
    item.companyName.toLowerCase() === "company";

  const displayTitle =
    item.companyName && item.companyName !== "Company"
      ? `${item.jobTitle} · ${item.companyName}`
      : item.jobTitle?.toLowerCase().includes("general")
        ? item.jobTitle
        : `General · ${item.jobTitle}`;

  const wordsCount = draftText.trim().split(/\s+/).filter(Boolean).length;
  const charsCount = draftText.length;

  async function handleSave(newText?: string) {
    const textToSave = newText ?? draftText;
    if (!item || textToSave === item.draft) {
      setSavedStatus("saved");
      return;
    }

    setSaving(true);
    setSavedStatus("saving");
    setError(null);

    try {
      const res = await fetch("/api/cover-letters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          draft: textToSave,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save changes.");
      }

      const updated = {
        ...item,
        draft: textToSave,
        updatedAt: new Date().toISOString(),
      };
      onUpdate(updated);
      setSavedStatus("saved");
    } catch (err) {
      setSavedStatus("error");
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function handleTextChange(val: string) {
    setDraftText(val);
    setSavedStatus("unsaved");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      void handleSave(val);
    }, 1500);
  }

  async function handleDownloadPdf() {
    if (!item) return;
    setDownloadingPdf(true);
    try {
      const response = await fetch("/api/cover-letters/render-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letterText: draftText,
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
      setDownloadingPdf(false);
    }
  }

  function handleDownloadTxt() {
    if (!item) return;
    const blob = new Blob([draftText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const clean = (str: string) =>
      str.trim().replace(/[^a-zA-Z0-9_-]/gu, "_").replace(/_+/gu, "_");
    const roleSlug = clean(item.jobTitle || "Professional");
    a.href = url;
    a.download = `Cover_Letter_${roleSlug}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  function handleCopy() {
    void navigator.clipboard.writeText(draftText);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="flex h-[90vh] max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] shadow-[var(--zeno-shadow-xl)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
      >
        {/* Header Bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--zeno-primary)]/10 text-[var(--zeno-primary)] border border-[var(--zeno-primary)]/20">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="preview-modal-title" className="text-base font-bold text-[var(--zeno-ink)]">
                  {displayTitle}
                </h2>
                <span className="inline-flex rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-2 py-0.5 text-[10px] font-semibold text-[var(--zeno-primary)]">
                  {isGeneral ? "General" : "Targeted"}
                </span>
              </div>
              <p className="text-xs text-[var(--zeno-ink-muted)]">
                Live editable letter grounded in your verified career profile.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {item.listingId && item.listingId.length > 10 ? (
              <Link
                href={`/app/cvs/tailor/${item.listingId}?tab=cover_letter`}
                className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs font-semibold text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)] transition"
              >
                <span>CV Workspace</span>
                <span>→</span>
              </Link>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-surface-sunken)] hover:text-[var(--zeno-ink)] transition"
              aria-label="Close modal"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Toolbar Bar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-6 py-2.5">
          <div className="flex items-center gap-3 text-xs text-[var(--zeno-ink-muted)]">
            <span>
              Words: <strong className="text-[var(--zeno-ink)]">{wordsCount}</strong>
            </span>
            <span>•</span>
            <span>
              Characters: <strong className="text-[var(--zeno-ink)]">{charsCount}</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              {savedStatus === "saving" ? (
                <>
                  <span className="inline-block size-2 animate-spin rounded-full border border-[var(--zeno-primary)] border-t-transparent" />
                  <span className="text-[var(--zeno-primary)]">Saving…</span>
                </>
              ) : savedStatus === "saved" ? (
                <>
                  <span className="text-emerald-500">✓</span>
                  <span className="text-emerald-500">Saved</span>
                </>
              ) : savedStatus === "unsaved" ? (
                <span className="text-[var(--zeno-ink-muted)]">Unsaved changes</span>
              ) : null}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || savedStatus === "saved" || savedStatus === "idle"}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-surface-sunken)] disabled:opacity-40 transition"
            >
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-surface-sunken)] transition"
            >
              {copied ? (
                <>
                  <span className="text-emerald-500">✓</span>
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-surface-sunken)] transition"
            >
              <span>.txt</span>
            </button>
            <button
              type="button"
              disabled={downloadingPdf}
              onClick={() => void handleDownloadPdf()}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--zeno-primary)] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[var(--zeno-primary-deep)] disabled:opacity-50 transition"
            >
              {downloadingPdf ? (
                <span className="inline-block size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="bg-[var(--zeno-danger-soft)] px-6 py-2 text-xs font-medium text-[var(--zeno-danger)]">
            {error}
          </div>
        ) : null}

        {/* Editor Main Canvas */}
        <div className="flex min-h-0 flex-1 bg-[var(--zeno-surface-sunken)] p-6 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-8 shadow-[var(--zeno-shadow-sm)]">
            <textarea
              value={draftText}
              onChange={(e) => handleTextChange(e.target.value)}
              className="min-h-[460px] w-full flex-1 resize-none bg-transparent font-sans text-[14px] leading-relaxed text-[var(--zeno-ink)] outline-none selection:bg-[var(--zeno-primary)]/20"
              placeholder="Your cover letter text appears here…"
            />
          </div>
        </div>

        {/* Footer Helper */}
        <footer className="flex shrink-0 items-center justify-between border-t border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-6 py-3 text-[11px] text-[var(--zeno-ink-muted)]">
          <span>
            Changes auto-save automatically.
          </span>
          <span>
            Last updated: {new Date(item.updatedAt || item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </footer>
      </div>
    </div>
  );
}
