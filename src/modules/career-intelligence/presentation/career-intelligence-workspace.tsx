"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  JobSearchPlan,
  PersistedCareerStageAssessment,
  RankedJobMatchCard,
} from "../application/ports";
import {
  emptyJobSearchPreferences,
  type DiscoveredJob,
  type EmploymentType,
  type ExperienceLevel,
  type JobSearchPreferences,
  type WorkMode,
} from "@/modules/job-discovery/domain/job";
import { ProgressStepper } from "@/modules/product-shell/progress-stepper";
import { FreshJobWatchPanel } from "@/modules/career-campaign/presentation/fresh-job-watch-panel";
import type { FreshJobWatchStatusView } from "@/modules/career-campaign/domain/fresh-watch";

type Props = {
  initialAssessment: PersistedCareerStageAssessment | null;
  initialPlan: JobSearchPlan | null;
  initialMatches: RankedJobMatchCard[];
  initialJobs: DiscoveredJob[];
  initialPreferences: JobSearchPreferences | null;
  analysisBatchSize: number;
  initialFreshWatch: FreshJobWatchStatusView;
};

const JOB_SEARCH_STEPS = [
  {
    id: "prepare",
    title: "Prepare",
    description: "Clear prior results",
  },
  {
    id: "search",
    title: "Search",
    description: "Query job sources",
  },
  {
    id: "collect",
    title: "Collect",
    description: "Load discovered roles",
  },
  {
    id: "analyse",
    title: "Analyse",
    description: "Match your evidence",
  },
  {
    id: "rank",
    title: "Rank",
    description: "Order best fits",
  },
] as const;

function searchStepIndex(
  phase:
    | null
    | "preparing"
    | "searching"
    | "loading_jobs"
    | "analysing"
    | "ranking",
): number {
  if (phase === "ranking") return 4;
  if (phase === "analysing") return 3;
  if (phase === "loading_jobs") return 2;
  if (phase === "searching") return 1;
  return 0;
}

