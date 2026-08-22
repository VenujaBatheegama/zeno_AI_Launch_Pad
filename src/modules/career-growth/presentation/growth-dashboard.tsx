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
        <section className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)]">
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
              className="inline-flex h-10 items-center rounded-[10px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--zeno-primary-deep)] transition"
            >
              Continue with Zeno ↗
            </Link>
            <Link
              href={`/app/growth/projects/${props.current.project.id}`}
              className="inline-flex h-10 items-center rounded-[10px] border border-[var(--zeno-border)] px-4 text-[13px] font-semibold hover:bg-[var(--zeno-surface-elevated)] transition"
            >
              Update progress
            </Link>
          </div>
        </section>
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
                className="rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-3 text-[13px]"
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
  const [targetRole, setTargetRole] = useState("DevOps Engineer");
  const [customRole, setCustomRole] = useState("");
  const [weeklyHours, setWeeklyHours] = useState(5);
  const [ideas, setIdeas] = useState<GeneratedProjectIdea[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRole = customRole.trim() || targetRole;

  async function fetchIdeas(role: string) {
    setLoadingIdeas(true);
    setError(null);
    try {
      const res = await fetch("/api/growth/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole: role }),
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

  // Load initial ideas on mount
  useState(() => {
    void fetchIdeas(activeRole);
  });

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
          targetRole: activeRole,
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

  const QUICK_ROLES = [
    "DevOps Engineer",
    "AI Engineer",
    "Full Stack Engineer",
    "Cloud Solutions Architect",
    "Backend Engineer",
  ];

  return (
    <section className="rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-sm)] space-y-6">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--zeno-violet-soft)] px-3 py-1 text-xs font-bold text-[var(--zeno-primary)] mb-2">
          <span>⚡ Instant Growth Sprint</span>
        </div>
        <h2 className="text-xl font-semibold text-[var(--zeno-ink)]">
          Launch a Standout Portfolio Sprint
        </h2>
        <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
          Zeno synthesizes your verified profile and current market demand into 3 distinct, high-impact project blueprints.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-2 text-xs text-red-400">
          {error}
        </div>
      ) : null}

      {/* Target Role Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-[var(--zeno-ink)]">
          Target Role or Career Direction
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {QUICK_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => {
                setTargetRole(role);
                setCustomRole("");
                void fetchIdeas(role);
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
                !customRole && targetRole === role
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)] font-semibold"
                  : "border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)]"
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Or enter custom role (e.g. Cybersecurity Analyst, Platform Engineer)..."
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-3.5 py-2 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
          />
          <button
            type="button"
            disabled={loadingIdeas}
            onClick={() => void fetchIdeas(activeRole)}
            className="rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] hover:bg-[var(--zeno-violet-wash)] px-4 py-2 text-xs font-semibold text-[var(--zeno-ink)] transition disabled:opacity-60"
          >
            {loadingIdeas ? "Generating…" : "Generate Ideas 🪄"}
          </button>
        </div>
      </div>

      {/* 3 Generated Project Idea Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-[var(--zeno-ink)]">
            Select a High-Impact Blueprint ({ideas.length} ideas for {activeRole})
          </label>
        </div>

        {loadingIdeas ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-5 animate-pulse space-y-3"
              >
                <div className="h-4 bg-zinc-700/30 rounded w-3/4"></div>
                <div className="h-3 bg-zinc-700/20 rounded w-full"></div>
                <div className="h-3 bg-zinc-700/20 rounded w-5/6"></div>
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
      </div>

      {/* Footer launch bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--zeno-border)]">
        <div className="flex items-center gap-2 text-xs text-[var(--zeno-ink-muted)]">
          <span className="font-medium">Planned weekly time:</span>
          {[2, 5, 8, 10].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setWeeklyHours(h)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                weeklyHours === h
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-primary)] text-white"
                  : "border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)]"
              }`}
            >
              {h}h/wk
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy || !selectedIdea}
          onClick={() => void handleLaunch()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--zeno-primary)] hover:bg-[var(--zeno-primary-deep)] px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60"
        >
          {busy ? "Provisioning Sprint…" : `Launch "${selectedIdea?.title ?? activeRole}" Sprint →`}
        </button>
      </div>
    </section>
  );
}



