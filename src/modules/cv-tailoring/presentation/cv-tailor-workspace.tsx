"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";
import { ProgressStepper } from "@/modules/product-shell/progress-stepper";
import { sanitizeJobTitleForCv } from "../domain/content-plan";
import type { TailoredResume } from "../domain/tailored-resume";
import { CvBlockLibrary } from "./cv-block-library";
import { CvPropertiesPanel } from "./cv-properties-panel";
import { EditableCvA4Preview } from "./editable-cv-a4-preview";

const CV_GENERATE_STEPS = [
  {
    id: "prepare",
    title: "Prepare",
    description: "Load verified evidence",
  },
  {
    id: "requirements",
    title: "Requirements",
    description: "Read the job brief",
  },
  {
    id: "select",
    title: "Select",
    description: "Pick strongest proof",
  },
  {
    id: "write",
    title: "Write",
    description: "Draft tailored content",
  },
  {
    id: "validate",
    title: "Validate",
    description: "Check factual claims",
  },
] as const;

const CV_RENDER_STEPS = [
  {
    id: "lock",
    title: "Lock",
    description: "Freeze latest edits",
  },
  {
    id: "layout",
    title: "Layout",
    description: "Fit the page budget",
  },
  {
    id: "render",
    title: "Render",
    description: "Build the PDF",
  },
  {
    id: "save",
    title: "Save",
    description: "Store your download",
  },
] as const;

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

