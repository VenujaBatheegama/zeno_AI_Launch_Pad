"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

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
        <FocusProjectCard current={props.current} />
      ) : (
        <InstantSprintLauncher />
      )}

      {props.otherActive.length > 0 ? (
        <section>
          <h2 className="text-[16px] font-semibold">Other active projects</h2>
          <ul className="mt-3 divide-y divide-[var(--zeno-border)] rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)]">
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
                className="rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-3 text-[13px] flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-[var(--zeno-ink)]">{project.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--zeno-ink-muted)]">
                    {project.expectedEvidence.join(" · ") || project.objective}
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                  ✓ Verified in Profile
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FocusProjectCard(props: {
  current: {
    project: DashboardProject;
    milestones: GrowthMilestone[];
    nextMilestone: GrowthMilestone | null;
  };
}) {
  const router = useRouter();
  const [milestones, setMilestones] = useState(props.current.milestones);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoAdded, setAutoAdded] = useState(props.current.project.status === "completed");

  const completedCount = milestones.filter((m) => m.status === "completed").length;
  const totalCount = milestones.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const activeTask = milestones.find((m) => m.status === "in_progress") ?? milestones.find((m) => m.status === "todo");

  async function toggleMilestone(milestoneId: string, currentStatus: GrowthMilestone["status"]) {
    const nextStatus = currentStatus === "completed" ? "todo" : "completed";
    setBusyId(milestoneId);

    // Optimistic UI update
    const updated = milestones.map((m) =>
      m.id === milestoneId ? { ...m, status: nextStatus as GrowthMilestone["status"] } : m,
    );
    setMilestones(updated);

    try {
      const response = await fetch(`/api/growth/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("Failed to update milestone");

      // Check if all milestones are now complete
      const allDone = updated.every((m) => m.status === "completed" || m.status === "skipped");
      if (allDone && !autoAdded) {
        setAutoAdded(true);
        // Mark project completed in background
        await fetch(`/api/growth/projects/${props.current.project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        }).catch(() => null);
      }
      router.refresh();
    } catch {
      // Revert on error
      setMilestones(props.current.milestones);
    } finally {
      setBusyId(null);
    }
  }

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/growth/projects/${props.current.project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch (e) {
      console.error(e);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-sm)] space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--zeno-violet-soft)] px-3 py-0.5 text-xs font-bold text-[var(--zeno-primary)] mb-1.5">
            <span>🎯 Current Focus</span>
          </div>
          <h2 className="text-xl font-bold text-[var(--zeno-ink)]">
            {props.current.project.title}
          </h2>
          <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
            {props.current.project.campaignNames.join(" · ") || "Career Growth Project"} · Target: {props.current.project.targetDate} · {props.current.project.estimatedHoursPerWeek} hrs/week
          </p>
        </div>

        <div className="flex items-center gap-3 sm:shrink-0">
          <div className="text-right">
            <span className="text-2xl font-bold text-[var(--zeno-ink)]">
              {progressPercent}%
            </span>
            <p className="text-[11px] text-[var(--zeno-ink-muted)]">
              {completedCount} of {totalCount} tasks done
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete this project sprint"
            className="p-2 rounded-lg text-[var(--zeno-ink-faint)] hover:text-red-400 hover:bg-red-500/10 transition border border-transparent hover:border-red-500/20"
          >
            🗑️
          </button>
        </div>
      </div>

      {showDeleteConfirm ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-2">
          <p className="text-xs font-bold text-red-400">
            Are you sure you want to delete this project sprint?
          </p>
          <p className="text-[11px] text-[var(--zeno-ink-muted)]">
            This will remove all tracked tasks and allow you to generate new project ideas for your target role.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
              className="rounded-lg bg-red-500 hover:bg-red-600 text-white px-3 py-1 text-xs font-bold transition shadow-sm"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete Sprint"}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg border border-[var(--zeno-border)] bg-[var(--zeno-surface)] hover:bg-[var(--zeno-surface-elevated)] px-3 py-1 text-xs font-semibold text-[var(--zeno-ink-muted)] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[var(--zeno-ink-muted)] leading-relaxed">
        {props.current.project.objective}
      </p>

      {/* Visual Progress Bar */}
      <div className="w-full bg-[var(--zeno-surface-elevated)] rounded-full h-2 overflow-hidden border border-[var(--zeno-border)]">
        <div
          className="bg-[var(--zeno-primary)] h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      {/* Current Task Preview Highlight */}
      {activeTask && progressPercent < 100 ? (
        <div className="rounded-xl border border-[var(--zeno-primary)]/30 bg-[var(--zeno-violet-soft)]/60 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm">📍</span>
            <div>
              <p className="text-xs font-semibold text-[var(--zeno-primary-deep)]">
                Current Task: {activeTask.title}
              </p>
              <p className="text-[11px] text-[var(--zeno-ink-muted)]">
                {activeTask.description || `Complete and verify ${activeTask.title}`}
              </p>
            </div>
          </div>
          {activeTask.targetDate ? (
            <span className="text-[11px] font-semibold text-[var(--zeno-primary-deep)] bg-[var(--zeno-surface)] border border-[var(--zeno-border)] px-2.5 py-1 rounded-lg shrink-0">
              📅 Due {activeTask.targetDate}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Completion Banner */}
      {progressPercent === 100 || autoAdded ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🎉</span>
              <p className="text-xs font-bold text-emerald-400">
                All Milestones Complete! Project automatically added to your Verified Profile.
              </p>
            </div>
            <Link
              href="/app/profile"
              className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black px-3 py-1 text-xs font-bold transition shadow-sm"
            >
              View in Profile →
            </Link>
          </div>
        </div>
      ) : null}

      {/* Interactive Milestones Checklist */}
      <div className="space-y-2.5 pt-2">
        <h3 className="text-xs font-bold text-[var(--zeno-ink)] uppercase tracking-wider">
          Sprint Tasks & Milestones ({totalCount})
        </h3>
        <div className="divide-y divide-[var(--zeno-border)] rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] overflow-hidden">
          {milestones.map((m, idx) => {
            const isDone = m.status === "completed";
            const isBusy = busyId === m.id;
            return (
              <div
                key={m.id}
                onClick={() => void toggleMilestone(m.id, m.status)}
                className={`p-3.5 flex items-start gap-3.5 cursor-pointer transition select-none ${
                  isDone ? "bg-[var(--zeno-surface)]/50 opacity-80" : "hover:bg-[var(--zeno-violet-wash)]"
                }`}
              >
                <button
                  type="button"
                  disabled={isBusy}
                  className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 ${
                    isDone
                      ? "border-[var(--zeno-primary)] bg-[var(--zeno-primary)] text-white font-bold text-xs"
                      : "border-[var(--zeno-border)] bg-[var(--zeno-surface)] hover:border-[var(--zeno-primary)] text-transparent"
                  }`}
                >
                  {isDone ? "✓" : ""}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-xs font-semibold ${
                        isDone
                          ? "line-through text-[var(--zeno-ink-muted)]"
                          : "text-[var(--zeno-ink)]"
                      }`}
                    >
                      {idx + 1}. {m.title}
                    </p>
                    {m.targetDate ? (
                      <span
                        className={`text-[10px] font-medium shrink-0 px-2 py-0.5 rounded-md ${
                          isDone
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-[var(--zeno-surface)] text-[var(--zeno-ink-muted)] border border-[var(--zeno-border)]"
                        }`}
                      >
                        {isDone ? "✓ Done" : `Due ${m.targetDate}`}
                      </span>
                    ) : null}
                  </div>
                  {m.description ? (
                    <p className="mt-0.5 text-[11px] text-[var(--zeno-ink-muted)] leading-normal line-clamp-2">
                      {m.description}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
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
        <p className="text-[13px] text-[var(--zeno-warning)]" role="alert">{error}</p>
      ) : null}
      <section>
        <h2 className="text-[16px] font-semibold">Milestones</h2>
        <ol className="mt-3 space-y-2">
          {props.milestones.map((item) => (
            <li key={item.id} className="rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4">
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
        <section className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
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

interface GeneratedProjectIdea {
  id: string;
  title: string;
  category: string;
  tagline: string;
  marketAdvantage: string;
  technologies: string[];
  milestones: Array<{
    title: string;
    description: string;
    week: number;
  }>;
  expectedEvidence: string[];
}

function InstantSprintLauncher() {
  const router = useRouter();
  const [targetRole, setTargetRole] = useState("");
  const [weeklyHours, setWeeklyHours] = useState(5);
  const [ideas, setIdeas] = useState<GeneratedProjectIdea[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchIdeas() {
    const trimmed = targetRole.trim();
    if (!trimmed) {
      setError("Please enter a target role to generate ideas.");
      return;
    }
    setLoadingIdeas(true);
    setError(null);
    try {
      const res = await fetch("/api/growth/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: trimmed,
          weeklyHours,
        }),
      });
      const data = (await res.json()) as { ideas?: GeneratedProjectIdea[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not generate project ideas.");
        return;
      }
      if (data.ideas && data.ideas.length > 0) {
        setIdeas(data.ideas);
        setSelectedIdeaId(data.ideas[0]!.id);
      }
    } catch {
      setError("Network issue while generating project ideas.");
    } finally {
      setLoadingIdeas(false);
    }
  }

  const selectedIdea = ideas.find((i) => i.id === selectedIdeaId) ?? ideas[0];

  async function handleLaunch() {
    if (!selectedIdea) {
      setError("Please select a project idea first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/growth/instant-sprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: targetRole.trim(),
          weeklyHours,
          selectedIdea,
        }),
      });
      const data = (await response.json()) as { error?: string; projectId?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? "Failed to launch sprint");
        return;
      }
      router.refresh();
    } catch {
      setError("Network issue. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-sm)] space-y-6">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--zeno-violet-soft)] px-3 py-1 text-xs font-bold text-[var(--zeno-primary)] mb-2">
          <span>⚡ Instant Growth Sprint</span>
        </div>
        <h2 className="text-xl font-semibold text-[var(--zeno-ink)]">
          Build Market-Demanded Engineering Evidence
        </h2>
        <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
          Specify your desired role and available weekly time. Zeno will analyze market gaps and propose 3 standout portfolio blueprints.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-2 text-xs text-red-400">
          {error}
        </div>
      ) : null}

      {/* Target Role & Time Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)]">
        <div className="md:col-span-2 space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--zeno-ink)]">
            1. Target Career Role <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Senior DevOps Engineer, AI Systems Architect, Rust Backend Lead..."
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && targetRole.trim() && !loadingIdeas) {
                void fetchIdeas();
              }
            }}
            className="w-full rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3.5 py-2.5 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--zeno-ink)]">
            2. Planned Weekly Time
          </label>
          <div className="flex items-center gap-1.5">
            {[2, 5, 8, 10].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setWeeklyHours(h)}
                className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${
                  weeklyHours === h
                    ? "border-[var(--zeno-primary)] bg-[var(--zeno-primary)] text-white shadow-sm"
                    : "border-[var(--zeno-border)] bg-[var(--zeno-surface)] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)]"
                }`}
              >
                {h}h/wk
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-3 pt-1">
          <button
            type="button"
            disabled={loadingIdeas || !targetRole.trim()}
            onClick={() => void fetchIdeas()}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--zeno-primary)] hover:bg-[var(--zeno-primary-deep)] px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
          >
            {loadingIdeas ? "Analyzing Market & Generating Ideas…" : "Generate Project Ideas 🪄"}
          </button>
        </div>
      </div>

      {/* 3 Generated Project Idea Cards (Only shown after generation) */}
      {loadingIdeas || ideas.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-[var(--zeno-ink)]">
              3. Choose Your Project Blueprint ({ideas.length} ideas generated for {targetRole})
            </label>
          </div>

          {loadingIdeas ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-5 animate-pulse space-y-3"
                >
                  <div className="h-4 bg-zinc-700/30 rounded w-3/4"></div>
                  <div className="h-3 bg-zinc-700/20 rounded w-full"></div>
                  <div className="h-3 bg-zinc-700/20 rounded w-5/6"></div>
                  <div className="h-16 bg-zinc-700/10 rounded w-full mt-2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {ideas.map((idea) => {
                const isSelected = (selectedIdeaId ?? ideas[0]?.id) === idea.id;
                return (
                  <div
                    key={idea.id}
                    onClick={() => setSelectedIdeaId(idea.id)}
                    className={`flex flex-col justify-between p-4 rounded-2xl border cursor-pointer transition ${
                      isSelected
                        ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-soft)] shadow-md ring-1 ring-[var(--zeno-primary)]"
                        : "border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] hover:border-[var(--zeno-border-hover)]"
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--zeno-primary-deep)] bg-[var(--zeno-primary)]/10 px-2 py-0.5 rounded-md">
                          {idea.category}
                        </span>
                        {isSelected ? (
                          <span className="text-xs text-[var(--zeno-primary-deep)] font-bold">✓ Selected</span>
                        ) : null}
                      </div>

                      <h3 className="font-semibold text-[14px] text-[var(--zeno-ink)] leading-snug">
                        {idea.title}
                      </h3>

                      <p className="text-xs text-[var(--zeno-ink-muted)] leading-relaxed">
                        {idea.tagline}
                      </p>

                      <div className="rounded-xl bg-[var(--zeno-surface)]/60 border border-[var(--zeno-border)]/50 p-2.5 space-y-1">
                        <p className="text-[11px] font-semibold text-[var(--zeno-ink)]">
                          🎯 Why this stands out:
                        </p>
                        <p className="text-[11px] text-[var(--zeno-ink-muted)] leading-normal">
                          {idea.marketAdvantage}
                        </p>
                      </div>

                      {idea.technologies?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {idea.technologies.slice(0, 4).map((tech) => (
                            <span
                              key={tech}
                              className="text-[10px] rounded-md bg-[var(--zeno-surface)] border border-[var(--zeno-border)] px-1.5 py-0.5 text-[var(--zeno-ink-muted)] font-medium"
                            >
                              {tech}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {idea.milestones?.length > 0 ? (
                      <div className="mt-4 pt-3 border-t border-[var(--zeno-border)]/60 text-[11px] text-[var(--zeno-ink-muted)]">
                        <p className="font-semibold text-[var(--zeno-ink)] mb-1">4 Milestones:</p>
                        <ul className="space-y-1">
                          {idea.milestones.slice(0, 3).map((m, idx) => (
                            <li key={idx} className="truncate">
                              {idx + 1}. {m.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Launch Bar */}
          {!loadingIdeas && selectedIdea ? (
            <div className="flex items-center justify-end pt-3 border-t border-[var(--zeno-border)]">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleLaunch()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--zeno-primary)] hover:bg-[var(--zeno-primary-deep)] px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60"
              >
                {busy ? "Provisioning Sprint…" : `Launch "${selectedIdea.title}" Sprint (${weeklyHours}h/wk) →`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}


