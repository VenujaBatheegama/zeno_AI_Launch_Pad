"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  JobMatchDetails,
  JobSearchPlan,
  PersistedCareerStageAssessment,
  PersistedCandidateCapabilityProfile,
  RankedJobMatchCard,
} from "../application/ports";
import {
  emptyJobSearchPreferences,
  type DiscoveredJob,
  type EmploymentType,
  type ExperienceLevel,
  type JobSearchPreferences,
  type PreferenceIntent,
  type PreferenceIntentMode,
  type WorkMode,
} from "@/modules/job-discovery/domain/job";

type Props = {
  initialAssessment: PersistedCareerStageAssessment | null;
  initialPlan: JobSearchPlan | null;
  initialMatches: RankedJobMatchCard[];
  initialJobs: DiscoveredJob[];
  initialCapabilityProfile: PersistedCandidateCapabilityProfile | null;
  initialPreferences: JobSearchPreferences | null;
  analysisBatchSize: number;
};

export function CareerIntelligenceWorkspace({
  initialAssessment,
  initialPlan,
  initialMatches,
  initialJobs,
  initialCapabilityProfile,
  initialPreferences,
  analysisBatchSize,
}: Props) {
  void initialAssessment;
  void initialCapabilityProfile;
  const [plan, setPlan] = useState<JobSearchPlan | null>(initialPlan);
  const [matches, setMatches] = useState(initialMatches);
  const [jobs, setJobs] = useState(initialJobs);
  const [savedPreferences, setSavedPreferences] =
    useState<JobSearchPreferences | null>(initialPreferences);
  const [preferences, setPreferences] = useState<JobSearchPreferences>(
    initialPreferences ?? emptyJobSearchPreferences,
  );
  const [prefsOpen, setPrefsOpen] = useState(
    () => !initialPreferences || initialPreferences.roles.length === 0,
  );
  const [recommendedRoles, setRecommendedRoles] = useState<string[]>(
    () => initialPlan?.queries.map((query) => query.queryText) ?? [],
  );
  const prefsDirty = useMemo(
    () =>
      JSON.stringify(preferences) !==
      JSON.stringify(savedPreferences ?? emptyJobSearchPreferences),
    [preferences, savedPreferences],
  );
  const [details, setDetails] = useState<JobMatchDetails | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cvMode, setCvMode] = useState<"one_page" | "two_page">("one_page");
  const [cvContext, setCvContext] = useState("");
  const [cvRecommendation, setCvRecommendation] = useState<{
    recommendedMode: "one_page" | "two_page";
    reason: string;
    warnings: string[];
  } | null>(null);
  const [cvVariant, setCvVariant] = useState<{
    id: string;
    status: string;
    mode: string;
    recommendedMode: string;
    recommendationReason: string;
    warnings: string[];
    targetTitle?: string;
    jobAlignment?: string;
    assessment?: {
      factually_valid: boolean;
      job_alignment: string;
      supported_keywords: string[];
      missing_keywords: string[];
      unsupported_claims: string[];
      warnings: string[];
      generation_status: string;
    } | null;
    selectedProjects: string[];
    selectedExperience: string[];
    keywordAudit: Array<{
      keyword: string;
      support_state: string;
      used: boolean;
      omission_reason: string | null;
      priority: string;
    }>;
    tailoredContent: {
      targetTitle?: string;
      target_title?: string;
      summary:
        | { text: string; factIds?: string[] }
        | { text: string; evidence_refs?: unknown }
        | null;
      skills?: Array<{ category: string; items: string[] }>;
      experience: Array<{
        id?: string;
        career_item_id?: string;
        title?: string;
        employer?: string;
        bullets: Array<{ text: string }>;
      }>;
      projects: Array<{
        id?: string;
        career_item_id?: string;
        name?: string;
        display_title?: string;
        technologies?: string[];
        /** Preferred: continuous project paragraphs. */
        paragraphs?: Array<{ text: string }>;
        /** @deprecated Legacy tailored content used bullets for projects. */
        bullets?: Array<{ text: string }>;
      }>;
      education?: Array<{
        institution: string;
        qualification: string;
      }>;
      references?: Array<{
        id?: string;
        name: string;
        title?: string;
        organization?: string;
        email?: string | null;
        phone?: string | null;
      }>;
      changeNotes?: string[];
      change_notes?: Array<{ career_item_id: string; explanation: string }>;
    } | null;
    pageCount: number | null;
    repairCount: number;
    inputTokens: number | null;
    outputTokens: number | null;
    generationDurationMs: number | null;
    errorMessage: string | null;
  } | null>(null);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const savePreferences = () =>
    run("prefs", async () => {
      const saved = await request<{ preferences: JobSearchPreferences }>(
        "/api/job-preferences",
        {
          method: "PATCH",
          body: JSON.stringify({ preferences }),
        },
      );
      setSavedPreferences(saved.preferences);
      setPreferences(saved.preferences);
      setPrefsOpen(false);
      setMessage("Job preferences saved. Zeno updated your job search setup.");
    });

  const toggleSmartAnalyser = (enabled: boolean) => {
    const next = {
      ...preferences,
      smart_skill_analyser_enabled: enabled,
    };
    setPreferences(next);
    void run("analyser", async () => {
      const saved = await request<{ preferences: JobSearchPreferences }>(
        "/api/job-preferences",
        {
          method: "PATCH",
          body: JSON.stringify({ preferences: next }),
        },
      );
      setSavedPreferences(saved.preferences);
      setPreferences(saved.preferences);
      setMessage(
        enabled
          ? "Smart Skill Analyser enabled. Zeno will consider your career profile on the next search."
          : "Smart Skill Analyser disabled. Searches will use your job preferences only.",
      );
    });
  };

  const executeSearch = () =>
    run("search", async () => {
      if (!savedPreferences || savedPreferences.roles.length === 0) {
        throw new Error(
          "Set a few job preferences so Zeno knows what to look for.",
        );
      }
      if (prefsDirty) {
        throw new Error("Save your preference changes before searching.");
      }
      setMessage("Zeno is preparing your latest job search…");
      const result = await request<{
        jobsFound: number;
        partialFailure: boolean;
        warnings: string[];
        softNotice: string | null;
        preparingMessage: string | null;
        plan: {
          id: string;
          status: string;
          queryCount: number;
          recommendedRoles: string[];
          smartSkillAnalyserEnabled: boolean;
          updatedAt: string;
        };
      }>("/api/career-intelligence/search", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRecommendedRoles(result.plan.recommendedRoles);
      setPlan((current) =>
        current
          ? {
              ...current,
              id: result.plan.id,
              status: result.plan.status as JobSearchPlan["status"],
              smartSkillAnalyserEnabled: result.plan.smartSkillAnalyserEnabled,
              updatedAt: result.plan.updatedAt,
            }
          : current,
      );
      const latestJobs = await request<DiscoveredJob[]>("/api/jobs");
      setJobs(latestJobs);
      const notice = [result.preparingMessage, result.softNotice]
        .filter(Boolean)
        .join(" ");
      setMessage(
        result.jobsFound === 0
          ? `${notice ? `${notice} ` : ""}No matching jobs found. Try adjusting preferences, searching again, or broadening location / work arrangement. ${latestJobs.length} job(s) remain listed.`
          : result.partialFailure
            ? `${notice ? `${notice} ` : ""}Found ${result.jobsFound} new job(s); some queries had warnings. ${latestJobs.length} total listed.`
            : `${notice ? `${notice} ` : ""}Found ${result.jobsFound} new job(s). ${latestJobs.length} total listed.`,
      );
      if (result.warnings.length > 0) {
        setError(result.warnings.slice(0, 4).join(" "));
      }
    });

  const analyseSelected = () =>
    run("analyse", async () => {
      const activeJobs = jobs.filter((job) => job.user_state !== "dismissed");
      const analysableJobs = activeJobs.filter(
        (job) => (job.description?.trim().length ?? 0) >= 80,
      );
      const listingIds =
        selected.length > 0
          ? selected.slice(0, analysisBatchSize)
          : (analysableJobs.length > 0 ? analysableJobs : activeJobs)
              .slice(0, analysisBatchSize)
              .map((job) => job.listing_id);
      if (listingIds.length === 0) {
        throw new Error("Discover jobs first, then analyse a bounded batch.");
      }
      if (
        selected.length === 0 &&
        analysableJobs.length === 0 &&
        activeJobs.length > 0
      ) {
        throw new Error(
          "None of the discovered jobs have a usable description yet. Clear searched jobs and Find jobs again (LinkedIn details are enriched on search), or pick jobs that show a description length.",
        );
      }
      const batch = await request<{
        results: Array<{
          listingId: string;
          match: { evidenceFitScore?: number } | null;
          error?: string;
          errorCategory?: string;
          cacheHit?: boolean;
          analysis?: { status?: string };
        }>;
        ranked?: RankedJobMatchCard[];
      }>("/api/career-intelligence/matches", {
        method: "POST",
        // Reuse cached extractions; requirements are invalidated by description/schema/policy.
        body: JSON.stringify({ listingIds, force: false }),
      });
      let ranked = batch.ranked ?? [];
      if (ranked.length === 0) {
        try {
          ranked = await request<RankedJobMatchCard[]>(
            "/api/career-intelligence/matches",
          );
        } catch {
          // Analyse may have saved results even if the reload timed out.
        }
      }
      setMatches(ranked);
      setDetails(null);
      const failed = batch.results.filter((item) => item.error || !item.match);
      const ok = batch.results.length - failed.length;
      setMessage(
        ranked.length > 0
          ? `Re-analysed ${batch.results.length} job(s): ${ranked.length} shown in ranked results (${ok} matched successfully).`
          : `Re-analysed ${batch.results.length} job(s): ${ok} saved, but none are listed yet. Wait a moment and refresh if Supabase timed out.`,
      );
      if (failed.length > 0) {
        setError(
          `${failed.length} listing(s) could not be analysed. ${failed
            .slice(0, 3)
            .map(
              (item) =>
                item.error ??
                `Listing ${item.listingId.slice(0, 8)}… failed.`,
            )
            .join(" ")}`,
        );
      } else {
        setError(null);
      }
    });

  const clearMatches = () =>
    run("clear", async () => {
      const result = await request<{ removed: number }>(
        "/api/career-intelligence/matches",
        { method: "DELETE" },
      );
      setMatches([]);
      setDetails(null);
      setMessage(
        `Cleared ${result.removed} stored match result(s). Analyse jobs again to rebuild rankings.`,
      );
    });

  const openDetails = (listingId: string) =>
    run("details", async () => {
      const result = await request<JobMatchDetails>(
        `/api/career-intelligence/matches/${listingId}`,
      );
      setDetails(result);
      setCvVariant(null);
      setCvRecommendation(null);
      setCvContext("");
      try {
        const recommendation = await request<{
          recommendedMode: "one_page" | "two_page";
          reason: string;
          warnings: string[];
        }>("/api/cv-tailoring/recommend", {
          method: "POST",
          body: JSON.stringify({ listingId }),
        });
        setCvRecommendation(recommendation);
        setCvMode(recommendation.recommendedMode);
      } catch {
        // Recommendation is optional until analyse/evidence are ready.
      }
      try {
        const existing = await request<{
          variants: Array<{ id: string; status: string }>;
        }>(`/api/cv-tailoring/listing/${listingId}`);
        const reusable = existing.variants.find(
          (item) =>
            item.status === "ready" || item.status === "ready_to_render",
        );
        if (reusable) {
          const loaded = await request<{ variant: NonNullable<typeof cvVariant> }>(
            `/api/cv-tailoring/${reusable.id}`,
          );
          setCvVariant(loaded.variant);
        }
      } catch {
        // No saved variant yet.
      }
    });

  const generateCvContent = () => {
    if (!details) return;
    run("tailor-content", async () => {
      setCvVariant(null);
      const result = await request<{ variant: NonNullable<typeof cvVariant> }>(
        "/api/cv-tailoring",
        {
          method: "POST",
          body: JSON.stringify({
            listingId: details.card.listingId,
            mode: cvMode,
            tailoringContext: cvContext.trim() || null,
            force: true,
          }),
        },
      );
      setCvVariant(result.variant);
      setMessage(
        result.variant.status === "ready_to_render"
          ? "Validated CV content ready — review the preview, then generate the PDF."
          : `CV status: ${result.variant.status}`,
      );
    });
  };

  const renderCvPdf = () => {
    if (!cvVariant) return;
    run("tailor-render", async () => {
      const result = await request<{ variant: NonNullable<typeof cvVariant> }>(
        `/api/cv-tailoring/${cvVariant.id}/render`,
        { method: "POST", body: "{}" },
      );
      setCvVariant(result.variant);
      setMessage(
        result.variant.status === "ready"
          ? `PDF ready (${result.variant.pageCount ?? "?"} page). You can download it.`
          : `CV status: ${result.variant.status}`,
      );
    });
  };

  const toggleSelected = (listingId: string) => {
    setSelected((current) => {
      if (current.includes(listingId)) {
        return current.filter((id) => id !== listingId);
      }
      if (current.length >= analysisBatchSize) {
        setError(
          `You can analyse up to ${analysisBatchSize} jobs at a time. Deselect one to choose another.`,
        );
        return current;
      }
      setError(null);
      return [...current, listingId];
    });
  };

  return (
    <div className="space-y-6">
      {(message || error) && (
        <div className="space-y-2">
          {message && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </p>
          )}
        </div>
      )}

      <section className="space-y-4 rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--zeno-ink)]">
              Job preferences
            </h2>
            <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
              {savedPreferences?.roles.length
                ? `Roles: ${savedPreferences.roles.join(", ")}`
                : "Set a few job preferences so Zeno knows what to look for."}
              {savedPreferences?.locations.length
                ? ` · Locations: ${savedPreferences.locations.join(", ")}`
                : ""}
            </p>
            {prefsDirty ? (
              <p className="mt-1 text-xs font-medium text-amber-800">
                You have unsaved preference changes.
              </p>
            ) : savedPreferences ? (
              <p className="mt-1 text-xs text-[var(--zeno-ink-faint)]">Saved</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setPrefsOpen((open) => !open)}
            className="rounded-md border border-[var(--zeno-border)] px-3 py-2 text-sm font-semibold text-[var(--zeno-ink)]"
          >
            {prefsOpen ? "Hide editor" : "Edit job preferences"}
          </button>
        </div>

        {prefsOpen ? (
          <div className="mt-3 space-y-2.5 border-t border-[var(--zeno-border)] pt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <JobsListInput
                label="Target roles"
                value={preferences.roles}
                placeholder="Software Engineer, Backend Developer"
                onChange={(roles) =>
                  setPreferences((current) => ({ ...current, roles }))
                }
              />
              <JobsListInput
                label="Locations"
                value={preferences.locations}
                placeholder="Colombo, Remote"
                onChange={(locations) =>
                  setPreferences((current) => ({ ...current, locations }))
                }
              />
              <JobsListInput
                label="Technologies"
                value={labelsForMode(preferences.capability_intents, "prefer")}
                placeholder="C#, .NET, React"
                onChange={(labels) =>
                  setPreferences((current) => ({
                    ...current,
                    capability_intents: replaceModeIntents(
                      current.capability_intents,
                      "prefer",
                      labels,
                    ),
                  }))
                }
              />
              <JobsListInput
                label="Exclude"
                value={preferences.excluded_keywords}
                placeholder="Senior, Principal"
                onChange={(excluded_keywords) =>
                  setPreferences((current) => ({
                    ...current,
                    excluded_keywords,
                  }))
                }
              />
            </div>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <JobsChoiceGroup
                label="Work"
                options={[
                  ["onsite", "On-site"],
                  ["hybrid", "Hybrid"],
                  ["remote", "Remote"],
                ]}
                selected={preferences.work_modes}
                onChange={(work_modes) =>
                  setPreferences((current) => ({
                    ...current,
                    work_modes: work_modes as WorkMode[],
                  }))
                }
              />
              <JobsChoiceGroup
                label="Type"
                options={[
                  ["full_time", "Full-time"],
                  ["part_time", "Part-time"],
                  ["contract", "Contract"],
                  ["internship", "Intern"],
                ]}
                selected={preferences.employment_types}
                onChange={(employment_types) =>
                  setPreferences((current) => ({
                    ...current,
                    employment_types: employment_types as EmploymentType[],
                  }))
                }
              />
              <JobsChoiceGroup
                label="Level"
                options={[
                  ["entry", "Entry"],
                  ["mid", "Mid"],
                  ["senior", "Senior"],
                  ["lead", "Lead"],
                ]}
                selected={preferences.experience_levels}
                onChange={(experience_levels) =>
                  setPreferences((current) => ({
                    ...current,
                    experience_levels: experience_levels as ExperienceLevel[],
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={savePreferences}
                disabled={busy !== null || !prefsDirty}
                className="rounded-md bg-[var(--zeno-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy === "prefs" ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreferences(savedPreferences ?? emptyJobSearchPreferences);
                  setPrefsOpen(false);
                }}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-[var(--zeno-ink)]">
              Enable Zeno Smart Skill Analyser
            </h2>
            <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
              When enabled, Zeno considers both your job preferences and the
              skills and experience in your career profile when deciding which
              roles to search for.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-medium text-[var(--zeno-ink)]">
            <span className="sr-only">Enable Zeno Smart Skill Analyser</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={preferences.smart_skill_analyser_enabled}
              checked={preferences.smart_skill_analyser_enabled}
              disabled={busy !== null}
              onChange={(event) => toggleSmartAnalyser(event.target.checked)}
              className="h-5 w-9 cursor-pointer accent-[var(--zeno-primary)]"
            />
            <span>
              {preferences.smart_skill_analyser_enabled ? "On" : "Off"}
              {busy === "analyser" ? " · Saving…" : ""}
            </span>
          </label>
        </div>
        <p className="text-xs text-[var(--zeno-ink-faint)]">
          {preferences.smart_skill_analyser_enabled
            ? "Matching inputs: preferences + eligible career profile evidence."
            : "Matching inputs: explicit job preferences only."}
        </p>
        <p className="text-xs text-[var(--zeno-ink-muted)]">
          Keep your{" "}
          <Link
            href="/app/career-profile"
            className="font-semibold text-[var(--zeno-primary)] hover:underline"
          >
            Career Profile
          </Link>{" "}
          up to date for better recommendations.
        </p>
      </section>

      <section className="space-y-3 rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-[var(--zeno-violet-wash)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--zeno-ink)]">
              Search for jobs
            </h2>
            {recommendedRoles.length > 0 ? (
              <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
                Recommended roles based on your preferences
                {savedPreferences?.smart_skill_analyser_enabled
                  ? " and career profile"
                  : ""}
                : {recommendedRoles.slice(0, 5).join(", ")}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
                Zeno will search using your latest saved preferences.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={executeSearch}
            disabled={
              busy !== null ||
              !savedPreferences ||
              savedPreferences.roles.length === 0 ||
              prefsDirty
            }
            className="rounded-md bg-[var(--zeno-primary)] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[var(--zeno-primary-deep)] disabled:opacity-50"
          >
            {busy === "search" ? "Searching…" : "Search for jobs"}
          </button>
        </div>
      </section>

      <section className="space-y-3 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Analyse selected jobs
            </h2>
            <p className="text-sm text-slate-600">
              {selected.length} of {analysisBatchSize} selected
            </p>
          </div>
          <button
            type="button"
            onClick={analyseSelected}
            disabled={busy !== null || jobs.length === 0}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "analyse"
              ? "Analysing…"
              : `Analyse up to ${analysisBatchSize} jobs`}
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Select up to {analysisBatchSize} jobs. Analysis compares job
          requirements with your career profile — it will not invent skills you
          have not confirmed.
        </p>
        <ul className="space-y-3">
          {jobs
            .filter((job) => job.user_state !== "dismissed")
            .slice(0, 20)
            .map((job) => {
              const checked = selected.includes(job.listing_id);
              const atLimit =
                !checked && selected.length >= analysisBatchSize;
              return (
                <li
                  key={job.listing_id}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atLimit}
                      onChange={() => toggleSelected(job.listing_id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-950">{job.title}</p>
                      <p>
                        {job.organization_name ?? "Unknown company"}
                        {job.location ? ` · ${job.location}` : ""}
                        {job.work_mode ? ` · ${humanize(job.work_mode)}` : ""}
                        {job.employment_type
                          ? ` · ${humanize(job.employment_type)}`
                          : ""}
                      </p>
                      {job.published_at ? (
                        <p className="text-xs text-slate-500">
                          Posted{" "}
                          {new Date(job.published_at).toLocaleDateString()}
                          {job.publisher || job.source_name
                            ? ` · ${job.publisher ?? job.source_name}`
                            : ""}
                        </p>
                      ) : null}
                      {(job.application_url || job.source_url) && (
                        <a
                          href={job.application_url ?? job.source_url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          View or apply
                        </a>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
        </ul>
        {jobs.filter((job) => job.user_state !== "dismissed").length === 0 ? (
          <p className="text-sm text-slate-600">
            No jobs yet. Save preferences, then search for jobs.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Ranked evidence-backed matches
          </h2>
          <button
            type="button"
            onClick={clearMatches}
            disabled={busy !== null || matches.length === 0}
            className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60"
          >
            {busy === "clear" ? "Clearing…" : "Clear match results"}
          </button>
        </div>
        {matches.length === 0 ? (
          <p className="text-sm text-slate-600">
            No current match results. Analyse jobs again after clearing, or if
            older results were invalidated by a matcher update.
          </p>
        ) : (
          <ul className="space-y-4">
            {matches.map((match) => (
              <li
                key={match.listingId}
                className="border-b border-slate-200 pb-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-950">
                      {match.title}
                      {match.organizationName
                        ? ` — ${match.organizationName}`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {match.preferenceTier
                        ? `Preference tier: ${humanize(match.preferenceTier)} · `
                        : ""}
                      {match.evidenceFitScore}% evidence fit · Career level:{" "}
                      {humanize(match.careerLevel)} · Confidence:{" "}
                      {match.confidence}
                      {match.stale ? " · Stale inputs" : ""}
                      {!match.eligible ? " · Hard constraint warning" : ""}
                    </p>
                    {match.personalizationExplanation && (
                      <p className="mt-1 text-sm text-slate-600">
                        Why Zeno ranked this: {match.personalizationExplanation}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-slate-600">
                      Matched: {match.topMatched.join(", ") || "none"}
                    </p>
                    <p className="text-sm text-slate-600">
                      Gaps: {match.primaryGaps.join(", ") || "none"}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {match.explanation}
                    </p>
                    {match.queryProvenance.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Found via: {match.queryProvenance.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {match.applicationUrl && (
                      <a
                        href={match.applicationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
                      >
                        Apply externally
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openDetails(match.listingId)}
                      className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Match details
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {details && (
        <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">
              Match detail
            </h2>
            <button
              type="button"
              onClick={() => setDetails(null)}
              className="text-sm font-semibold text-slate-600"
            >
              Close
            </button>
          </div>
          <p className="text-sm text-slate-700">
            Evidence fit {details.match.evidenceFitScore}% ·{" "}
            {humanize(details.match.careerLevel)} · Confidence{" "}
            {details.match.analysisConfidence}
          </p>
          <p className="text-sm text-slate-600">
            Description quality: {humanize(details.analysis.descriptionQuality)}
            {" · "}
            Opportunity band: {humanize(details.analysis.opportunityBand)}
            {details.card.stale ? " · Analysis is stale" : ""}
          </p>
          {details.match.hardConstraintReasons.length > 0 && (
            <p className="text-sm text-rose-800">
              {details.match.hardConstraintReasons.join(" ")}
            </p>
          )}
          <MatchGroup
            title="Matched"
            items={details.match.matches.filter(
              (item) => item.status === "matched",
            )}
            requirements={details.analysis.requirements}
          />
          <MatchGroup
            title="Partial"
            items={details.match.matches.filter(
              (item) => item.status === "partial",
            )}
            requirements={details.analysis.requirements}
          />
          <MatchGroup
            title="Gaps"
            items={details.match.matches.filter((item) => item.status === "gap")}
            requirements={details.analysis.requirements}
          />
          <MatchGroup
            title="Unknown"
            items={details.match.matches.filter(
              (item) => item.status === "unknown",
            )}
            requirements={details.analysis.requirements}
          />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Score breakdown
            </h3>
            <p className="text-sm text-slate-600">
              Policy {details.match.scoreBreakdown.policy_version}: numerator{" "}
              {details.match.scoreBreakdown.numerator} / denominator{" "}
              {details.match.scoreBreakdown.denominator}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {details.match.scoreBreakdown.contributions.map((item) => (
                <li key={item.requirement_id}>
                  {item.requirement_id.slice(0, 8)}… · {item.importance} ·{" "}
                  {item.status} · weight {item.weight} × credit {item.credit} ={" "}
                  {item.contribution}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Tailor CV</h3>
            {cvRecommendation && (
              <p className="text-sm text-slate-600">
                Recommended: {humanize(cvRecommendation.recommendedMode)}.{" "}
                {cvRecommendation.reason}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cv-mode"
                  checked={cvMode === "one_page"}
                  onChange={() => setCvMode("one_page")}
                />
                One page
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cv-mode"
                  checked={cvMode === "two_page"}
                  onChange={() => setCvMode("two_page")}
                />
                Two pages
              </label>
            </div>
            <label className="block text-sm text-slate-700">
              Optional emphasis (not a factual source)
              <textarea
                value={cvContext}
                onChange={(event) => setCvContext(event.target.value)}
                maxLength={400}
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. Emphasize the Docker project and backend API work"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={generateCvContent}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "tailor-content"
                  ? "Generating content…"
                  : "1. Generate content"}
              </button>
              <button
                type="button"
                disabled={
                  busy !== null ||
                  !cvVariant ||
                  (cvVariant.status !== "ready_to_render" &&
                    cvVariant.status !== "ready")
                }
                onClick={renderCvPdf}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "tailor-render"
                  ? "Rendering PDF…"
                  : "2. Generate PDF"}
              </button>
              {cvVariant?.status === "ready" && (
                <a
                  href={`/api/cv-tailoring/${cvVariant.id}/download`}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
                >
                  Download PDF
                </a>
              )}
            </div>
            {cvVariant && (
              <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  Status: {humanize(cvVariant.status)}
                  {cvVariant.pageCount
                    ? ` · ${cvVariant.pageCount} page(s)`
                    : ""}
                  {cvVariant.generationDurationMs
                    ? ` · ${Math.round(cvVariant.generationDurationMs / 1000)}s`
                    : ""}
                </p>
                {(cvVariant.assessment || cvVariant.jobAlignment) && (
                  <p>
                    Factual validity:{" "}
                    {cvVariant.assessment?.factually_valid === false
                      ? "issues found"
                      : "ok"}
                    {" · "}
                    Job alignment:{" "}
                    {humanize(
                      cvVariant.assessment?.job_alignment ??
                        cvVariant.jobAlignment ??
                        "unknown",
                    )}
                    {cvVariant.assessment?.generation_status
                      ? ` · ${humanize(cvVariant.assessment.generation_status)}`
                      : ""}
                  </p>
                )}
                {cvVariant.assessment &&
                  cvVariant.assessment.missing_keywords.length > 0 && (
                    <p className="text-xs text-slate-600">
                      Missing JD keywords (not blocking):{" "}
                      {cvVariant.assessment.missing_keywords
                        .slice(0, 8)
                        .join(", ")}
                    </p>
                  )}
                {cvVariant.errorMessage && (
                  <p className="text-rose-800">{cvVariant.errorMessage}</p>
                )}
                {cvVariant.warnings.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-amber-900">
                    {cvVariant.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <p>
                  Selected experience: {cvVariant.selectedExperience.length} ·
                  projects: {cvVariant.selectedProjects.length}
                </p>
                <p className="text-xs text-slate-500">
                  Low job fit never blocks CV generation. Validation only checks
                  that claims are truthful. Preview content, then render PDF.
                </p>
                {cvVariant.tailoredContent && (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                    <h4 className="font-semibold text-slate-900">
                      Content preview (validated)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Same structured JSON used for the PDF — not a separate summary model.
                    </p>
                    {(cvVariant.tailoredContent.targetTitle ||
                      cvVariant.tailoredContent.target_title ||
                      cvVariant.targetTitle) && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Target title
                        </p>
                        <p>
                          {cvVariant.tailoredContent.targetTitle ??
                            cvVariant.tailoredContent.target_title ??
                            cvVariant.targetTitle}
                        </p>
                      </div>
                    )}
                    {cvVariant.tailoredContent.summary && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Summary
                        </p>
                        <p>{cvVariant.tailoredContent.summary.text}</p>
                      </div>
                    )}
                    {cvVariant.tailoredContent.skills &&
                      cvVariant.tailoredContent.skills.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            Skills
                          </p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {cvVariant.tailoredContent.skills.map((group) => (
                              <li key={group.category}>
                                <span className="font-medium">{group.category}:</span>{" "}
                                {group.items.join(", ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {cvVariant.tailoredContent.experience.map((item) => (
                      <div key={item.id ?? item.career_item_id}>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Experience
                          {item.title ? ` · ${item.title}` : ""}
                          {item.employer ? ` - ${item.employer}` : ""}
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {item.bullets.map((bullet, index) => (
                            <li
                              key={`${item.id ?? item.career_item_id}-${index}`}
                            >
                              {bullet.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {cvVariant.tailoredContent.projects.map((item) => {
                      const paragraphs =
                        item.paragraphs?.map((paragraph) => paragraph.text) ??
                        item.bullets?.map((bullet) => bullet.text) ??
                        [];
                      return (
                        <div key={item.id ?? item.career_item_id}>
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            Project · {item.name ?? item.display_title}
                          </p>
                          {item.technologies && item.technologies.length > 0 && (
                            <p className="text-xs text-slate-500">
                              {item.technologies.join(", ")}
                            </p>
                          )}
                          <div className="mt-1 space-y-2 text-sm text-slate-700">
                            {paragraphs.map((text, index) => (
                              <p
                                key={`${item.id ?? item.career_item_id}-${index}`}
                              >
                                {text}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {(cvVariant.tailoredContent.references?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          References
                        </p>
                        <div className="mt-1 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2">
                          {cvVariant.tailoredContent.references!.map((referee) => (
                            <div key={referee.id ?? referee.name}>
                              <p className="font-medium">{referee.name}</p>
                              <p className="text-xs text-slate-500">
                                {[referee.title, referee.organization]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              <p className="text-xs text-slate-500">
                                {[referee.email, referee.phone]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(cvVariant.tailoredContent.changeNotes?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Change notes
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                          {cvVariant.tailoredContent.changeNotes!.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <ul className="list-disc space-y-1 pl-5">
                  {cvVariant.keywordAudit
                    .filter(
                      (item) =>
                        item.priority === "must_have" ||
                        item.support_state === "unsupported",
                    )
                    .slice(0, 8)
                    .map((item) => (
                      <li key={`${item.keyword}-${item.support_state}`}>
                        {item.support_state === "unsupported"
                          ? item.omission_reason ??
                            `${item.keyword} unsupported and omitted.`
                          : item.used
                            ? `Used supported keyword “${item.keyword}”.`
                            : `Supported keyword “${item.keyword}” available but not used.`}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function MatchGroup({
  title,
  items,
  requirements,
}: {
  title: string;
  items: Array<{
    requirement_id: string;
    reason: string;
    evidence_ids: string[];
  }>;
  requirements: Array<{ id: string; statement: string }>;
}) {
  if (items.length === 0) return null;
  const byId = new Map(requirements.map((item) => [item.id, item.statement]));
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item.requirement_id}>
            {byId.get(item.requirement_id) ?? item.requirement_id} —{" "}
            {item.reason}
            {item.evidence_ids.length > 0
              ? ` (evidence ${item.evidence_ids
                  .map((id) => id.slice(0, 8))
                  .join(", ")})`
              : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function labelsForMode(
  intents: PreferenceIntent[],
  mode: PreferenceIntentMode,
): string[] {
  return intents
    .filter((item) => item.mode === mode && item.kind === "technology")
    .map((item) => item.label);
}

function replaceModeIntents(
  intents: PreferenceIntent[],
  mode: PreferenceIntentMode,
  labels: string[],
): PreferenceIntent[] {
  const kept = intents.filter(
    (item) => !(item.mode === mode && item.kind === "technology"),
  );
  const next = [...new Set(labels.map((label) => label.trim()).filter(Boolean))].map(
    (label) => ({
      kind: "technology" as const,
      key: label.toLocaleLowerCase().replace(/\s+/gu, "_"),
      label,
      mode,
    }),
  );
  return [...kept, ...next];
}

/** Finalize list values (trim each item, drop empties, dedupe). */
function parsePreferenceList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

/**
 * While typing, keep spaces in the current item.
 * Only completed comma-separated items are fully trimmed.
 */
function livePreferenceList(raw: string): string[] {
  const parts = raw.split(",");
  const items: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    const isLast = index === parts.length - 1;
    if (isLast) {
      // Allow "software engineer" mid-typing; only strip leading spaces.
      const current = part.replace(/^\s+/, "");
      if (current.length > 0) items.push(current);
    } else {
      const completed = part.trim();
      if (completed) items.push(completed);
    }
  }
  return [...new Set(items)].slice(0, 10);
}

function JobsListInput(props: {
  label: string;
  value: string[];
  placeholder: string;
  onChange: (value: string[]) => void;
}) {
  const serialized = props.value.join(", ");
  const [draft, setDraft] = useState(serialized);
  const focusedRef = useRef(false);

  useEffect(() => {
    // Don't clobber in-progress typing when parent re-renders.
    if (focusedRef.current) return;
    setDraft(serialized);
  }, [serialized]);

  return (
    <label className="flex min-w-0 items-center gap-2 text-xs">
      <span className="w-20 shrink-0 font-medium text-slate-600">
        {props.label}
      </span>
      <input
        type="text"
        value={draft}
        placeholder={props.placeholder}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          props.onChange(livePreferenceList(nextDraft));
        }}
        onBlur={() => {
          focusedRef.current = false;
          const next = parsePreferenceList(draft);
          setDraft(next.join(", "));
          props.onChange(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-[var(--zeno-primary)] focus:ring-1 focus:ring-[var(--zeno-primary)]/25"
      />
    </label>
  );
}

function JobsChoiceGroup(props: {
  label: string;
  options: Array<[string, string]>;
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <legend className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {props.label}
        </legend>
        {props.options.map(([value, label]) => {
          const checked = props.selected.includes(value);
          return (
            <label
              key={value}
              className={`inline-flex cursor-pointer items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${
                checked
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-wash)] text-[var(--zeno-primary-deep)]"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => {
                  props.onChange(
                    checked
                      ? props.selected.filter((item) => item !== value)
                      : [...props.selected, value],
                  );
                }}
              />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Request failed.",
    );
  }
  return body as T;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong.";
}