export function CareerIntelligenceWorkspace({
  initialAssessment,
  initialPlan,
  initialMatches,
  initialJobs,
  initialPreferences,
  analysisBatchSize,
  initialFreshWatch,
}: Props) {
  void initialAssessment;
  const [, setPlan] = useState<JobSearchPlan | null>(initialPlan);
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
  const [excludedTitles] = useState<string[]>([]);
  const [recommendedRoles, setRecommendedRoles] = useState<string[]>(
    () => initialPlan?.queries.map((query) => query.queryText) ?? [],
  );
  const prefsDirty = useMemo(
    () =>
      JSON.stringify(preferences) !==
      JSON.stringify(savedPreferences ?? emptyJobSearchPreferences),
    [preferences, savedPreferences],
  );
  const [resultQuery, setResultQuery] = useState("");
  const [filterPosted, setFilterPosted] = useState<
    "any" | "day" | "week" | "month"
  >("any");
  const [busy, setBusy] = useState<string | null>(null);
  const [searchPhase, setSearchPhase] = useState<
    null | "preparing" | "searching" | "loading_jobs" | "analysing" | "ranking"
  >(null);
  const [searchElapsedSec, setSearchElapsedSec] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const resultLimit = Math.min(10, analysisBatchSize);

  const jobsByListingId = useMemo(() => {
    const map = new Map<string, DiscoveredJob>();
    for (const job of jobs) map.set(job.listing_id, job);
    return map;
  }, [jobs]);

  const filteredMatches = useMemo(() => {
    const q = resultQuery.trim().toLowerCase();
    return matches
      .slice(0, resultLimit)
      .filter((match) => {
        const job = jobsByListingId.get(match.listingId);
        if (filterPosted !== "any" && job?.published_at) {
          const ageMs = Date.now() - new Date(job.published_at).getTime();
          const day = 86_400_000;
          const max =
            filterPosted === "day"
              ? day
              : filterPosted === "week"
                ? 7 * day
                : 30 * day;
          if (Number.isFinite(ageMs) && ageMs > max) return false;
        }
        if (!q) return true;
        return (
          match.title.toLowerCase().includes(q) ||
          (match.organizationName ?? "").toLowerCase().includes(q) ||
          match.topMatched.some((item) => item.toLowerCase().includes(q)) ||
          match.explanation.toLowerCase().includes(q)
        );
      });
  }, [matches, resultLimit, jobsByListingId, filterPosted, resultQuery]);

  const analyseListings = async (listingIds: string[]) => {
    if (listingIds.length === 0) return;
    const batch = await request<{
      results: Array<{
        listingId: string;
        match: { evidenceFitScore?: number } | null;
        error?: string;
      }>;
      ranked?: RankedJobMatchCard[];
    }>("/api/career-intelligence/matches", {
      method: "POST",
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
    const failed = batch.results.filter((item) => item.error || !item.match);
    const ok = batch.results.length - failed.length;
    if (failed.length > 0) {
      const uniqueErrors = [
        ...new Set(
          failed.map(
            (item) =>
              item.error ?? `Listing ${item.listingId.slice(0, 8)}… failed.`,
          ),
        ),
      ].slice(0, 3);
      setError(
        `${failed.length} listing(s) could not be analysed. ${uniqueErrors.join(" ")}`,
      );
    }
    return { ok, total: batch.results.length, rankedCount: ranked.length };
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
      const started = Date.now();
      const tick = window.setInterval(() => {
        setSearchElapsedSec(Math.floor((Date.now() - started) / 1000));
      }, 500);
      try {
        setSearchPhase("preparing");
        setSearchElapsedSec(0);
        setMessage("Starting a fresh search…");
        // Clear prior results immediately so the list does not stack old cards
        // while the new search runs.
        setMatches([]);
        setJobs((current) =>
          current.filter((job) => job.user_state === "saved"),
        );
        setSearchPhase("searching");
        setMessage("Searching job sources…");
        const result = await request<{
          jobsFound: number;
          partialFailure: boolean;
          warnings: string[];
          softNotice: string | null;
          preparingMessage: string | null;
          alsoSearchFor: string[];
          plan: {
            id: string;
            status: string;
            queryCount: number;
            recommendedRoles: string[];
            alsoSearchFor: string[];
            updatedAt: string;
          };
        }>("/api/career-intelligence/search", {
          method: "POST",
          body: JSON.stringify({ excludedTitles }),
        });
        setRecommendedRoles(result.plan.recommendedRoles);
        setPlan((current) =>
          current
            ? {
                ...current,
                id: result.plan.id,
                status: result.plan.status as JobSearchPlan["status"],
                updatedAt: result.plan.updatedAt,
              }
            : current,
        );
        setSearchPhase("loading_jobs");
        setMessage(`Found ${result.jobsFound} job(s). Loading your list…`);
        const latestJobs = await request<DiscoveredJob[]>("/api/jobs");
        setJobs(latestJobs);

        const activeJobs = latestJobs.filter(
          (job) => job.user_state !== "dismissed",
        );
        const analysableJobs = activeJobs.filter(
          (job) => (job.description?.trim().length ?? 0) >= 80,
        );
        const listingIds = (
          analysableJobs.length > 0 ? analysableJobs : activeJobs
        )
          .slice(0, resultLimit)
          .map((job) => job.listing_id);

        const notice = [result.preparingMessage, result.softNotice]
          .filter(Boolean)
          .join(" ");

        if (listingIds.length === 0) {
          setMatches([]);
          setMessage(
            result.jobsFound === 0
              ? `${notice ? `${notice} ` : ""}No matching jobs found. Try adjusting preferences or broadening location / work arrangement.`
              : `${notice ? `${notice} ` : ""}Found ${result.jobsFound} job(s), but none were ready to analyse yet.`,
          );
        } else {
          setSearchPhase("analysing");
          setMessage(
            `${notice ? `${notice} ` : ""}Found ${result.jobsFound} job(s). Analysing the top ${listingIds.length} (AI extraction can take a minute)…`,
          );
          const analysed = await analyseListings(listingIds);
          setSearchPhase("ranking");
          setMessage(
            analysed && analysed.rankedCount > 0
              ? `Found ${result.jobsFound} job(s). Showing ${Math.min(analysed.rankedCount, resultLimit)} analysed matches, ordered by relevance.`
              : `Found ${result.jobsFound} job(s). Analysis finished for ${analysed?.ok ?? 0}/${analysed?.total ?? 0}; ranked results may still be catching up.`,
          );
        }

        if (result.warnings.length > 0) {
          setError(result.warnings.slice(0, 4).join(" "));
        }
      } finally {
        window.clearInterval(tick);
        setSearchPhase(null);
      }
    });

  const clearMatches = () =>
    run("clear", async () => {
      const result = await request<{ removed: number }>(
        "/api/career-intelligence/matches",
        { method: "DELETE" },
      );
      setMatches([]);
      setMessage(
        `Cleared ${result.removed} stored match result(s). Find new jobs to rebuild rankings.`,
      );
    });

  const setJobSaved = (listingId: string, saved: boolean) =>
    run("save", async () => {
      await request(`/api/jobs/${listingId}/state`, {
        method: "PATCH",
        body: JSON.stringify({ state: saved ? "saved" : "discovered" }),
      });
      setJobs((current) =>
        current.map((job) =>
          job.listing_id === listingId
            ? { ...job, user_state: saved ? "saved" : "discovered" }
            : job,
        ),
      );
      setMatches((current) =>
        current.map((match) =>
          match.listingId === listingId
            ? { ...match, userState: saved ? "saved" : "discovered" }
            : match,
        ),
      );
    });

  const savedSearchSummary = useMemo(() => {
    if (!savedPreferences || savedPreferences.roles.length === 0) return null;
    const parts = [
      savedPreferences.roles.join(" / "),
      savedPreferences.locations.length > 0
        ? savedPreferences.locations.join(" and ")
        : null,
      savedPreferences.work_modes.length > 0
        ? `${savedPreferences.work_modes.map(humanize).join(", ")} preferred`
        : null,
      savedPreferences.preferred_interests.length > 0
        ? savedPreferences.preferred_interests.join(", ")
        : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [savedPreferences]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.35rem] leading-none tracking-[-0.03em] text-[var(--zeno-ink)]">
            Jobs
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
            Roles Zeno has analysed against your verified profile. Nothing is
            applied for automatically.
          </p>
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
          className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white shadow-[var(--zeno-shadow-sm)] hover:bg-[var(--zeno-primary-deep)] disabled:opacity-50"
        >
          {busy === "search"
            ? searchPhase === "analysing"
              ? `Analysing… ${searchElapsedSec}s`
              : searchPhase === "loading_jobs"
                ? `Loading jobs… ${searchElapsedSec}s`
                : `Searching… ${searchElapsedSec}s`
            : "Find new jobs"}
        </button>
      </header>

      {busy === "search" ? (
        <ProgressStepper
          steps={[...JOB_SEARCH_STEPS]}
          activeIndex={searchStepIndex(searchPhase)}
          elapsedSec={searchElapsedSec}
          hint={
            searchPhase === "analysing"
              ? "analysis is the slow step when Groq is rate-limited"
              : searchPhase === "searching"
                ? "checking LinkedIn, JSearch, TheirStack and ITPro"
                : null
          }
        />
      ) : null}

      <FreshJobWatchPanel
        initialStatus={initialFreshWatch}
        defaultRole={
          preferences.roles[0] ?? savedPreferences?.roles[0] ?? ""
        }
        defaultLocation={
          preferences.locations[0] ??
          savedPreferences?.locations[0] ??
          (preferences.work_modes.includes("remote") ||
          savedPreferences?.work_modes.includes("remote") ||
          !preferences.work_modes.length
            ? "Remote"
            : "")
        }
        defaultWorkMode={
          preferences.work_modes[0] ?? savedPreferences?.work_modes[0] ?? "any"
        }
      />

      {(message || error) && (
        <div className="space-y-2">
          {message && (
            <p className="rounded-[10px] bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-[10px] bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </p>
          )}
        </div>
      )}

      <section className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--zeno-ink-faint)]">
              Saved search
            </p>
            <p className="mt-1 text-[13px] text-[var(--zeno-ink)]">
              {savedSearchSummary ??
                "Set a few job preferences so Zeno knows what to look for."}
            </p>
            {prefsDirty ? (
              <p className="mt-1 text-xs font-medium text-amber-800">
                You have unsaved preference changes.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setPrefsOpen((open) => !open)}
            className="shrink-0 text-[13px] font-semibold text-[var(--zeno-primary)] hover:underline"
          >
            {prefsOpen ? "Hide preferences" : "Edit preferences"}
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
                label="Exclude titles"
                value={preferences.excluded_keywords}
                placeholder="Senior, Principal"
                onChange={(excluded_keywords) =>
                  setPreferences((current) => ({
                    ...current,
                    excluded_keywords,
                  }))
                }
              />
              <JobsListInput
                label="Preferred interests"
                value={preferences.preferred_interests}
                placeholder="Java, mentoring"
                onChange={(preferred_interests) =>
                  setPreferences((current) => ({
                    ...current,
                    preferred_interests,
                  }))
                }
              />
              <JobsListInput
                label="Excluded interests"
                value={preferences.excluded_interests}
                placeholder="sales"
                onChange={(excluded_interests) =>
                  setPreferences((current) => ({
                    ...current,
                    excluded_interests,
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

      {/* Posted-time filter bar */}
      <section className="rounded-[14px] border border-[var(--zeno-border)] bg-white px-4 py-3 shadow-[var(--zeno-shadow-sm)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
            Posted
          </span>
          {(
            [
              ["any", "Any time"],
              ["day", "Last 24 hours"],
              ["week", "Last week"],
              ["month", "Last month"],
            ] as const
          ).map(([value, label]) => {
            const active = filterPosted === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFilterPosted(value)}
                className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium transition ${
                  active
                    ? "bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)]"
                    : "border border-[var(--zeno-border)] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="relative block w-full max-w-md">
            <span className="sr-only">Search role, company or skill</span>
            <input
              type="search"
              value={resultQuery}
              onChange={(event) => setResultQuery(event.target.value)}
              placeholder="Search role, company or skill"
              className="h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] outline-none placeholder:text-[var(--zeno-ink-faint)] focus:border-[var(--zeno-border-hover)]"
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-full border border-[var(--zeno-border)] bg-white px-3 text-[12px] font-medium text-[var(--zeno-ink-muted)]">
              Best match
            </span>
            <button
              type="button"
              onClick={clearMatches}
              disabled={busy !== null || matches.length === 0}
              className="text-[12px] font-semibold text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] disabled:opacity-50"
            >
              {busy === "clear" ? "Clearing…" : "Clear results"}
            </button>
          </div>
        </div>

        {recommendedRoles.length > 0 ? (
          <p className="text-[12px] text-[var(--zeno-ink-faint)]">
            Searching titles from your preferences:{" "}
            {recommendedRoles.slice(0, 5).join(", ")}
          </p>
        ) : null}

        {filteredMatches.length === 0 ? (
          <p className="rounded-[14px] border border-[var(--zeno-border)] bg-white px-4 py-8 text-center text-sm text-[var(--zeno-ink-muted)]">
            {matches.length === 0
              ? "No analysed jobs yet. Save preferences, then find new jobs — Zeno will search and rank the top matches for you."
              : "No jobs match those filters."}
          </p>
        ) : (
          <ul className="space-y-3">
            {filteredMatches.map((match) => {
              const job = jobsByListingId.get(match.listingId);
              const saved = match.userState === "saved";
              const meta = [
                match.organizationName,
                job?.location,
                job?.work_mode ? humanize(job.work_mode) : null,
                job?.published_at ? relativePosted(job.published_at) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={match.listingId}
                  className="rounded-[14px] border border-[var(--zeno-border)] bg-white p-4 shadow-[var(--zeno-shadow-sm)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--zeno-ink)]">
                        {match.title}
                        {match.organizationName
                          ? ` | ${match.organizationName}`
                          : ""}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--zeno-ink-muted)]">
                        {meta}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">
                      {Math.round(match.evidenceFitScore)}% match
                    </span>
                  </div>

                  <p className="mt-3 text-[13px] leading-relaxed text-[var(--zeno-ink)]">
                    {match.explanation}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[...new Set(match.topMatched)].slice(0, 6).map((skill, index) => (
                      <span
                        key={`${match.listingId}-matched-${index}`}
                        className="rounded-full bg-[var(--zeno-surface-sunken)] px-2.5 py-1 text-[11px] font-medium text-[var(--zeno-ink-muted)]"
                      >
                        {skill}
                      </span>
                    ))}
                    {!match.eligible ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                        Constraint warning
                      </span>
                    ) : null}
                    {match.stale ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                        Stale analysis
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {match.applicationUrl ? (
                      <a
                        href={match.applicationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center rounded-[8px] border border-[var(--zeno-border)] px-3 text-[12px] font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-violet-wash)]"
                      >
                        View job
                      </a>
                    ) : null}
                    <a
                      href={`/app/cvs/tailor/${match.listingId}`}
                      className="text-[12px] font-semibold text-[var(--zeno-primary)] hover:underline"
                    >
                      Tailor CV
                    </a>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setJobSaved(match.listingId, !saved)}
                      className={`ml-auto inline-flex size-9 items-center justify-center rounded-[8px] ${
                        saved
                          ? "bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)]"
                          : "text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-violet-wash)]"
                      }`}
                      aria-label={saved ? "Unsave job" : "Save job"}
                    >
                      <BookmarkIcon filled={saved} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function relativePosted(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const ageMs = Date.now() - date.getTime();
  const day = 86_400_000;
  if (ageMs < day) return "Today";
  if (ageMs < 2 * day) return "1 day ago";
  if (ageMs < 7 * day) return `${Math.floor(ageMs / day)} days ago`;
  if (ageMs < 30 * day) return `${Math.floor(ageMs / (7 * day))} weeks ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
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
