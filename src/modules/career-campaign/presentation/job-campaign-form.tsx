"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  generateCampaignName,
  type CampaignWorkMode,
  type JobSearchCampaign,
} from "../domain/job-campaign";
import type { EmploymentType, ExperienceLevel } from "@/modules/job-discovery/domain/job";
import { JobsBreadcrumb } from "./jobs-breadcrumb";

type Props = {
  mode: "create" | "edit";
  campaign?: JobSearchCampaign | null;
  defaultRole: string;
  defaultLocation: string;
  defaultWorkMode: CampaignWorkMode;
  defaultMinScore: number;
};

export function JobCampaignForm({
  mode,
  campaign,
  defaultRole,
  defaultLocation,
  defaultWorkMode,
  defaultMinScore,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(campaign?.name ?? "");
  const [primaryRole, setPrimaryRole] = useState(campaign?.primaryRole ?? defaultRole);
  const [location, setLocation] = useState(campaign?.location ?? defaultLocation);
  const [workMode, setWorkMode] = useState<CampaignWorkMode>(
    campaign?.workMode ?? defaultWorkMode,
  );
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">(
    campaign?.employmentTypes[0] ?? "",
  );
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | "">(
    campaign?.experienceLevels[0] ?? "",
  );
  const [minimumScore, setMinimumScore] = useState(
    campaign?.minimumScore ?? defaultMinScore,
  );
  const [preferredTechnologies, setPreferredTechnologies] = useState(
    campaign?.preferredTechnologies.join(", ") ?? "",
  );
  const [targetReadyDate, setTargetReadyDate] = useState(
    campaign?.targetReadyDate ?? "",
  );
  const [weeklyHoursAvailable, setWeeklyHoursAvailable] = useState<string>(
    campaign?.weeklyHoursAvailable ? String(campaign.weeklyHoursAvailable) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedName = useMemo(
    () => generateCampaignName(primaryRole, location),
    [primaryRole, location],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim() || suggestedName,
      primaryRole: primaryRole.trim(),
      location:
        location.trim() ||
        (workMode === "remote" || workMode === "any" ? "Remote" : ""),
      workMode,
      employmentTypes: employmentType ? [employmentType] : [],
      experienceLevels: experienceLevel ? [experienceLevel] : [],
      minimumScore,
      preferredTechnologies: preferredTechnologies
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8),
      targetReadyDate: targetReadyDate || null,
      weeklyHoursAvailable: weeklyHoursAvailable
        ? (Number(weeklyHoursAvailable) as 2 | 5 | 8 | 10)
        : null,
    };
    try {
      const response = await fetch(
        mode === "create"
          ? "/api/job-campaigns"
          : `/api/job-campaigns/${campaign?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        campaign?: JobSearchCampaign;
      };
      if (!response.ok) throw new Error(body.error ?? "Could not save campaign.");
      router.push(`/app/jobs/campaigns/${body.campaign?.id ?? campaign?.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <JobsBreadcrumb
        items={[
          { href: "/app/jobs", label: "Jobs" },
          ...(mode === "edit" && campaign
            ? [
                { href: `/app/jobs/campaigns/${campaign.id}`, label: campaign.name },
                { label: "Edit" },
              ]
            : [{ label: "New Campaign" }]),
        ]}
      />
      <header>
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[2rem] tracking-[-0.03em] text-[var(--zeno-ink)]">
          {mode === "create" ? "New campaign" : "Edit campaign"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
          Zeno checks LinkedIn for fresh matching jobs about every 15 minutes and runs a
          broader hybrid search about every 12 hours. Scheduling is automatic.
        </p>
      </header>

      {error ? (
        <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block text-[13px] font-medium text-[var(--zeno-ink)]">
          Campaign name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={suggestedName}
            className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--zeno-border-hover)]"
          />
        </label>
        <label className="block text-[13px] font-medium text-[var(--zeno-ink)]">
          Primary role
          <input
            required
            minLength={2}
            value={primaryRole}
            onChange={(event) => setPrimaryRole(event.target.value)}
            className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--zeno-border-hover)]"
          />
        </label>
        <label className="block text-[13px] font-medium text-[var(--zeno-ink)]">
          Location
          <input
            required
            minLength={2}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--zeno-border-hover)]"
          />
        </label>
        <label className="block text-[13px] font-medium text-[var(--zeno-ink)]">
          Work mode
          <select
            value={workMode}
            onChange={(event) => setWorkMode(event.target.value as CampaignWorkMode)}
            className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px]"
          >
            <option value="any">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
        <label className="block text-[13px] font-medium text-[var(--zeno-ink)]">
          Employment type
          <select
            value={employmentType}
            onChange={(event) =>
              setEmploymentType(event.target.value as EmploymentType | "")
            }
            className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px]"
          >
            <option value="">Any</option>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </label>
        <label className="block text-[13px] font-medium text-[var(--zeno-ink)]">
          Experience level
          <select
            value={experienceLevel}
            onChange={(event) =>
              setExperienceLevel(event.target.value as ExperienceLevel | "")
            }
            className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px]"
          >
            <option value="">Any</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="lead">Lead</option>
            <option value="executive">Executive</option>
          </select>
        </label>
        <label className="block text-[13px] font-medium text-[var(--zeno-ink)]">
          Minimum match score
          <input
            type="number"
            min={0}
            max={100}
            value={minimumScore}
            onChange={(event) => setMinimumScore(Number(event.target.value))}
            className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px]"
          />
        </label>
        <fieldset className="rounded-[12px] border border-[var(--zeno-border)] bg-white p-4">
          <legend className="px-1 text-[13px] font-semibold text-[var(--zeno-ink)]">
            Career development
          </legend>
          <p className="text-[12px] leading-relaxed text-[var(--zeno-ink-muted)]">
            Optional. These fields help Zeno avoid recommending work you cannot reasonably finish.
          </p>
          <label className="mt-3 block text-[13px] font-medium text-[var(--zeno-ink)]">
            Preferred technologies
            <input
              value={preferredTechnologies}
              onChange={(event) => setPreferredTechnologies(event.target.value)}
              placeholder="Java, Spring Boot, PostgreSQL"
              className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--zeno-border-hover)]"
            />
          </label>
          <label className="mt-3 block text-[13px] font-medium text-[var(--zeno-ink)]">
            When are you hoping to be ready?
            <input
              type="date"
              value={targetReadyDate}
              onChange={(event) => setTargetReadyDate(event.target.value)}
              className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px]"
            />
          </label>
          <label className="mt-3 block text-[13px] font-medium text-[var(--zeno-ink)]">
            How much time could you spend each week?
            <select
              value={weeklyHoursAvailable}
              onChange={(event) => setWeeklyHoursAvailable(event.target.value)}
              className="mt-1 h-10 w-full rounded-[12px] border border-[var(--zeno-border)] bg-white px-3 text-[13px]"
            >
              <option value="">Not sure yet</option>
              <option value="2">About 2 hours</option>
              <option value="5">About 5 hours</option>
              <option value="8">About 8 hours</option>
              <option value="10">10+ hours</option>
            </select>
          </label>
        </fieldset>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : mode === "create" ? "Create campaign" : "Save changes"}
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-[10px] px-4 text-[13px] font-semibold text-[var(--zeno-ink-muted)]"
            onClick={() => router.push("/app/jobs")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
