"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PasteCoverLetterForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"targeted" | "general">("targeted");
  const [jobTitle, setJobTitle] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepHint, setStepHint] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStepHint(
      mode === "general"
        ? "Generating general cover letter from verified profile…"
        : "Analysing requirements & drafting tailored cover letter…",
    );

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

      const body = (await res.json()) as {
        draft?: string;
        error?: string;
        message?: string;
      };

      if (!res.ok || body.error) {
        throw new Error(
          body.message ?? body.error ?? "Failed to generate cover letter.",
        );
      }

      setStepHint("Opening Cover Letters library…");
      router.push("/app/cvs?tab=cover_letters");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate cover letter.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/cvs?tab=cover_letters"
        className="inline-flex items-center text-xs font-medium text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
      >
        ← Back to Cover Letters
      </Link>

      <header className="max-w-2xl">
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.15rem] leading-none tracking-[-0.03em] text-[var(--zeno-ink)]">
          Create Cover Letter
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--zeno-ink-muted)]">
          Zeno crafts grounded cover letters directly from your verified profile evidence. No CV generation required.
        </p>
      </header>

      {/* Mode selector */}
      <div className="inline-flex rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-1">
        <button
          type="button"
          onClick={() => setMode("targeted")}
          className={`rounded-full px-5 py-2 text-xs transition ${
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
          className={`rounded-full px-5 py-2 text-xs transition ${
            mode === "general"
              ? "border border-[var(--zeno-border-hover)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink)] shadow-sm font-semibold"
              : "text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] border border-transparent font-medium"
          }`}
        >
          General Cover Letter
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-danger)]/25 bg-[var(--zeno-danger-soft)]/50 p-4 text-sm text-[var(--zeno-danger)]"
        >
          {error}
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-sm)]"
      >
        {mode === "targeted" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[var(--zeno-ink)]">
                  Target job title <span className="font-normal text-[var(--zeno-ink-muted)]">(optional)</span>
                </span>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  disabled={loading}
                  className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[var(--zeno-ink)]">
                  Company name <span className="font-normal text-[var(--zeno-ink-muted)]">(optional)</span>
                </span>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="e.g. Stripe, Acme Corp"
                  disabled={loading}
                  className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--zeno-ink)]">
                  Job description <span className="text-[var(--zeno-primary)]">*</span>
                </span>
                <span className="text-[11px] text-[var(--zeno-ink-faint)]">
                  {jobDescription.length} characters
                </span>
              </div>
              <textarea
                required
                rows={8}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job description or key requirements here…"
                disabled={loading}
                className="w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3 text-[16px] sm:text-[13px] leading-relaxed text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
              />
            </label>
          </>
        ) : (
          <div className="space-y-4 rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-5 text-sm text-[var(--zeno-ink-muted)]">
            <h3 className="text-[15px] font-semibold text-[var(--zeno-ink)]">
              General Candidate Cover Letter
            </h3>
            <p className="leading-relaxed">
              Zeno will craft a comprehensive, versatile cover letter showcasing your top verified skills, impact, and achievements from your career profile.
            </p>
            <label className="block space-y-1.5 pt-2 max-w-sm">
              <span className="text-xs font-semibold text-[var(--zeno-ink)]">
                Headline Role <span className="font-normal text-[var(--zeno-ink-muted)]">(optional)</span>
              </span>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                disabled={loading}
                className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {stepHint ? (
            <p className="text-xs text-[var(--zeno-ink-muted)]">{stepHint}</p>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Link
              href="/app/cvs?tab=cover_letters"
              className="inline-flex h-10 items-center rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 text-[13px] font-medium text-[var(--zeno-ink)] transition hover:border-[var(--zeno-border-hover)]"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || (mode === "targeted" && jobDescription.trim().length < 20)}
              className="inline-flex h-10 items-center justify-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] hover:opacity-90 px-5 text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
            >
              {loading ? "Drafting Cover Letter…" : "Generate Cover Letter →"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
