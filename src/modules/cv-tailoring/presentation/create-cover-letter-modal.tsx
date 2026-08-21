"use client";

import { useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function CreateCoverLetterModal({ isOpen, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"targeted" | "general">("targeted");
  const [jobTitle, setJobTitle] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload =
        mode === "general"
          ? {
              isGeneral: true,
              jobTitle: jobTitle.trim() || undefined,
            }
          : {
              jobTitle: jobTitle.trim() || undefined,
              organizationName: organizationName.trim() || undefined,
              jobDescription: jobDescription.trim(),
            };

      const res = await fetch("/api/cover-letters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to generate cover letter.");
      }

      onSuccess();
      onClose();
      setJobTitle("");
      setOrganizationName("");
      setJobDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-[20px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-lg)] relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-surface-sunken)] hover:text-[var(--zeno-ink)] transition"
          aria-label="Close dialog"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 id="modal-title" className="text-xl font-semibold text-[var(--zeno-ink)]">
          Create Cover Letter
        </h2>
        <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
          Zeno crafts grounded cover letters directly from your verified profile evidence.
        </p>

        {/* Mode selector */}
        <div className="mt-4 flex rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-1">
          <button
            type="button"
            onClick={() => setMode("targeted")}
            className={`flex-1 rounded-full py-1.5 text-xs transition ${
              mode === "targeted"
                ? "border border-[var(--zeno-border-hover)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink)] shadow-sm font-semibold"
                : "text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] border border-transparent font-medium"
            }`}
          >
            Targeted for a Job
          </button>
          <button
            type="button"
            onClick={() => setMode("general")}
            className={`flex-1 rounded-full py-1.5 text-xs transition ${
              mode === "general"
                ? "border border-[var(--zeno-border-hover)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink)] shadow-sm font-semibold"
                : "text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] border border-transparent font-medium"
            }`}
          >
            General Cover Letter
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-[8px] bg-[var(--zeno-danger-soft)] p-2.5 text-xs font-medium text-[var(--zeno-danger)]">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleGenerate} className="mt-4 space-y-3.5">
          {mode === "targeted" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[var(--zeno-ink-muted)]">
                    Target Role (optional)
                  </span>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Senior Frontend Engineer"
                    disabled={loading}
                    className="h-9 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[var(--zeno-ink-muted)]">
                    Company Name (optional)
                  </span>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder="e.g. Stripe, Acme Corp"
                    disabled={loading}
                    className="h-9 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[var(--zeno-ink-muted)]">
                  Job Description / Role Requirements <span className="text-[var(--zeno-primary)]">*</span>
                </span>
                <textarea
                  rows={4}
                  required
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description or role requirements here…"
                  disabled={loading}
                  className="w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)] leading-relaxed resize-none"
                />
              </label>
            </>
          ) : (
            <div className="rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-4 text-xs text-[var(--zeno-ink-muted)] space-y-2">
              <p className="font-semibold text-[var(--zeno-ink)]">
                General Profile Cover Letter
              </p>
              <p className="leading-relaxed">
                Generates a clean, comprehensive cover letter highlighting your top verified skills, achievements, and career background.
              </p>
              <label className="block space-y-1 pt-1">
                <span className="text-[11px] font-medium text-[var(--zeno-ink-muted)]">
                  Headline Role (optional)
                </span>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Software Engineer"
                  disabled={loading}
                  className="h-9 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
                />
              </label>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full border border-[var(--zeno-border)] px-4 py-2 text-xs font-semibold text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-surface-sunken)] hover:text-[var(--zeno-ink)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (mode === "targeted" && jobDescription.trim().length < 15)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--zeno-primary)] px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="size-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Drafting Cover Letter…</span>
                </>
              ) : (
                <span>Generate Cover Letter →</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
