"use client";

import { useState } from "react";

import {
  emptyJobSearchPreferences,
  type DiscoveredJob,
  type EmploymentType,
  type ExperienceLevel,
  type JobSearchPreferences,
  type JobSearchProfile,
  type PreferenceIntent,
  type PreferenceIntentMode,
  type UserJobState,
  type WorkMode,
} from "../domain/job";

type SearchRequestPreview = {
  method: "GET";
  url: string;
  headers: Record<string, string>;
  params: {
    query: string;
    country: string;
    language: string;
    num_pages: string;
    date_posted: string;
    work_from_home: string | null;
    employment_types: string | null;
    job_requirements: string | null;
  };
};

type ProfileWithPreview = JobSearchProfile & {
  searchPreview?: SearchRequestPreview[];
};

type Props = {
  initialProfile: ProfileWithPreview | null;
  initialJobs: DiscoveredJob[];
};

export function JobDiscoveryWorkspace({
  initialProfile,
  initialJobs,
}: Props) {
  const [profile, setProfile] = useState<ProfileWithPreview | null>(
    initialProfile,
  );
  const [preferences, setPreferences] = useState<JobSearchPreferences>(
    initialProfile?.preferences ?? emptyJobSearchPreferences,
  );
  const [searchPreview, setSearchPreview] = useState<SearchRequestPreview[]>(
    initialProfile?.searchPreview ?? [],
  );
  const [jobs, setJobs] = useState(initialJobs);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchDepth, setSearchDepth] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savePreferences = async () => {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await request<ProfileWithPreview>("/api/job-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
      setProfile(saved);
      setPreferences(saved.preferences);
      setSearchPreview(saved.searchPreview ?? []);
      setMessage("Job preferences saved. Copy the JSearch URL below into Postman.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsSaving(false);
    }
  };

  const findJobs = async () => {
    setIsSearching(true);
    setError(null);
    setMessage(null);
    try {
      const result = await request<{
        jobs: DiscoveredJob[];
        partialFailure: boolean;
        nextCursor: string | null;
      }>("/api/jobs/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cursor: null, depth: 1 }),
      });
      const latest = await request<DiscoveredJob[]>("/api/jobs");
      setJobs(latest);
      setNextCursor(result.nextCursor);
      setSearchDepth(1);
      setMessage(
        result.partialFailure
          ? `Found ${result.jobs.length} job(s), but part of the search could not complete.`
          : `Found ${result.jobs.length} job(s).`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsSearching(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setIsSearching(true);
    setError(null);
    try {
      const depth = searchDepth + 1;
      const result = await request<{
        jobs: DiscoveredJob[];
        partialFailure: boolean;
        nextCursor: string | null;
      }>("/api/jobs/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cursor: nextCursor, depth }),
      });
      setJobs(await request<DiscoveredJob[]>("/api/jobs"));
      setNextCursor(result.nextCursor);
      setSearchDepth(depth);
      setMessage(
        result.partialFailure
          ? "Loaded more jobs, but part of the search could not complete."
          : `Loaded ${result.jobs.length} more job(s).`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsSearching(false);
    }
  };

  const updateJobState = async (
    listingId: string,
    state: UserJobState,
  ) => {
    setError(null);
    try {
      const updated = await request<DiscoveredJob>(
        `/api/jobs/${listingId}/state`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state }),
        },
      );
      setJobs((current) =>
        state === "dismissed"
          ? current.filter((job) => job.listing_id !== listingId)
          : current.map((job) =>
              job.listing_id === listingId ? updated : job,
            ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const clearSearchedJobs = async () => {
    setIsClearing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await request<{ removed: number }>("/api/jobs", {
        method: "DELETE",
      });
      setJobs(await request<DiscoveredJob[]>("/api/jobs"));
      setNextCursor(null);
      setSearchDepth(1);
      setMessage(
        result.removed === 0
          ? "No searched jobs to clear. Saved jobs were kept."
          : `Cleared ${result.removed} searched job(s). Saved jobs were kept.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Search preferences
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              What kind of work are you looking for?
            </h2>
          </div>
          {profile && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Saved
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ListInput
            label="Desired roles"
            value={preferences.roles}
            placeholder="e.g. Software Engineer"
            onChange={(roles) =>
              setPreferences((current) => ({ ...current, roles }))
            }
          />
          <ListInput
            label="Locations"
            value={preferences.locations}
            placeholder="e.g. Colombo, Remote"
            onChange={(locations) =>
              setPreferences((current) => ({ ...current, locations }))
            }
          />
          <ListInput
            label="Excluded keywords"
            value={preferences.excluded_keywords}
            placeholder="e.g. Senior"
            onChange={(excluded_keywords) =>
              setPreferences((current) => ({
                ...current,
                excluded_keywords,
              }))
            }
          />
          <ListInput
            label="Target role families"
            value={preferences.target_role_families}
            placeholder="e.g. Software Engineering"
            onChange={(target_role_families) =>
              setPreferences((current) => ({
                ...current,
                target_role_families,
              }))
            }
          />
          <ListInput
            label="Prefer technologies"
            value={labelsForMode(preferences.capability_intents, "prefer")}
            placeholder="Leave blank unless you want this"
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
          <ListInput
            label="Explore technologies"
            value={labelsForMode(preferences.capability_intents, "explore")}
            placeholder="Leave blank unless you want this"
            onChange={(labels) =>
              setPreferences((current) => ({
                ...current,
                capability_intents: replaceModeIntents(
                  current.capability_intents,
                  "explore",
                  labels,
                ),
              }))
            }
          />
          <ListInput
            label="Avoid technologies"
            value={labelsForMode(preferences.capability_intents, "avoid")}
            placeholder="Leave blank unless you want this"
            onChange={(labels) =>
              setPreferences((current) => ({
                ...current,
                capability_intents: replaceModeIntents(
                  current.capability_intents,
                  "avoid",
                  labels,
                ),
              }))
            }
          />
          <ListInput
            label="Exclude technologies (hard filter)"
            value={labelsForMode(preferences.capability_intents, "exclude")}
            placeholder="Leave blank unless needed"
            onChange={(labels) =>
              setPreferences((current) => ({
                ...current,
                capability_intents: replaceModeIntents(
                  current.capability_intents,
                  "exclude",
                  labels,
                ),
              }))
            }
          />
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={preferences.reject_inferred_direction}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                reject_inferred_direction: event.target.checked,
              }))
            }
          />
          <span>
            Reject Zeno&apos;s inferred current direction for personalization
            (does not change verified career evidence).
          </span>
        </label>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ChoiceGroup
            label="Work mode"
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
          <ChoiceGroup
            label="Employment type"
            options={[
              ["full_time", "Full-time"],
              ["part_time", "Part-time"],
              ["contract", "Contract"],
              ["internship", "Internship"],
            ]}
            selected={preferences.employment_types}
            onChange={(employment_types) =>
              setPreferences((current) => ({
                ...current,
                employment_types: employment_types as EmploymentType[],
              }))
            }
          />
          <ChoiceGroup
            label="Experience level"
            options={[
              ["entry", "Entry"],
              ["mid", "Mid"],
              ["senior", "Senior"],
              ["lead", "Lead"],
              ["executive", "Executive"],
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

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={savePreferences}
            disabled={isSaving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save preferences"}
          </button>
          <button
            type="button"
            onClick={findJobs}
            disabled={isSearching || !profile || profile.preferences.roles.length === 0}
            className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSearching ? "Finding jobs…" : "Find jobs"}
          </button>
        </div>
        {!profile && (
          <p className="mt-2 text-xs text-slate-500">
            Save at least one desired role before searching.
          </p>
        )}
        {profile && (
          <SavedPreferencesPreview
            preferences={profile.preferences}
            searchPreview={searchPreview}
            dirty={!preferencesEqual(profile.preferences, preferences)}
          />
        )}
        <p className="mt-3 text-xs text-slate-500">
          Search hides elevated titles (Principal, Staff, Head of, Director, VP,
          etc.) when your experience level is empty or entry — across IT, HR,
          sales, and other fields, not just roles that say “Senior”.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-3 text-sm font-medium text-slate-700">
            {message}
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Discovered jobs
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {jobs.length} active result{jobs.length === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            type="button"
            onClick={clearSearchedJobs}
            disabled={
              isClearing ||
              !jobs.some((job) => job.user_state === "discovered")
            }
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          >
            {isClearing ? "Clearing…" : "Clear searched jobs"}
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-600">
            Save your preferences and find jobs to see real vacancies here.
          </div>
        ) : (
          <div>
            <div className="grid min-w-0 gap-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.listing_id}
                  job={job}
                  onStateChange={updateJobState}
                />
              ))}
            </div>
            {nextCursor && (
              <button
                type="button"
                onClick={loadMore}
                disabled={isSearching}
                className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                {isSearching ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ListInput(props: {
  label: string;
  value: string[];
  placeholder: string;
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {props.label}
      <input
        value={props.value.join(", ")}
        placeholder={props.placeholder}
        onChange={(event) =>
          props.onChange(
            event.target.value
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          )
        }
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <span className="mt-1 block text-xs font-normal text-slate-500">
        Separate multiple values with commas.
      </span>
    </label>
  );
}

function ChoiceGroup(props: {
  label: string;
  options: Array<[string, string]>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{props.label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {props.options.map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"
          >
            <input
              type="checkbox"
              checked={props.selected.includes(value)}
              onChange={(event) =>
                props.onChange(
                  event.target.checked
                    ? [...props.selected, value]
                    : props.selected.filter((item) => item !== value),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function JobCard(props: {
  job: DiscoveredJob;
  onStateChange: (listingId: string, state: UserJobState) => Promise<void>;
}) {
  const { job } = props;
  const details = [
    job.location,
    formatValue(job.work_mode),
    formatValue(job.employment_type),
    job.published_at
      ? `Posted ${new Date(job.published_at).toLocaleDateString()}`
      : null,
  ].filter(Boolean);

  const descriptionPreview = formatJobDescriptionPreview(job.description);

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold break-words text-slate-950">
            {job.title}
          </h3>
          {job.organization_name && (
            <p className="mt-0.5 text-sm font-medium break-words text-slate-700">
              {job.organization_name}
            </p>
          )}
          {details.length > 0 && (
            <p className="mt-2 text-xs break-words text-slate-500">
              {details.join(" · ")}
            </p>
          )}
        </div>
        {job.user_state === "saved" && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Saved
          </span>
        )}
      </div>
      {descriptionPreview && (
        <p className="mt-3 line-clamp-3 overflow-hidden text-sm leading-6 break-words text-slate-600 [overflow-wrap:anywhere]">
          {descriptionPreview}
        </p>
      )}
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            props.onStateChange(
              job.listing_id,
              job.user_state === "saved" ? "discovered" : "saved",
            )
          }
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800"
        >
          {job.user_state === "saved" ? "Unsave" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => props.onStateChange(job.listing_id, "dismissed")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          Dismiss
        </button>
        {(job.application_url || job.source_url) && (
          <a
            href={job.application_url ?? job.source_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {job.application_url ? "View job" : "View source"}
          </a>
        )}
        <span className="ml-auto max-w-full truncate text-xs text-slate-500">
          Source: {job.publisher ?? job.source_name}
        </span>
      </div>
    </article>
  );
}

function SavedPreferencesPreview(props: {
  preferences: JobSearchPreferences;
  searchPreview: SearchRequestPreview[];
  dirty: boolean;
}) {
  const prefs = props.preferences;
  const rows: Array<[string, string]> = [
    ["Roles", joinOrNone(prefs.roles)],
    ["Locations", joinOrNone(prefs.locations)],
    ["Work modes", joinOrNone(prefs.work_modes.map(humanizeToken))],
    ["Employment", joinOrNone(prefs.employment_types.map(humanizeToken))],
    ["Experience", joinOrNone(prefs.experience_levels.map(humanizeToken))],
    ["Excluded keywords", joinOrNone(prefs.excluded_keywords)],
    ["Target families", joinOrNone(prefs.target_role_families)],
    ["Prefer", joinOrNone(labelsForMode(prefs.capability_intents, "prefer"))],
    ["Explore", joinOrNone(labelsForMode(prefs.capability_intents, "explore"))],
    ["Avoid", joinOrNone(labelsForMode(prefs.capability_intents, "avoid"))],
    ["Exclude tech", joinOrNone(labelsForMode(prefs.capability_intents, "exclude"))],
  ];

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Saved preferences preview
        </p>
        {props.dirty && (
          <span className="text-xs font-medium text-amber-800">
            Form has unsaved changes
          </span>
        )}
      </div>
      <dl className="mt-2 grid gap-1.5 text-xs text-slate-700 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="inline font-medium text-slate-500">{label}: </dt>
            <dd className="inline break-words text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="text-sm font-semibold text-slate-900">
          Exact JSearch request (Postman)
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Method GET. Paste the URL into Postman, then add the headers below
          (replace the key placeholder with your RAPIDAPI_KEY from .env.local).
        </p>
        {props.searchPreview.length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">
            Add at least one desired role, then save preferences.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {props.searchPreview.map((preview) => (
              <li
                key={preview.url}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
              >
                <p className="font-semibold text-slate-500">URL</p>
                <p className="mt-1 break-all font-mono text-[11px] leading-5">
                  {preview.url}
                </p>
                <p className="mt-2 font-semibold text-slate-500">Headers</p>
                <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-5 text-slate-700">
                  {Object.entries(preview.headers)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join("\n")}
                </pre>
                <p className="mt-2 font-semibold text-slate-500">Params</p>
                <p className="mt-1 font-mono text-[11px] leading-5 text-slate-700">
                  query={preview.params.query}
                  <br />
                  country={preview.params.country} · language=
                  {preview.params.language} · num_pages=
                  {preview.params.num_pages} · date_posted=
                  {preview.params.date_posted}
                  {preview.params.work_from_home
                    ? ` · work_from_home=${preview.params.work_from_home}`
                    : ""}
                  {preview.params.employment_types
                    ? ` · employment_types=${preview.params.employment_types}`
                    : ""}
                  {preview.params.job_requirements
                    ? ` · job_requirements=${preview.params.job_requirements}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function preferencesEqual(
  left: JobSearchPreferences,
  right: JobSearchPreferences,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function joinOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function humanizeToken(value: string): string {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(value: string | null) {
  return value ? humanizeToken(value) : null;
}

/** Keep job cards compact: strip markdown/URLs that can blow out the layout. */
function formatJobDescriptionPreview(description: string | null): string | null {
  if (!description) return null;
  let text = description;
  // Prefer simple splits over complex markdown regexes (avoids unicode-regex edge cases).
  text = text.split("http://").join(" ");
  text = text.split("https://").join(" ");
  text = text.split("*").join(" ");
  text = text.split("`").join(" ");
  text = text.split("#").join(" ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
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
  const next = labels.map((label) => ({
    kind: "technology" as const,
    key: label.toLocaleLowerCase().replace(/\s+/gu, "_"),
    label,
    mode,
  }));
  return [...kept, ...next];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Something went wrong. Please try again.");
  }
  return body as T;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Something went wrong. Please try again.";
}
