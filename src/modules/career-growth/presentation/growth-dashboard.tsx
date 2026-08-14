"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { GrowthMilestone, GrowthProject } from "../domain/schemas";

type DashboardProject = GrowthProject & { campaignNames: string[] };

export function GrowthDashboard(props: {
  weeklyHours: number;
  activeCount: number;
  current: {
    project: DashboardProject;
    milestones: GrowthMilestone[];
    nextMilestone: GrowthMilestone | null;
  } | null;
  otherActive: DashboardProject[];
  completed: DashboardProject[];
}) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.35rem] leading-none tracking-[-0.03em] text-[var(--zeno-ink)]">
          Growth
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
          Turn career gaps into evidence employers can see.
        </p>
        <p className="mt-2 text-[13px] text-[var(--zeno-ink-faint)]">
          {props.activeCount === 0
            ? "No active Growth projects."
            : `${props.activeCount} active project${props.activeCount === 1 ? "" : "s"} · ${props.weeklyHours} hours / week planned`}
        </p>
      </header>

      {props.current ? (
        <section className="rounded-[14px] border border-[var(--zeno-border)] bg-white p-5 shadow-[var(--zeno-shadow-sm)]">
          <h2 className="text-[16px] font-semibold">Current focus</h2>
          <h3 className="mt-2 text-[18px] font-semibold text-[var(--zeno-ink)]">
            {props.current.project.title}
          </h3>
          <p className="mt-1 text-[13px] text-[var(--zeno-ink-muted)]">
            {props.current.project.campaignNames.join(" · ") || "Job campaign"}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--zeno-ink)]">
            {props.current.project.objective}
          </p>
          <p className="mt-3 text-[13px] text-[var(--zeno-ink-muted)]">
            Progress {props.current.project.progress}% · Target {props.current.project.targetDate} ·{" "}
            {props.current.project.estimatedHoursPerWeek} hours / week
          </p>
          {props.current.nextMilestone ? (
            <p className="mt-2 text-[13px]">
              Next: {props.current.nextMilestone.title}
            </p>
          ) : (
            <p className="mt-2 text-[13px]">All required milestones are complete.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/app/growth/projects/${props.current.project.id}`}
              className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white"
            >
              Continue with Zeno
            </Link>
            <Link
              href={`/app/growth/projects/${props.current.project.id}`}
              className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold"
            >
              Update progress
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-[14px] border border-dashed border-[var(--zeno-border-hover)] bg-white p-6 text-[14px] text-[var(--zeno-ink-muted)]">
          Create a Job Campaign and Zeno will identify the most valuable way to strengthen your candidacy.
          <div className="mt-3">
            <Link href="/app/jobs" className="font-semibold text-[var(--zeno-primary-deep)]">
              Go to Jobs
            </Link>
          </div>
        </section>
      )}

      {props.otherActive.length > 0 ? (
        <section>
          <h2 className="text-[16px] font-semibold">Other active projects</h2>
          <ul className="mt-3 divide-y divide-[var(--zeno-border)] rounded-[14px] border border-[var(--zeno-border)] bg-white">
            {props.otherActive.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/app/growth/projects/${project.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--zeno-violet-wash)]"
                >
                  <span>
                    <span className="block text-[14px] font-semibold">{project.title}</span>
                    <span className="text-[12px] text-[var(--zeno-ink-muted)]">
                      {project.progress}% · {project.campaignNames.join(" · ")}
                    </span>
                  </span>
                  <span className="text-[12px] text-[var(--zeno-ink-faint)]">{project.targetDate}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.completed.length > 0 ? (
        <section>
          <h2 className="text-[16px] font-semibold">Completed evidence</h2>
          <ul className="mt-3 space-y-2">
            {props.completed.map((project) => (
              <li
                key={project.id}
                className="rounded-[12px] border border-[var(--zeno-border)] bg-white px-4 py-3 text-[13px]"
              >
                <p className="font-semibold">{project.title}</p>
                <p className="mt-1 text-[var(--zeno-ink-muted)]">
                  {project.expectedEvidence.join(" · ") || project.objective}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function GrowthProjectTracker(props: {
  project: DashboardProject | GrowthProject;
  milestones: GrowthMilestone[];
  recommendationId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const project = props.project;
  const allRequiredDone = props.milestones
    .filter((item) => item.status !== "skipped")
    .every((item) => item.status === "completed");

  async function setMilestone(id: string, status: GrowthMilestone["status"]) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/growth/milestones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Update failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function setProject(status: GrowthProject["status"]) {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch(`/api/growth/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Update failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-[12px] text-[var(--zeno-ink-muted)]">
        <Link href="/app/growth" className="hover:underline">Growth</Link>
        <span className="mx-1.5 text-[var(--zeno-ink-faint)]">/</span>
        {project.title}
      </p>
      <header>
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[2rem] tracking-[-0.03em]">
          {project.title}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
          {project.objective}
        </p>
        <p className="mt-2 text-[13px] text-[var(--zeno-ink-faint)]">
          {project.progress}% complete · {project.startDate} to {project.targetDate} ·{" "}
          {project.estimatedHoursPerWeek} hours / week · {project.status.replace("_", " ")}
        </p>
      </header>
      {error ? (
        <p className="text-[13px] text-amber-800" role="alert">{error}</p>
      ) : null}
      <section>
        <h2 className="text-[16px] font-semibold">Milestones</h2>
        <ol className="mt-3 space-y-2">
          {props.milestones.map((item) => (
            <li key={item.id} className="rounded-[12px] border border-[var(--zeno-border)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-[13px] text-[var(--zeno-ink-muted)]">{item.description}</p>
                </div>
                <p className="text-[12px] text-[var(--zeno-ink-faint)]">{item.status.replace("_", " ")}</p>
              </div>
              {item.status === "todo" || item.status === "in_progress" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status === "todo" ? (
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void setMilestone(item.id, "in_progress")}
                      className="h-9 rounded-[10px] border border-[var(--zeno-border)] px-3 text-[13px] font-semibold"
                    >
                      Start
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void setMilestone(item.id, "completed")}
                    className="h-9 rounded-[10px] bg-[var(--zeno-primary)] px-3 text-[13px] font-semibold text-white"
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void setMilestone(item.id, "skipped")}
                    className="h-9 rounded-[10px] px-3 text-[13px] font-semibold text-[var(--zeno-ink-muted)]"
                  >
                    Skip
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/app/growth/recommendations/${props.recommendationId}`}
          className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold"
        >
          Continue with Zeno
        </Link>
        <a
          href={`/api/growth/projects/${project.id}/calendar`}
          className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold"
        >
          Add plan to calendar
        </a>
        {project.status === "in_progress" ? (
          <button type="button" onClick={() => void setProject("paused")} className="h-10 px-3 text-[13px] font-semibold">
            Pause
          </button>
        ) : null}
        {project.status === "paused" || project.status === "planned" ? (
          <button type="button" onClick={() => void setProject("in_progress")} className="h-10 px-3 text-[13px] font-semibold">
            Resume
          </button>
        ) : null}
        {project.status !== "abandoned" && project.status !== "completed" ? (
          <button type="button" onClick={() => void setProject("abandoned")} className="h-10 px-3 text-[13px] font-semibold text-[var(--zeno-ink-muted)]">
            Abandon
          </button>
        ) : null}
      </div>
      {allRequiredDone && project.status !== "completed" ? (
        <section className="rounded-[14px] border border-[var(--zeno-border)] bg-white p-5">
          <p className="text-[14px] font-semibold">This project looks complete.</p>
          <p className="mt-1 text-[13px] text-[var(--zeno-ink-muted)]">
            Mark it complete, then add the work to your profile. Claims stay unverified until you review them.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void setProject("completed")}
              className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white"
            >
              Complete project
            </button>
            <Link
              href={`/app/career-profile?fromGrowth=${project.id}`}
              className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold"
            >
              Add this work to my profile
            </Link>
          </div>
        </section>
      ) : null}
      {project.status === "completed" ? (
        <Link
          href={`/app/career-profile?fromGrowth=${project.id}`}
          className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white"
        >
          Add this work to my profile
        </Link>
      ) : null}
    </div>
  );
}
