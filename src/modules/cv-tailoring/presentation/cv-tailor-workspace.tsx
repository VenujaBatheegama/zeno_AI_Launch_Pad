"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";
import type { TailoredResume } from "../domain/tailored-resume";
import { CvBlockLibrary } from "./cv-block-library";
import { CvPropertiesPanel } from "./cv-properties-panel";
import { EditableCvA4Preview } from "./editable-cv-a4-preview";

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
  sectionOrder?: string[];
  earlyCareer?: boolean;
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

  const draftRef = useRef<TailoredResume | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while a PATCH is in flight — keeps saves serialized. */
  const saveLockedRef = useRef(false);
  /** Set when edits arrive during an in-flight save so we flush again after. */
  const pendingSaveRef = useRef(false);
  const saveStateRef = useRef<SaveState>("idle");
  const variantRef = useRef<PublicVariant | null>(null);
  const saveInFlightRef = useRef<Promise<{
    ok: boolean;
    variant: PublicVariant | null;
  }> | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

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
            draftRef.current = loaded.variant.tailoredContent;
            setDraft(loaded.variant.tailoredContent);
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

  async function persistLatest(): Promise<{
    ok: boolean;
    variant: PublicVariant | null;
  }> {
    const currentVariant = variantRef.current;
    const content = draftRef.current;
    if (!currentVariant || !content) {
      return { ok: false, variant: null };
    }

    setSaveState("saving");
    setSaveError(null);
    try {
      const response = await fetch(`/api/cv-tailoring/${currentVariant.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tailoredContent: content }),
      });
      const body = (await response.json()) as {
        variant?: PublicVariant;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save CV edits.");
      }
      if (!body.variant) throw new Error("Save returned no variant.");

      setVariant(body.variant);
      // Only sync draft from server when the user has not typed further.
      if (draftRef.current === content) {
        setDraft(body.variant.tailoredContent);
        setSaveState("saved");
      } else {
        setSaveState("unsaved");
        pendingSaveRef.current = true;
      }
      return { ok: true, variant: body.variant };
    } catch (persistError) {
      setSaveState("error");
      setSaveError(
        persistError instanceof Error
          ? persistError.message
          : "Could not save CV edits.",
      );
      return { ok: false, variant: variantRef.current };
    }
  }

  async function runSaveLoop(): Promise<{
    ok: boolean;
    variant: PublicVariant | null;
  }> {
    if (saveLockedRef.current) {
      pendingSaveRef.current = true;
      return (
        saveInFlightRef.current ?? {
          ok: true,
          variant: variantRef.current,
        }
      );
    }

    saveLockedRef.current = true;
    const promise = (async () => {
      let last: { ok: boolean; variant: PublicVariant | null } = {
        ok: true,
        variant: variantRef.current,
      };
      try {
        do {
          pendingSaveRef.current = false;
          last = await persistLatest();
          if (!last.ok) return last;
        } while (pendingSaveRef.current);
        return last;
      } finally {
        saveLockedRef.current = false;
        saveInFlightRef.current = null;
        // Catch edits that arrived after the last pendingSave check.
        if (pendingSaveRef.current) {
          void runSaveLoop();
        }
      }
    })();

    saveInFlightRef.current = promise;
    return promise;
  }

  function queueSave(next: TailoredResume) {
    draftRef.current = next;
    setDraft(next);
    setSaveState("unsaved");
    pendingSaveRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void runSaveLoop();
    }, 800);
  }

  async function flushSave(): Promise<{
    ok: boolean;
    variant: PublicVariant | null;
  }> {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (
      saveStateRef.current === "idle" ||
      saveStateRef.current === "saved"
    ) {
      return { ok: true, variant: variantRef.current };
    }
    pendingSaveRef.current = true;
    return runSaveLoop();
  }

  async function generateContent(force: boolean) {
    if (force) {
      const hasLocalEdits =
        saveStateRef.current === "unsaved" ||
        saveStateRef.current === "saving" ||
        saveStateRef.current === "error" ||
        saveStateRef.current === "saved";
      const confirmed = window.confirm(
        hasLocalEdits
          ? "Regenerate replaces this CV from your career profile. Edits saved on this CV will be discarded. Continue?"
          : "Regenerate replaces this CV from your career profile. Continue?",
      );
      if (!confirmed) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingSaveRef.current = false;
      if (saveInFlightRef.current) {
        await saveInFlightRef.current;
      }
    }

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
      draftRef.current = body.variant.tailoredContent;
      setVariant(body.variant);
      setDraft(body.variant.tailoredContent);
      setSaveState("idle");
      pendingSaveRef.current = false;
      setMessage(
        body.variant.status === "ready_to_render"
          ? force
            ? "CV regenerated from your profile. Edits apply to this CV only."
            : "CV ready — edit freely, then Save or Download. Edits stay on this CV only."
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

  async function renderPdf(): Promise<PublicVariant | null> {
    if (!variant) return null;
    setBusy("render");
    setError(null);
    const flushed = await flushSave();
    if (!flushed.ok) {
      setError("Save your edits before generating the PDF.");
      setBusy(null);
      return null;
    }
    const id = flushed.variant?.id ?? variant.id;
    try {
      const response = await fetch(`/api/cv-tailoring/${id}/render`, {
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
      setSaveState("saved");
      setMessage(
        body.variant.status === "ready"
          ? `PDF ready (${body.variant.pageCount ?? "?"} page). You can download it.`
          : `CV status: ${body.variant.status}`,
      );
      return body.variant;
    } catch (renderError) {
      setError(
        renderError instanceof Error
          ? renderError.message
          : "PDF render failed.",
      );
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** Flush edits, ensure PDF is rendered from latest content, then download. */
  async function downloadPdf() {
    if (!variant) return;
    setBusy("download");
    setError(null);
    try {
      const flushed = await flushSave();
      if (!flushed.ok || !flushed.variant) {
        setError("Save your edits before downloading.");
        return;
      }
      let ready = flushed.variant;
      if (ready.status !== "ready") {
        const response = await fetch(`/api/cv-tailoring/${ready.id}/render`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const body = (await response.json()) as {
          variant?: PublicVariant;
          error?: string;
        };
        if (!response.ok || !body.variant) {
          throw new Error(body.error ?? "Could not render the latest CV before download.");
        }
        ready = body.variant;
        setVariant(body.variant);
        setSaveState("saved");
      }
      if (ready.status !== "ready") {
        setError("PDF is not ready to download yet.");
        return;
      }
      const link = document.createElement("a");
      link.href = `/api/cv-tailoring/${ready.id}/download`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Download failed.",
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

  const canDownload =
    Boolean(variant) &&
    (variant?.status === "ready" || variant?.status === "ready_to_render") &&
    saveState !== "error";
  const canRender =
    variant &&
    draft &&
    (variant.status === "ready_to_render" ||
      variant.status === "ready" ||
      (variant.status === "failed" && Boolean(variant.tailoredContent)));

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Top action bar — Lovable-style */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--zeno-border)] px-4 py-2.5">
        <Link
          href="/app/cvs/matched"
          className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-xs transition hover:bg-[var(--zeno-surface-sunken)]"
        >
          Back to matched jobs
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--zeno-ink)]">
            {job?.title ?? "Tailor CV"}
          </p>
          <p className="truncate text-xs text-[var(--zeno-ink-muted)]">
            {job?.organization_name ?? "Selected job"}
            {match ? ` · ${Math.round(match.evidenceFitScore)}% match` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--zeno-ink-muted)]">
            {saveState === "unsaved"
              ? "Unsaved changes"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "saved" || saveState === "idle"
                  ? "All changes saved"
                  : saveState === "error"
                    ? "Save failed"
                    : ""}
          </span>
          {saveState === "error" ? (
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--zeno-danger)] underline"
              onClick={() => {
                if (!draftRef.current) return;
                pendingSaveRef.current = true;
                void runSaveLoop();
              }}
            >
              Retry
            </button>
          ) : null}
          {draft ? (
            <>
              <button
                type="button"
                disabled={
                  busy !== null ||
                  saveState === "saving" ||
                  saveState === "idle" ||
                  saveState === "saved"
                }
                onClick={() => {
                  void (async () => {
                    const result = await flushSave();
                    if (result.ok) {
                      setMessage("CV saved. Your career profile was not changed.");
                    }
                  })();
                }}
                className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-xs font-medium transition hover:bg-[var(--zeno-surface-sunken)] disabled:opacity-50"
              >
                {saveState === "saving" ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void generateContent(true)}
                className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-xs transition hover:bg-[var(--zeno-surface-sunken)] disabled:opacity-50"
              >
                {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
              </button>
              <button
                type="button"
                disabled={busy !== null || !canRender}
                onClick={() => void renderPdf()}
                className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-xs transition hover:bg-[var(--zeno-surface-sunken)] disabled:opacity-50"
              >
                {busy === "render"
                  ? "Rendering…"
                  : variant?.status === "ready"
                    ? "Regenerate PDF"
                    : "Generate PDF"}
              </button>
              {canDownload ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void downloadPdf()}
                  className="inline-flex h-8 items-center rounded-[8px] bg-[var(--zeno-primary)] px-3 text-xs font-medium text-white transition hover:bg-[var(--zeno-primary-deep)] disabled:opacity-50"
                >
                  {busy === "download" ? "Preparing…" : "Download"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {(message || error || saveError) && (
        <div className="shrink-0 space-y-1 border-b border-[var(--zeno-border)] px-4 py-2">
          {message ? (
            <p className="rounded-[8px] bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-[8px] bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {error}
            </p>
          ) : null}
          {saveError ? (
            <p className="rounded-[8px] bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {saveError}
            </p>
          ) : null}
        </div>
      )}

      {/* Three-column editor: library | canvas | properties */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_288px]">
        {draft ? (
          <CvBlockLibrary
            draft={draft}
            sectionOrder={variant?.sectionOrder}
          />
        ) : (
          <div className="hidden border-r border-[var(--zeno-border)] bg-white lg:block" />
        )}

        <section className="min-h-0 min-w-0 overflow-hidden">
          {!draft ? (
            <div className="cv-dotted-canvas flex h-full items-start justify-center overflow-y-auto p-8 md:p-12">
              <div className="w-full max-w-lg rounded-[10px] border border-[var(--zeno-border)] bg-white p-6 shadow-[var(--zeno-shadow-sm)]">
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
                    className="mt-1 w-full rounded-[8px] border border-[var(--zeno-border)] px-3 py-2 text-sm"
                    placeholder="e.g. emphasise internship tooling and reporting"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void generateContent(false)}
                  className="mt-4 inline-flex h-9 items-center rounded-[8px] bg-[var(--zeno-primary)] px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === "generate" ? "Generating…" : "Generate content"}
                </button>
              </div>
            </div>
          ) : (
            <EditableCvA4Preview
              draft={draft}
              mode={variant?.mode ?? mode}
              sectionOrder={variant?.sectionOrder}
              status={variant?.status ?? ""}
              onChange={queueSave}
            />
          )}
        </section>

        {draft ? (
          <CvPropertiesPanel
            draft={draft}
            onChange={queueSave}
            job={job}
            match={match}
            mode={variant?.mode ?? mode}
          />
        ) : (
          <div className="hidden border-l border-[var(--zeno-border)] bg-white lg:block" />
        )}
      </div>
    </div>
  );
}
