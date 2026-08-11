"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";
import type { TailoredResume } from "../domain/tailored-resume";

type PublicVariant = {
  id: string;
  listingId: string;
  mode: "one_page" | "two_page";
  status: string;
  recommendedMode: "one_page" | "two_page";
  recommendationReason: string;
  warnings: string[];
  targetTitle: string;
  jobAlignment: string;
  tailoredContent: TailoredResume | null;
  assessment: {
    generation_status?: string;
    factually_valid?: boolean;
  } | null;
  pageCount: number | null;
  errorMessage: string | null;
  updatedAt: string;
  keywordAudit?: Array<{
    keyword: string;
    support_state: string;
  }>;
};

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

type Props = {
  listingId: string;
};

export function CvTailorWorkspace({ listingId }: Props) {
  const [job, setJob] = useState<DiscoveredJob | null>(null);
  const [match, setMatch] = useState<RankedJobMatchCard | null>(null);
  const [variant, setVariant] = useState<PublicVariant | null>(null);
  const [draft, setDraft] = useState<TailoredResume | null>(null);
  const [mode, setMode] = useState<"one_page" | "two_page">("one_page");
  const [context, setContext] = useState("");
  const [recommendation, setRecommendation] = useState<{
    recommendedMode: "one_page" | "two_page";
    reason: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prerequisite, setPrerequisite] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const expectedUpdatedAtRef = useRef<string | null>(null);
  const draftRef = useRef<TailoredResume | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  /** Bumps on every local edit so older PATCH responses cannot clobber newer drafts. */
  const draftRevisionRef = useRef(0);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPrerequisite(null);
    try {
      const [jobsRes, matchesRes, listingRes, recommendRes] = await Promise.all([
        fetch("/api/jobs", { credentials: "same-origin" }),
        fetch("/api/career-intelligence/matches", { credentials: "same-origin" }),
        fetch(`/api/cv-tailoring/listing/${listingId}`, {
          credentials: "same-origin",
        }),
        fetch("/api/cv-tailoring/recommend", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        }),
      ]);

      if (!jobsRes.ok) {
        throw new Error("Could not load jobs for this account.");
      }
      const jobs = (await jobsRes.json()) as DiscoveredJob[];
      const found = jobs.find((item) => item.listing_id === listingId) ?? null;
      if (!found) {
        setPrerequisite("That job was not found in your discovered jobs.");
        setJob(null);
        return;
      }
      setJob(found);

      if (matchesRes.ok) {
        const matches = (await matchesRes.json()) as RankedJobMatchCard[];
        setMatch(matches.find((item) => item.listingId === listingId) ?? null);
      }

      let recommendError: string | null = null;
      if (recommendRes.ok) {
        const body = (await recommendRes.json()) as {
          recommendedMode: "one_page" | "two_page";
          reason: string;
        };
        setRecommendation(body);
        setMode(body.recommendedMode);
      } else {
        const body = (await recommendRes.json()) as { error?: string };
        if (
          body.error &&
          [400, 404, 409, 422].includes(recommendRes.status)
        ) {
          recommendError = body.error;
        }
      }

      let loadedVariant: PublicVariant | null = null;
      if (listingRes.ok) {
        const body = (await listingRes.json()) as {
          variants?: Array<{ id: string; status: string }>;
        };
        const reusable =
          body.variants?.find(
            (item) =>
              item.status === "ready_to_render" || item.status === "ready",
          ) ?? body.variants?.[0];
        if (reusable) {
          const variantRes = await fetch(`/api/cv-tailoring/${reusable.id}`, {
            credentials: "same-origin",
          });
          if (variantRes.ok) {
            const loaded = (await variantRes.json()) as {
              variant: PublicVariant;
            };
            loadedVariant = loaded.variant;
            setVariant(loaded.variant);
            setDraft(loaded.variant.tailoredContent);
            expectedUpdatedAtRef.current = loaded.variant.updatedAt;
            setMode(loaded.variant.mode);
          }
        }
      }

      // Block on prerequisites only when there is no existing editable draft.
      if (!loadedVariant?.tailoredContent && recommendError) {
        setPrerequisite(recommendError);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load page.",
      );
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount/listing fetch
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === "unsaved" || saveState === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  async function persistDraft(
    content: TailoredResume,
    revision: number,
  ): Promise<boolean> {
    if (!variant) return false;
    setSaveState("saving");
    setSaveError(null);
    try {
      const response = await fetch(`/api/cv-tailoring/${variant.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tailoredContent: content,
          expectedUpdatedAt: expectedUpdatedAtRef.current,
        }),
      });
      const body = (await response.json()) as {
        variant?: PublicVariant;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save CV edits.");
      }
      if (!body.variant) throw new Error("Save returned no variant.");
      // Always advance concurrency token; only replace draft when still current.
      expectedUpdatedAtRef.current = body.variant.updatedAt;
      setVariant(body.variant);
      if (revision !== draftRevisionRef.current) {
        setSaveState("unsaved");
        return true;
      }
      setDraft(body.variant.tailoredContent);
      setSaveState("saved");
      return true;
    } catch (persistError) {
      if (revision !== draftRevisionRef.current) return false;
      setSaveState("error");
      setSaveError(
        persistError instanceof Error
          ? persistError.message
          : "Could not save CV edits.",
      );
      return false;
    }
  }

  function queueSave(next: TailoredResume) {
    draftRevisionRef.current += 1;
    const revision = draftRevisionRef.current;
    setDraft(next);
    setSaveState("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const promise = persistDraft(next, revision);
      saveInFlightRef.current = promise;
      void promise.finally(() => {
        if (saveInFlightRef.current === promise) {
          saveInFlightRef.current = null;
        }
      });
    }, 800);
  }

  async function flushSave(): Promise<boolean> {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (saveInFlightRef.current) {
      const ok = await saveInFlightRef.current;
      if (!ok) return false;
    }
    if (
      (saveState === "unsaved" || saveState === "error") &&
      draftRef.current
    ) {
      draftRevisionRef.current += 1;
      return persistDraft(draftRef.current, draftRevisionRef.current);
    }
    return saveState !== "error";
  }

  async function generateContent(force: boolean) {
    setBusy(force ? "regenerate" : "generate");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/cv-tailoring", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          mode,
          tailoringContext: context.trim() || null,
          force,
        }),
      });
      const body = (await response.json()) as {
        variant?: PublicVariant;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "CV generation failed.");
      }
      if (!body.variant) throw new Error("Generation returned no variant.");
      setVariant(body.variant);
      setDraft(body.variant.tailoredContent);
      expectedUpdatedAtRef.current = body.variant.updatedAt;
      setSaveState("idle");
      setMessage(
        body.variant.status === "ready_to_render"
          ? "Validated CV content ready — edit if needed, then generate the PDF."
          : `CV status: ${body.variant.status}`,
      );
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "CV generation failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function renderPdf() {
    if (!variant) return;
    setBusy("render");
    setError(null);
    const flushed = await flushSave();
    if (!flushed) {
      setError("Save your edits before generating the PDF.");
      setBusy(null);
      return;
    }
    try {
      const response = await fetch(`/api/cv-tailoring/${variant.id}/render`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as {
        variant?: PublicVariant;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "PDF render failed.");
      }
      if (!body.variant) throw new Error("Render returned no variant.");
      setVariant(body.variant);
      expectedUpdatedAtRef.current = body.variant.updatedAt;
      setMessage(
        body.variant.status === "ready"
          ? `PDF ready (${body.variant.pageCount ?? "?"} page). You can download it.`
          : `CV status: ${body.variant.status}`,
      );
    } catch (renderError) {
      setError(
        renderError instanceof Error
          ? renderError.message
          : "PDF render failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--zeno-ink-muted)]">Loading…</p>;
  }

  if (prerequisite) {
    return (
      <div className="space-y-4">
        <Link href="/app/cvs/matched" className="text-xs text-[var(--zeno-ink-muted)]">
          ← Back to matched jobs
        </Link>
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-6">
          <p className="text-sm font-semibold text-[var(--zeno-ink)]">
            Almost ready to tailor
          </p>
          <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">{prerequisite}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/app/career-profile"
              className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3 py-2 text-xs font-semibold text-white"
            >
              Verify career evidence
            </Link>
            <Link
              href="/app/matching"
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-xs font-semibold"
            >
              Analyse jobs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canDownload = variant?.status === "ready";
  const canRender =
    variant &&
    draft &&
    (variant.status === "ready_to_render" ||
      (variant.status === "failed" && Boolean(variant.tailoredContent)));

  return (
    <div className="space-y-4">
      <Link href="/app/cvs/matched" className="text-xs text-[var(--zeno-ink-muted)]">
        ← Back to matched jobs
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--zeno-ink)]">
            Tailor CV
          </h1>
          <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
            {job?.title}
            {job?.organization_name ? ` · ${job.organization_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--zeno-ink-muted)]">
            {saveState === "unsaved"
              ? "Unsaved changes"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Save failed"
                    : " "}
          </span>
          {saveState === "error" ? (
            <button
              type="button"
              className="font-semibold text-[var(--zeno-danger)] underline"
              onClick={() => {
                if (!draft) return;
                draftRevisionRef.current += 1;
                void persistDraft(draft, draftRevisionRef.current);
              }}
            >
              Retry save
            </button>
          ) : null}
        </div>
      </header>

      {(message || error || saveError) && (
        <div className="space-y-2">
          {message ? (
            <p className="rounded-[var(--zeno-radius-sm)] bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-[var(--zeno-radius-sm)] bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </p>
          ) : null}
          {saveError ? (
            <p className="rounded-[var(--zeno-radius-sm)] bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {saveError}
            </p>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          {!draft ? (
            <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)]">
              <p className="text-sm font-semibold">Generate validated content</p>
              <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
                {recommendation
                  ? `Recommended: ${recommendation.recommendedMode === "one_page" ? "one page" : "two pages"} — ${recommendation.reason}`
                  : "Choose a page mode, then generate."}
              </p>
              <div className="mt-3 flex gap-4 text-sm">
                {(
                  [
                    ["one_page", "One page"],
                    ["two_page", "Two pages"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="cv-mode"
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-xs text-[var(--zeno-ink-muted)]">
                Optional emphasis
                <textarea
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm"
                  placeholder="e.g. emphasise internship tooling and reporting"
                />
              </label>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void generateContent(false)}
                className="mt-4 inline-flex h-9 items-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy === "generate" ? "Generating…" : "Generate content"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void generateContent(true)}
                  className="inline-flex h-9 items-center rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {busy === "regenerate" ? "Regenerating…" : "Regenerate content"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !canRender}
                  onClick={() => void renderPdf()}
                  className="inline-flex h-9 items-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === "render"
                    ? "Rendering…"
                    : variant?.status === "ready"
                      ? "Regenerate PDF"
                      : "Generate PDF"}
                </button>
                {canDownload ? (
                  <a
                    href={`/api/cv-tailoring/${variant!.id}/download`}
                    className="inline-flex h-9 items-center rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 text-xs font-semibold"
                  >
                    Download PDF
                  </a>
                ) : null}
              </div>

              {variant?.warnings?.length ? (
                <ul className="space-y-1 rounded-[var(--zeno-radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {variant.warnings.slice(0, 6).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <EditableResume
                draft={draft}
                onChange={queueSave}
                status={variant?.status ?? ""}
              />
            </>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
              Job
            </p>
            <p className="mt-1 text-sm font-semibold">{job?.title}</p>
            <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
              {[job?.organization_name, job?.location, job?.work_mode]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {match ? (
              <p className="mt-2 text-xs text-[var(--zeno-ink-muted)]">
                Evidence fit {Math.round(match.evidenceFitScore)} ·{" "}
                {match.explanation}
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--zeno-warning)]">
                Analyse this job for match coverage before tailoring if possible.
              </p>
            )}
          </div>

          {(variant?.keywordAudit?.length ?? 0) > 0 ? (
            <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
                Requirement coverage
              </p>
              <ul className="mt-2 space-y-1 text-xs text-[var(--zeno-ink-muted)]">
                {variant!.keywordAudit!.slice(0, 12).map((entry) => (
                  <li key={entry.keyword}>
                    <span className="font-medium text-[var(--zeno-ink)]">
                      {entry.keyword}
                    </span>{" "}
                    · {entry.support_state.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function EditableResume({
  draft,
  onChange,
  status,
}: {
  draft: TailoredResume;
  onChange: (next: TailoredResume) => void;
  status: string;
}) {
  return (
    <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-4 md:p-6">
      <div className="mx-auto max-w-[680px] space-y-5 rounded-[6px] border border-[var(--zeno-border)] bg-white px-6 py-7 shadow-[var(--zeno-shadow-sm)]">
        <div>
          <p className="text-lg font-semibold">{draft.contact.fullName}</p>
          <input
            value={draft.targetTitle}
            onChange={(event) =>
              onChange({ ...draft, targetTitle: event.target.value })
            }
            className="mt-1 w-full border-b border-transparent text-sm font-medium text-[var(--zeno-primary)] outline-none focus:border-[var(--zeno-border)]"
          />
          <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
            {[draft.contact.email, draft.contact.phone, draft.contact.location]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-[11px] text-[var(--zeno-ink-faint)]">
            Status: {status.replaceAll("_", " ")}
          </p>
        </div>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
            Summary
          </h3>
          <textarea
            value={draft.summary.text}
            onChange={(event) =>
              onChange({
                ...draft,
                summary: { ...draft.summary, text: event.target.value },
              })
            }
            rows={4}
            className="mt-2 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm leading-relaxed"
          />
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
            Skills
          </h3>
          <div className="mt-2 space-y-2">
            {draft.skills.map((group, groupIndex) => (
              <label key={`${group.category}-${groupIndex}`} className="block text-xs">
                <span className="font-semibold text-[var(--zeno-ink)]">
                  {group.category}
                </span>
                <input
                  value={group.items.join(", ")}
                  onChange={(event) => {
                    const items = event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((item) => item.slice(0, 60));
                    const skills = draft.skills.map((entry, index) =>
                      index === groupIndex
                        ? { ...entry, items: items.length > 0 ? items : entry.items }
                        : entry,
                    );
                    onChange({ ...draft, skills });
                  }}
                  className="mt-1 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
            Experience
          </h3>
          {draft.experience.map((role, roleIndex) => (
            <div key={role.id} className="space-y-2">
              <p className="text-sm font-semibold">
                {role.title} · {role.employer}
              </p>
              {role.bullets.map((bullet, bulletIndex) => (
                <div key={`${role.id}-${bulletIndex}`} className="flex gap-2">
                  <textarea
                    value={bullet.text}
                    onChange={(event) => {
                      const experience = draft.experience.map((entry, index) => {
                        if (index !== roleIndex) return entry;
                        const bullets = entry.bullets.map((item, itemIndex) =>
                          itemIndex === bulletIndex
                            ? { ...item, text: event.target.value }
                            : item,
                        );
                        return { ...entry, bullets };
                      });
                      onChange({ ...draft, experience });
                    }}
                    rows={2}
                    className="w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    className="shrink-0 text-xs text-[var(--zeno-danger)]"
                    onClick={() => {
                      const experience = draft.experience.map((entry, index) => {
                        if (index !== roleIndex) return entry;
                        const bullets = entry.bullets.filter(
                          (_, itemIndex) => itemIndex !== bulletIndex,
                        );
                        return {
                          ...entry,
                          bullets:
                            bullets.length > 0
                              ? bullets
                              : entry.bullets,
                        };
                      });
                      onChange({ ...draft, experience });
                    }}
                  >
                    Del
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-semibold text-[var(--zeno-primary)]"
                onClick={() => {
                  const experience = draft.experience.map((entry, index) => {
                    if (index !== roleIndex) return entry;
                    if (entry.bullets.length >= 6) return entry;
                    return {
                      ...entry,
                      bullets: [
                        ...entry.bullets,
                        {
                          text: "Describe a verified accomplishment in this role.",
                          factIds: ["user_authored"],
                          source: "user_edited" as const,
                        },
                      ],
                    };
                  });
                  onChange({ ...draft, experience });
                }}
              >
                Add bullet
              </button>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
            Projects
          </h3>
          {draft.projects.map((project, projectIndex) => (
            <div key={project.id} className="space-y-2">
              <p className="text-sm font-semibold">{project.name}</p>
              {project.technologies.length > 0 ? (
                <p className="text-xs text-[var(--zeno-ink-muted)]">
                  {project.technologies.join(", ")}
                </p>
              ) : null}
              {project.paragraphs.map((paragraph, paragraphIndex) => (
                <textarea
                  key={`${project.id}-${paragraphIndex}`}
                  value={paragraph.text}
                  onChange={(event) => {
                    const projects = draft.projects.map((entry, index) => {
                      if (index !== projectIndex) return entry;
                      const paragraphs = entry.paragraphs.map(
                        (item, itemIndex) =>
                          itemIndex === paragraphIndex
                            ? { ...item, text: event.target.value }
                            : item,
                      );
                      return { ...entry, paragraphs };
                    });
                    onChange({ ...draft, projects });
                  }}
                  rows={4}
                  className="w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm leading-relaxed"
                />
              ))}
            </div>
          ))}
        </section>

        {draft.education.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-faint)]">
              Education
            </h3>
            {draft.education.map((entry, educationIndex) => (
              <div key={entry.id ?? `${entry.institution}-${educationIndex}`}>
                <p className="text-sm font-semibold">
                  {entry.qualification} · {entry.institution}
                </p>
                <textarea
                  value={(entry.details ?? []).join("\n")}
                  onChange={(event) => {
                    const details = event.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean);
                    const education = draft.education.map((item, index) =>
                      index === educationIndex ? { ...item, details } : item,
                    );
                    onChange({ ...draft, education });
                  }}
                  rows={2}
                  className="mt-1 w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm"
                  placeholder="Optional education details (one per line)"
                />
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
