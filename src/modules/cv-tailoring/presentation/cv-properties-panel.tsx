"use client";

import { useState } from "react";

import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";
import type { TailoredResume } from "../domain/tailored-resume";

type Tab = "design" | "personal" | "job";

type Props = {
  draft: TailoredResume;
  onChange: (next: TailoredResume) => void;
  job: DiscoveredJob | null;
  match: RankedJobMatchCard | null;
  mode: "one_page" | "two_page";
};

/**
 * Right properties rail — Design / Personal / Job — styled like Lovable.
 */
export function CvPropertiesPanel({
  draft,
  onChange,
  job,
  match,
  mode,
}: Props) {
  const [tab, setTab] = useState<Tab>("job");

  return (
    <aside className="hidden min-h-0 flex-col overflow-hidden border-l border-[var(--zeno-border)] bg-[var(--zeno-surface)] lg:flex">
      <div className="flex shrink-0 border-b border-[var(--zeno-border)]">
        {(
          [
            ["design", "Design"],
            ["personal", "Personal"],
            ["job", "Job"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex-1 border-b-2 px-2 py-2.5 text-xs font-medium transition ${
              tab === value
                ? "border-[var(--zeno-primary)] text-[var(--zeno-primary)]"
                : "border-transparent text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "design" ? (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-muted)]">
              Template
            </p>
            <div className="rounded-[8px] border border-[var(--zeno-primary)] bg-[var(--zeno-violet-soft)] p-2.5 text-left text-xs text-[var(--zeno-primary)]">
              <span className="font-medium">Professional single-column</span>
              <span className="mt-0.5 block text-[11px] text-[var(--zeno-ink-muted)]">
                Same layout used for PDF export ·{" "}
                {mode === "one_page" ? "one page" : "two pages"}.
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--zeno-ink-muted)]">
              Preview typography and section order match the React-PDF
              renderer. Additional templates are not enabled in this MVP.
            </p>
          </div>
        ) : null}

        {tab === "personal" ? (
          <div className="space-y-3">
            {(
              [
                ["fullName", "Full name", draft.contact.fullName],
                ["email", "Email", draft.contact.email ?? ""],
                ["phone", "Phone", draft.contact.phone ?? ""],
                ["location", "Location", draft.contact.location ?? ""],
              ] as const
            ).map(([key, label, value]) => (
              <label key={key} className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-muted)]">
                  {label}
                </span>
                <input
                  value={value}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (key === "fullName") {
                      onChange({
                        ...draft,
                        contact: { ...draft.contact, fullName: nextValue },
                      });
                      return;
                    }
                    onChange({
                      ...draft,
                      contact: {
                        ...draft.contact,
                        [key]: nextValue.trim() || null,
                      },
                    });
                  }}
                  className="mt-1 h-9 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-2.5 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-border-hover)]"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-muted)]">
                Target title
              </span>
              <input
                value={draft.targetTitle}
                onChange={(event) =>
                  onChange({ ...draft, targetTitle: event.target.value })
                }
                className="mt-1 h-9 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-2.5 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-border-hover)]"
              />
            </label>
            <p className="text-[11px] text-[var(--zeno-ink-muted)]">
              Changes save to this CV only. Your career profile is not updated.
            </p>
          </div>
        ) : null}

        {tab === "job" ? (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-muted)]">
                Role
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--zeno-ink)]">
                {job?.title ?? "Selected job"}
              </p>
              <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
                {[job?.organization_name, job?.location, job?.work_mode]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {match ? (
                <p className="mt-2 text-xs leading-relaxed text-[var(--zeno-ink-muted)]">
                  Evidence fit {Math.round(match.evidenceFitScore)} ·{" "}
                  {match.explanation}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
