"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function PasteJdForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState<"remote" | "hybrid" | "onsite" | "">("");
  const [loading, setLoading] = useState(false);
  const [stepHint, setStepHint] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!description.trim() || description.trim().length < 20) {
      setError("Please paste a complete job description (at least 20 characters).");
      return;
    }

    setLoading(true);
    setError(null);
    setStepHint("Saving and analysing job description…");

    try {
      setStepHint("Extracting requirements & matching with your profile…");
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          title: title.trim() || null,
          organizationName: organizationName.trim() || null,
          location: location.trim() || null,
          workMode: workMode || null,
        }),
      });

      const body = (await res.json()) as {
        listingId?: string;
        error?: string;
        message?: string;
      };

      if (!res.ok || !body.listingId) {
        throw new Error(
          body.message ?? body.error ?? "Failed to process job description.",
        );
      }

      setStepHint("Opening tailored CV workspace…");
      router.push(`/app/cvs/tailor/${body.listingId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process job description.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/cvs?tab=create"
        className="inline-flex items-center text-xs font-medium text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
      >
        ← Back to Create CV
      </Link>

      <header className="max-w-2xl">
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.15rem] leading-none tracking-[-0.03em] text-[var(--zeno-ink)]">
          Paste a job description
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--zeno-ink-muted)]">
          Paste any job posting from LinkedIn, Greenhouse, Lever, or a company
          site. Zeno extracts key requirements, calculates verified match fit,
          and generates a tailored CV.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-[var(--zeno-radius-md)] border border-[color-mix(in_srgb,var(--zeno-danger)_25%,white)] bg-[color-mix(in_srgb,var(--zeno-danger)_8%,white)] p-4 text-sm text-[var(--zeno-danger)]"
        >
          {error}
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-sm)]"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--zeno-ink)]">
              Job title <span className="font-normal text-[var(--zeno-ink-muted)]">(optional)</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              disabled={loading}
              className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--zeno-ink)]">
              Company / Organization <span className="font-normal text-[var(--zeno-ink-muted)]">(optional)</span>
            </span>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="e.g. Stripe, OpenAI, Acme Corp"
              disabled={loading}
              className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--zeno-ink)]">
              Location <span className="font-normal text-[var(--zeno-ink-muted)]">(optional)</span>
            </span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. San Francisco, CA / London / Colombo"
              disabled={loading}
              className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--zeno-ink)]">
              Work mode <span className="font-normal text-[var(--zeno-ink-muted)]">(optional)</span>
            </span>
            <select
              value={workMode}
              onChange={(e) =>
                setWorkMode(
                  e.target.value as "remote" | "hybrid" | "onsite" | "",
                )
              }
              disabled={loading}
              className="h-10 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
            >
              <option value="">Any / unspecified</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--zeno-ink)]">
              Full job description <span className="text-[var(--zeno-danger)]">*</span>
            </span>
            <span className="text-[11px] text-[var(--zeno-ink-muted)]">
              {description.length} characters
            </span>
          </div>
          <textarea
            rows={12}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
            placeholder="Paste the full job posting here, including responsibilities, qualifications, tech stack, and about the company…"
            required
            className="w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3 font-mono text-[16px] sm:text-[13px] leading-relaxed text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-60"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-[var(--zeno-ink-muted)]">
            {loading ? (
              <span className="inline-flex items-center gap-2 font-medium text-[var(--zeno-primary)]">
                <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-[var(--zeno-primary)] border-t-transparent" />
                {stepHint}
              </span>
            ) : (
              <span>Verified profile will be matched to this job.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/app/cvs/matched"
              className="inline-flex h-10 items-center rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 text-[13px] font-medium text-[var(--zeno-ink)] transition hover:border-[var(--zeno-border-hover)]"
            >
              Choose from matched jobs
            </Link>
            <button
              type="submit"
              disabled={loading || description.trim().length < 20}
              className="inline-flex h-10 items-center justify-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-ink)] px-5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Processing…" : "Create Tailored CV →"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
