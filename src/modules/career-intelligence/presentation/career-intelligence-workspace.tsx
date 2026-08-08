"use client";

import Link from "next/link";
import { useState } from "react";

import type {
  JobMatchDetails,
  JobSearchPlan,
  PersistedCandidateCapabilityProfile,
  PersistedCareerStageAssessment,
  RankedJobMatchCard,
} from "../application/ports";
import type {
  DiscoveredJob,
  JobSearchPreferences,
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
  const [assessment, setAssessment] =
    useState<PersistedCareerStageAssessment | null>(initialAssessment);
  const [plan, setPlan] = useState<JobSearchPlan | null>(initialPlan);
  const [matches, setMatches] = useState(initialMatches);
  const [jobs, setJobs] = useState(initialJobs);
  const [capabilityProfile, setCapabilityProfile] =
    useState<PersistedCandidateCapabilityProfile | null>(
      initialCapabilityProfile,
    );
  const [details, setDetails] = useState<JobMatchDetails | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
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

  const assess = () =>
    run("assess", async () => {
      const result = await request<PersistedCareerStageAssessment>(
        "/api/career-intelligence/assess",
        { method: "POST", body: JSON.stringify({ force: true }) },
      );
      setAssessment(result);
      setMessage("Career-stage assessment updated.");
    });

  const refreshCapabilities = () =>
    run("capabilities", async () => {
      const result = await request<PersistedCandidateCapabilityProfile>(
        "/api/career-intelligence/capability",
        { method: "POST", body: JSON.stringify({ force: true }) },
      );
      setCapabilityProfile(result);
      setMessage("Candidate capability profile refreshed from verified evidence.");
    });

  const createPlan = () =>
    run("plan", async () => {
      const result = await request<JobSearchPlan>(
        "/api/career-intelligence/plan",
        { method: "POST", body: JSON.stringify({ force: true }) },
      );
      setPlan(result);
      setMessage(`Search plan ready with ${result.queries.length} queries.`);
    });

  const executeSearch = () =>
    run("search", async () => {
      const result = await request<{
        jobsFound: number;
        partialFailure: boolean;
        warnings: string[];
        plan: JobSearchPlan;
      }>("/api/career-intelligence/search", {
        method: "POST",
        body: JSON.stringify({ planId: plan?.id }),
      });
      setPlan(result.plan);
      const latestJobs = await request<DiscoveredJob[]>("/api/jobs");
      setJobs(latestJobs);
      setMessage(
        result.jobsFound === 0
          ? `Search completed but found 0 new jobs. ${latestJobs.length} job(s) remain from earlier searches.`
          : result.partialFailure
            ? `Found ${result.jobsFound} new job(s); some queries had warnings. ${latestJobs.length} total listed.`
            : `Found ${result.jobsFound} new job(s). ${latestJobs.length} total listed.`,
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
          analysis?: { status?: string };
        }>;
        ranked?: RankedJobMatchCard[];
      }>("/api/career-intelligence/matches", {
        method: "POST",
        body: JSON.stringify({ listingIds, force: true }),
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
          failed
            .slice(0, 3)
            .map(
              (item) =>
                item.error ??
                `Listing ${item.listingId.slice(0, 8)}… not analysable or matching failed.`,
            )
            .join(" "),
        );
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
    });

  const toggleSelected = (listingId: string) => {
    setSelected((current) =>
      current.includes(listingId)
        ? current.filter((id) => id !== listingId)
        : [...current, listingId],
    );
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

      <section className="space-y-3 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            What you want vs what evidence demonstrates
          </h2>
          <button
            type="button"
            onClick={refreshCapabilities}
            disabled={busy !== null}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
          >
            {busy === "capabilities"
              ? "Refreshing…"
              : "Refresh capability profile"}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 text-sm text-slate-700">
          <div>
            <p className="font-semibold text-slate-950">What you want</p>
            <p>
              Target roles:{" "}
              {(initialPreferences?.target_role_families.length
                ? initialPreferences.target_role_families
                : initialPreferences?.roles
              )?.join(", ") || "not set"}
            </p>
            <p>
              Prefer:{" "}
              {intentLabels(initialPreferences, "prefer") || "none"}
            </p>
            <p>
              Explore:{" "}
              {intentLabels(initialPreferences, "explore") || "none"}
            </p>
            <p className="mt-2">
              <Link href="/jobs" className="font-semibold text-emerald-700">
                Edit preferences
              </Link>
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-950">
              What verified evidence demonstrates
            </p>
            {!capabilityProfile ? (
              <p>
                No capability profile yet. Refresh after verifying career
                evidence.
              </p>
            ) : (
              <>
                <p>
                  Strongly demonstrated:{" "}
                  {bandLabels(capabilityProfile, "strongly_demonstrated")}
                </p>
                <p>
                  Demonstrated: {bandLabels(capabilityProfile, "demonstrated")}
                </p>
                <p>
                  Developing / limited evidence:{" "}
                  {[
                    ...bandList(capabilityProfile, "developing"),
                    ...bandList(capabilityProfile, "limited_evidence"),
                  ].join(", ") || "none"}
                </p>
                {capabilityProfile.status === "stale" && (
                  <p className="text-amber-800">
                    Profile is stale after evidence changes — refresh it.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        {capabilityProfile && capabilityProfile.directions.length > 0 && (
          <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">
              Recent direction Zeno inferred (not a preference)
            </p>
            {capabilityProfile.directions.map((direction) => (
              <p key={direction.key}>
                {direction.label} — {direction.confidence} confidence.{" "}
                {direction.explanation}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Career stage
          </h2>
          <button
            type="button"
            onClick={assess}
            disabled={busy !== null}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "assess" ? "Assessing…" : "Assess career stage"}
          </button>
        </div>
        {!assessment ? (
          <p className="text-sm text-slate-600">
            Verify career evidence and save job preferences, then assess.
            <span className="mt-2 block">
              <Link href="/" className="font-semibold text-emerald-700">
                Career evidence
              </Link>
              {" · "}
              <Link href="/jobs" className="font-semibold text-emerald-700">
                Job preferences
              </Link>
            </span>
          </p>
        ) : (
          <div className="space-y-2 text-sm leading-6 text-slate-700">
            <p className="text-base font-medium text-slate-950">
              You&apos;re ready to prioritize{" "}
              {humanize(assessment.targetOpportunityBands[0] ?? "unknown")}{" "}
              roles.
            </p>
            <p>
              Inferred stage:{" "}
              <span className="font-medium">
                {humanize(assessment.inferredStage)}
              </span>{" "}
              ({assessment.confidence} confidence)
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {assessment.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {assessment.preferenceOverrides.length > 0 && (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-950">
                {assessment.preferenceOverrides.map((item) => (
                  <p key={item.kind}>{item.detail}</p>
                ))}
              </div>
            )}
            <p>
              Target bands:{" "}
              {assessment.targetOpportunityBands.map(humanize).join(", ")}
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Career-aware search plan
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createPlan}
              disabled={busy !== null || !assessment}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              {busy === "plan" ? "Planning…" : "Create plan"}
            </button>
            <button
              type="button"
              onClick={executeSearch}
              disabled={busy !== null || !plan}
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "search" ? "Searching…" : "Run planned search"}
            </button>
          </div>
        </div>
        {!plan ? (
          <p className="text-sm text-slate-600">
            After assessment, create a bounded multi-query plan before searching.
          </p>
        ) : (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Searching for {plan.queries.length} title queries (budget{" "}
              {plan.queryBudget}, status {plan.status}):
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {plan.queries.map((query) => (
                <li key={query.id}>
                  <span className="font-medium">{query.queryText}</span>
                  {" — "}
                  {query.reason} ({query.executionStatus})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Analyse discovered jobs
          </h2>
          <button
            type="button"
            onClick={analyseSelected}
            disabled={busy !== null || jobs.length === 0}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "analyse"
              ? "Analysing…"
              : `Analyse up to ${analysisBatchSize}`}
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Select jobs to analyse, or leave empty to analyse up to{" "}
          {analysisBatchSize} listings that have a usable description. LinkedIn
          guest cards need a description before they can be analysed. Scores use
          Zeno&apos;s deterministic evidence-fit policy, not the model.
        </p>
        <ul className="space-y-2">
          {jobs
            .filter((job) => job.user_state !== "dismissed")
            .slice(0, 20)
            .map((job) => (
              <li
                key={job.listing_id}
                className="flex items-start gap-3 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(job.listing_id)}
                  onChange={() => toggleSelected(job.listing_id)}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-slate-950">{job.title}</p>
                  <p>
                    {job.organization_name ?? "Unknown company"}
                    {job.description
                      ? ` · ${job.description.length} chars`
                      : " · no description"}
                  </p>
                </div>
              </li>
            ))}
        </ul>
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

function intentLabels(
  preferences: JobSearchPreferences | null | undefined,
  mode: "prefer" | "explore" | "avoid" | "exclude" | "only",
): string {
  if (!preferences) return "";
  return preferences.capability_intents
    .filter((item) => item.mode === mode)
    .map((item) => item.label)
    .join(", ");
}

function bandList(
  profile: PersistedCandidateCapabilityProfile,
  band: string,
): string[] {
  return profile.aggregates
    .filter((item) => item.band === band)
    .map((item) => item.label);
}

function bandLabels(
  profile: PersistedCandidateCapabilityProfile,
  band: string,
): string {
  return bandList(profile, band).join(", ") || "none";
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