function withCleanTargetTitle(variant: PublicVariant): PublicVariant {
  const content = variant.tailoredContent;
  if (!content?.targetTitle) return variant;
  const cleaned = sanitizeJobTitleForCv(content.targetTitle);
  if (cleaned === content.targetTitle) return variant;
  return {
    ...variant,
    targetTitle: cleaned,
    tailoredContent: {
      ...content,
      targetTitle: cleaned,
    },
  };
}

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
  const [busyElapsedSec, setBusyElapsedSec] = useState(0);
  const [busyStepIndex, setBusyStepIndex] = useState(0);
  const [loadingHint, setLoadingHint] = useState("Loading job and draft…");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prerequisite, setPrerequisite] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Cover Letter Studio States
  const [activeTab, setActiveTab] = useState<"cv" | "cover_letter">("cv");
  const [coverDraft, setCoverDraft] = useState<string | null>(null);
  const [coverMeta, setCoverMeta] = useState<Record<string, unknown>>({});
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverCopied, setCoverCopied] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

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

  // Load existing cover letter draft if present
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/cover-letters/listing/${listingId}`, {
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            draft?: string | null;
            meta?: Record<string, unknown>;
          };
          if (data.draft) {
            setCoverDraft(data.draft);
            setCoverMeta(data.meta ?? {});
          }
        }
      } catch {
        // Non-fatal
      }
    })();
  }, [listingId]);

  async function generateCoverLetter() {
    setCoverBusy(true);
    setCoverError(null);
    try {
      const res = await fetch("/api/cover-letters/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = (await res.json()) as {
        draft?: string;
        meta?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok || !data.draft) {
        throw new Error(data.error ?? "Failed to generate cover letter.");
      }
      setCoverDraft(data.draft);
      setCoverMeta(data.meta ?? {});
      setActiveTab("cover_letter");
    } catch (err) {
      setCoverError(
        err instanceof Error ? err.message : "Cover letter generation failed.",
      );
    } finally {
      setCoverBusy(false);
    }
  }

  async function copyCoverLetter() {
    if (!coverDraft) return;
    try {
      await navigator.clipboard.writeText(coverDraft);
      setCoverCopied(true);
      setTimeout(() => setCoverCopied(false), 2000);
    } catch {
      setCoverError("Failed to copy to clipboard.");
    }
  }

  function downloadCoverLetter() {
    if (!coverDraft) return;
    const blob = new Blob([coverDraft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const titleSlug = (job?.title || "Job").replace(/[^a-zA-Z0-9]/g, "_");
    a.href = url;
    a.download = `Cover_Letter_${titleSlug}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPrerequisite(null);
    setLoadingHint("Checking for an existing CV…");
    try {
      // Fast path: if a ready draft already exists, open it first.
      // Skip recommend + heavy match-detail work until the editor is usable.
      const listingRes = await fetch(`/api/cv-tailoring/listing/${listingId}`, {
        credentials: "same-origin",
      });
      const listingBody = listingRes.ok
        ? ((await listingRes.json()) as {
            variants?: Array<{ id: string; status: string; mode?: string }>;
          })
        : null;
      const variants = listingBody?.variants ?? [];
      const readyVariant = variants.find(
        (item) =>
          item.status === "ready_to_render" || item.status === "ready",
      );

      if (readyVariant) {
        setLoadingHint("Loading existing CV draft…");
        const variantRes = await fetch(`/api/cv-tailoring/${readyVariant.id}`, {
          credentials: "same-origin",
        });
        if (variantRes.ok) {
          const loaded = (await variantRes.json()) as {
            variant: PublicVariant;
          };
          const cleanedVariant = withCleanTargetTitle(loaded.variant);
          setVariant(cleanedVariant);
          draftRef.current = cleanedVariant.tailoredContent;
          setDraft(cleanedVariant.tailoredContent);
          setMode(cleanedVariant.mode);
          setRecommendation({
            recommendedMode: cleanedVariant.recommendedMode,
            reason: cleanedVariant.recommendationReason,
          });
          setLoading(false);
          // Fill job chrome in the background — not required to edit.
          void (async () => {
            try {
              const detailsRes = await fetch(
                `/api/career-intelligence/matches/${listingId}`,
                { credentials: "same-origin" },
              );
              if (!detailsRes.ok) return;
              const details = (await detailsRes.json()) as {
                card: RankedJobMatchCard;
              };
              setMatch(details.card);
              setJob({
                job_id: details.card.jobId,
                listing_id: details.card.listingId,
                title: details.card.title,
                organization_name: details.card.organizationName,
                organization_logo_url: null,
                description: null,
                location: null,
                city: null,
                region: null,
                country: null,
                employment_type: null,
                work_mode: null,
                experience_level: null,
                salary_min: null,
                salary_max: null,
                salary_currency: null,
                salary_period: null,
                published_at: null,
                closing_at: null,
                publisher: null,
                source_name: "listing",
                source_url: null,
                application_url: details.card.applicationUrl,
                application_is_direct: null,
                first_seen_at: new Date().toISOString(),
                last_seen_at: new Date().toISOString(),
                user_state: details.card.userState,
              });
            } catch {
              // Non-fatal — editor already has the draft.
            }
          })();
          return;
        }
      }

      setLoadingHint("Loading job details…");
      const [recommendRes, detailsRes] = await Promise.all([
        fetch("/api/cv-tailoring/recommend", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        }),
        fetch(`/api/career-intelligence/matches/${listingId}`, {
          credentials: "same-origin",
        }),
      ]);

      setLoadingHint("Preparing editor…");

      if (detailsRes.ok) {
        const details = (await detailsRes.json()) as {
          card: RankedJobMatchCard;
        };
        setMatch(details.card);
        setJob({
          job_id: details.card.jobId,
          listing_id: details.card.listingId,
          title: details.card.title,
          organization_name: details.card.organizationName,
          organization_logo_url: null,
          description: null,
          location: null,
          city: null,
          region: null,
          country: null,
          employment_type: null,
          work_mode: null,
          experience_level: null,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          published_at: null,
          closing_at: null,
          publisher: null,
          source_name: "listing",
          source_url: null,
          application_url: details.card.applicationUrl,
          application_is_direct: null,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          user_state: details.card.userState,
        });
      } else {
        setLoadingHint("Looking up discovered job…");
        const jobsRes = await fetch("/api/jobs", { credentials: "same-origin" });
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

      const reusable = variants.find(
        (item) =>
          item.status === "ready_to_render" ||
          item.status === "ready" ||
          item.status === "failed",
      );
      if (reusable) {
        setLoadingHint("Loading draft…");
        const variantRes = await fetch(`/api/cv-tailoring/${reusable.id}`, {
          credentials: "same-origin",
        });
        if (variantRes.ok) {
          const loaded = (await variantRes.json()) as {
            variant: PublicVariant;
          };
          const cleanedVariant = withCleanTargetTitle(loaded.variant);
          setVariant(cleanedVariant);
          draftRef.current = cleanedVariant.tailoredContent;
          setDraft(cleanedVariant.tailoredContent);
          setMode(cleanedVariant.mode);
        }
      }

      if (recommendError && !draftRef.current) {
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
    if (!busy) {
      setBusyElapsedSec(0);
      setBusyStepIndex(0);
      return;
    }
    const started = Date.now();
    setBusyStepIndex(0);
    const tick = window.setInterval(() => {
      setBusyElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 500);

    // Advance through early stages on a timer; hold on the long AI/render step.
    const holdIndex =
      busy === "render" ? 2 : 3; /* write / render is the long step */
    const delays =
      busy === "render" ? [500, 1600, 3200] : [500, 1600, 3200, 6000];
    const timers = delays.map((ms, index) =>
      window.setTimeout(() => {
        setBusyStepIndex((current) =>
          Math.min(Math.max(current, index + 1), holdIndex),
        );
      }, ms),
    );

    return () => {
      window.clearInterval(tick);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [busy]);

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
      setBusyStepIndex(CV_GENERATE_STEPS.length - 1);
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
      setBusyStepIndex(CV_RENDER_STEPS.length - 1);
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
    return (
      <div className="flex items-center gap-3 rounded-[12px] border border-[var(--zeno-border)] bg-white px-4 py-6">
        <span
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--zeno-primary)] border-t-transparent"
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium text-[var(--zeno-ink)]">
            {loadingHint}
          </p>
          <p className="text-xs text-[var(--zeno-ink-faint)]">
            Preparing the tailor workspace…
          </p>
        </div>
      </div>
    );
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
      {/* Top action bar — Lovable-style with Tab Switcher */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--zeno-border)] px-4 py-2.5">
        <Link
          href="/app/cvs/matched"
          className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-xs transition hover:bg-[var(--zeno-surface-sunken)]"
        >
          Back to matched jobs
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--zeno-ink)]">
            {job?.title ?? "Tailor Application"}
          </p>
          <p className="truncate text-xs text-[var(--zeno-ink-muted)]">
            {job?.organization_name ?? "Selected job"}
            {match ? ` · ${Math.round(match.evidenceFitScore)}% match` : ""}
          </p>
        </div>

        {/* Tab switcher: CV vs Cover Letter */}
        <div className="flex items-center rounded-[8px] bg-[var(--zeno-surface-sunken)] p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("cv")}
            className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 transition ${
              activeTab === "cv"
                ? "bg-white font-semibold text-[var(--zeno-ink)] shadow-sm"
                : "text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
            }`}
          >
            <span>📄</span> Tailored CV
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("cover_letter");
              if (!coverDraft && !coverBusy) {
                void generateCoverLetter();
              }
            }}
            className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 transition ${
              activeTab === "cover_letter"
                ? "bg-white font-semibold text-[var(--zeno-ink)] shadow-sm"
                : "text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
            }`}
          >
            <span>✉️</span> Cover Letter
            {coverDraft ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : null}
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {activeTab === "cv" ? (
            <>
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
            </>
          ) : (
            /* Cover Letter Action Buttons */
            <>
              {coverDraft ? (
                <>
                  <button
                    type="button"
                    disabled={coverBusy}
                    onClick={() => void generateCoverLetter()}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-xs transition hover:bg-[var(--zeno-surface-sunken)] disabled:opacity-50"
                  >
                    {coverBusy ? "Regenerating…" : "Regenerate"}
                  </button>
                  <button
                    type="button"
                    onClick={downloadCoverLetter}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-xs transition hover:bg-[var(--zeno-surface-sunken)]"
                  >
                    Export .txt
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyCoverLetter()}
                    className="inline-flex h-8 items-center rounded-[8px] bg-[var(--zeno-primary)] px-3 text-xs font-medium text-white transition hover:bg-[var(--zeno-primary-deep)]"
                  >
                    {coverCopied ? "✓ Copied!" : "Copy to Clipboard"}
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {activeTab === "cv" && (busy === "generate" || busy === "regenerate" || busy === "render") ? (
        <div className="shrink-0 border-b border-[var(--zeno-border)] bg-[var(--zeno-violet-wash)] px-4 py-4">
          <ProgressStepper
            steps={
              busy === "render"
                ? [...CV_RENDER_STEPS]
                : [...CV_GENERATE_STEPS]
            }
            activeIndex={busyStepIndex}
            elapsedSec={busyElapsedSec}
            hint={
              busy === "render"
                ? "building a print-ready PDF"
                : busyElapsedSec >= 20
                  ? "AI drafting can take a while when rate-limited"
                  : "using only your verified career evidence"
            }
          />
        </div>
      ) : null}

      {(message || error || saveError || coverError) && (
        <div className="shrink-0 space-y-1 border-b border-[var(--zeno-border)] px-4 py-2">
          {message ? (
            <p className="rounded-[8px] bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {message}
            </p>
          ) : null}
          {error || coverError ? (
            <p className="rounded-[8px] bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {error ?? coverError}
            </p>
          ) : null}
          {saveError ? (
            <p className="rounded-[8px] bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {saveError}
            </p>
          ) : null}
        </div>
      )}

      {/* Main Content Area: CV Editor vs Cover Letter Studio */}
      {activeTab === "cv" ? (
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
      ) : (
        /* Cover Letter Studio View */
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
          {/* Left Context Column */}
          <aside className="space-y-4 border-r border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-4 overflow-y-auto">
            <div className="rounded-[8px] border border-[var(--zeno-border)] bg-white p-3.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-muted)]">
                Target Role
              </p>
              <h3 className="mt-1 text-sm font-bold text-[var(--zeno-ink)]">
                {job?.title ?? "Selected Job"}
              </h3>
              <p className="text-xs text-[var(--zeno-ink-muted)]">
                {job?.organization_name ?? "Company"}
              </p>
              {match ? (
                <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <span>🎯</span> {Math.round(match.evidenceFitScore)}% Evidence Match
                </div>
              ) : null}
            </div>

            {match?.topMatched && match.topMatched.length > 0 ? (
              <div className="rounded-[8px] border border-[var(--zeno-border)] bg-white p-3.5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  ✓ Matched Strengths
                </p>
                <ul className="mt-2 space-y-1.5 text-xs text-[var(--zeno-ink)]">
                  {match.topMatched.slice(0, 5).map((m, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">•</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {match?.primaryGaps && match.primaryGaps.length > 0 ? (
              <div className="rounded-[8px] border border-[var(--zeno-border)] bg-white p-3.5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                  ⚠️ Handled Gaps
                </p>
                <p className="mt-1 text-[11px] text-[var(--zeno-ink-muted)]">
                  Addressed truthfully without pretending experience you do not have.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {match.primaryGaps.slice(0, 3).map((g, idx) => (
                    <li key={idx}>• {g}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>

          {/* Center Canvas / Textarea Column */}
          <section className="flex flex-col min-h-0 bg-white overflow-hidden">
            {coverBusy ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <span
                  className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-[var(--zeno-primary)] border-t-transparent"
                  aria-hidden
                />
                <p className="mt-4 text-sm font-semibold text-[var(--zeno-ink)]">
                  Synthesizing tailored cover letter…
                </p>
                <p className="mt-1 max-w-sm text-xs text-[var(--zeno-ink-muted)]">
                  Grounding every claim strictly in your verified career profile and addressing role requirements.
                </p>
              </div>
            ) : coverDraft ? (
              <div className="flex flex-col flex-1 min-h-0 p-6 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-[var(--zeno-border)] pb-3 mb-4">
                  <div className="flex items-center gap-3 text-xs text-[var(--zeno-ink-muted)]">
                    <span>
                      Words: <strong>{coverDraft.trim().split(/\s+/).filter(Boolean).length}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Characters: <strong>{coverDraft.length}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyCoverLetter()}
                      className="rounded-[6px] border border-[var(--zeno-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-surface-sunken)] shadow-sm"
                    >
                      {coverCopied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={downloadCoverLetter}
                      className="rounded-[6px] border border-[var(--zeno-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-surface-sunken)] shadow-sm"
                    >
                      ⬇ Download .txt
                    </button>
                  </div>
                </div>

                <textarea
                  value={coverDraft}
                  onChange={(e) => setCoverDraft(e.target.value)}
                  className="flex-1 w-full resize-none font-sans text-sm leading-relaxed text-[var(--zeno-ink)] border-0 focus:ring-0 focus:outline-none bg-transparent"
                  placeholder="Your cover letter text..."
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="max-w-md rounded-[12px] border border-[var(--zeno-border)] bg-white p-6 shadow-sm">
                  <span className="text-3xl">✉️</span>
                  <h3 className="mt-3 text-base font-bold text-[var(--zeno-ink)]">
                    Create a Grounded Cover Letter
                  </h3>
                  <p className="mt-1.5 text-xs text-[var(--zeno-ink-muted)] leading-relaxed">
                    Generate a targeted, high-impact cover letter tailored specifically to {job?.organization_name ? `${job.title} at ${job.organization_name}` : "this job"}, truthful to your verified profile.
                  </p>
                  <button
                    type="button"
                    disabled={coverBusy}
                    onClick={() => void generateCoverLetter()}
                    className="mt-4 inline-flex h-9 items-center rounded-[8px] bg-[var(--zeno-primary)] px-4 text-xs font-semibold text-white hover:bg-[var(--zeno-primary-deep)] transition"
                  >
                    Generate Cover Letter
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right Guidance Column */}
          <aside className="border-l border-[var(--zeno-border)] bg-white p-4 overflow-y-auto space-y-4">
            <div className="rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3.5">
              <p className="text-xs font-bold text-[var(--zeno-ink)]">
                🛡 Grounded in Evidence
              </p>
              <p className="mt-1 text-[11px] text-[var(--zeno-ink-muted)] leading-relaxed">
                Zeno only references projects, achievements, and metrics that exist in your verified profile. Never fake credentials or invent experiences.
              </p>
            </div>

            <div className="rounded-[8px] border border-[var(--zeno-border)] bg-white p-3.5 shadow-sm">
              <p className="text-xs font-bold text-[var(--zeno-ink)]">
                💡 Application Tips
              </p>
              <ul className="mt-2 space-y-2 text-xs text-[var(--zeno-ink-muted)] leading-relaxed">
                <li>• <strong>Target 250–350 words</strong>: Keep your cover letter punchy and easy to scan.</li>
                <li>• <strong>Highlight 2 top achievements</strong>: Focus on concrete outcomes and relevant tech stack.</li>
                <li>• <strong>Align with company mission</strong>: Customize the opening paragraph with why this specific team excites you.</li>
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
