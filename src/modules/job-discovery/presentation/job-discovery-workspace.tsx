"use client";

import { useState } from "react";

import {
  emptyJobSearchPreferences,
  type DiscoveredJob,
  type EmploymentType,
  type ExperienceLevel,
  type JobSearchPreferences,
  type JobSearchProfile,
  type UserJobState,
  type WorkMode,
} from "../domain/job";

type Props = {
  initialProfile: JobSearchProfile | null;
  initialJobs: DiscoveredJob[];
};

export function JobDiscoveryWorkspace({
  initialProfile,
  initialJobs,
}: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [preferences, setPreferences] = useState<JobSearchPreferences>(
    initialProfile?.preferences ?? emptyJobSearchPreferences,
  );
  const [jobs, setJobs] = useState(initialJobs);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchDepth, setSearchDepth] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savePreferences = async () => {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await request<JobSearchProfile>("/api/job-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
      setProfile(saved);
      setPreferences(saved.preferences);
      setMessage("Job preferences saved.");
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
            placeholder="Software Engineer, DevOps Engineer"
            onChange={(roles) =>
              setPreferences((current) => ({ ...current, roles }))
            }
          />
          <ListInput
            label="Locations"
            value={preferences.locations}
            placeholder="Sri Lanka, Colombo, Remote"
            onChange={(locations) =>
              setPreferences((current) => ({ ...current, locations }))
            }
          />
          <ListInput
            label="Excluded keywords"
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
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Discovered jobs
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {jobs.length} active result{jobs.length === 1 ? "" : "s"}
            </h2>
          </div>
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-600">
            Save your preferences and find jobs to see real vacancies here.
          </div>
        ) : (
          <div>
            <div className="grid gap-3">
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

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{job.title}</h3>
          {job.organization_name && (
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {job.organization_name}
            </p>
          )}
          {details.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">{details.join(" · ")}</p>
          )}
        </div>
        {job.user_state === "saved" && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Saved
          </span>
        )}
      </div>
      {job.description && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
          {job.description}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        <span className="ml-auto text-xs text-slate-500">
          Source: {job.publisher ?? job.source_name}
        </span>
      </div>
    </article>
  );
}

function formatValue(value: string | null) {
  return value
    ? value
        .split("_")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ")
    : null;
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
