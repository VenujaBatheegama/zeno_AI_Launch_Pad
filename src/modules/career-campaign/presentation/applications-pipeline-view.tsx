"use client";

import Link from "next/link";
import { useState } from "react";
import { Send, Mic, PartyPopper, XCircle, Rocket, Inbox } from "lucide-react";
import { ManualApplicationModal } from "./manual-application-modal";

type ReadyKitItem = {
  packetId: string;
  recommendationId: string;
  title: string;
  companyName: string | null;
  status: string;
  applicationUrl: string | null;
};

type ApplicationItem = {
  id: string;
  title: string;
  companyName: string | null;
  status: "ready" | "applied" | "interview" | "rejected" | "offer" | "withdrawn";
  appliedAt: string | null;
  interviewAt: string | null;
  followUpDueAt: string | null;
  userNote: string | null;
};

export function ApplicationsPipelineView(props: {
  readyKits: ReadyKitItem[];
  applications: ApplicationItem[];
}) {
  const [activeTab, setActiveTab] = useState<"ready" | "pipeline">(
    props.readyKits.length > 0 ? "ready" : "pipeline",
  );
  const [modalOpen, setModalOpen] = useState(false);

  const STATUS_BADGES: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    ready: { label: "Ready to Submit", bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400", icon: null },
    applied: { label: "Applied", bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400", icon: <Send className="w-3.5 h-3.5" /> },
    interview: { label: "Interviewing", bg: "bg-purple-500/10 border-purple-500/30", text: "text-purple-400", icon: <Mic className="w-3.5 h-3.5" /> },
    offer: { label: "Offer Received", bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-400", icon: <PartyPopper className="w-3.5 h-3.5" /> },
    rejected: { label: "Closed", bg: "bg-zinc-500/10 border-zinc-500/30", text: "text-zinc-400", icon: <XCircle className="w-3.5 h-3.5" /> },
    withdrawn: { label: "Withdrawn", bg: "bg-zinc-500/10 border-zinc-500/30", text: "text-zinc-400", icon: <XCircle className="w-3.5 h-3.5" /> },
  };

  return (
    <div className="space-y-6">
      <ManualApplicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl tracking-[-0.02em] text-[var(--zeno-ink)]">
            Applications & Tracking
          </h1>
          <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
            Review ready-to-apply kits prepared by Zeno and track your interview pipeline.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--zeno-primary)] hover:bg-[var(--zeno-primary-deep)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition self-start sm:self-auto"
        >
          <span>+</span>
          <span>Log Application / Interview</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-[var(--zeno-border)] gap-6">
        <button
          type="button"
          onClick={() => setActiveTab("ready")}
          className={`pb-3 text-sm font-semibold transition border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "ready"
              ? "border-[var(--zeno-primary)] text-[var(--zeno-primary-deep)]"
              : "border-transparent text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
          }`}
        >
          <Rocket className="w-4 h-4" />
          <span>Ready to Apply</span>
          <span className="rounded-full bg-[var(--zeno-violet-soft)] px-2 py-0.5 text-xs font-bold text-[var(--zeno-primary)]">
            {props.readyKits.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pipeline")}
          className={`pb-3 text-sm font-semibold transition border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "pipeline"
              ? "border-[var(--zeno-primary)] text-[var(--zeno-primary-deep)]"
              : "border-transparent text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>Active Pipeline</span>
          <span className="rounded-full bg-[var(--zeno-surface-elevated)] px-2 py-0.5 text-xs font-bold text-[var(--zeno-ink)]">
            {props.applications.length}
          </span>
        </button>
      </div>

      {/* Ready to Apply Kits */}
      {activeTab === "ready" ? (
        <section className="space-y-3">
          {props.readyKits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-8 text-center space-y-3">
              <p className="text-sm text-[var(--zeno-ink-muted)]">
                No ready-to-apply kits right now. Accept a job recommendation or tailor a CV to prepare one!
              </p>
              <div>
                <Link
                  href="/app/jobs"
                  className="inline-flex rounded-xl bg-[var(--zeno-surface-elevated)] border border-[var(--zeno-border)] px-4 py-2 text-xs font-semibold text-[var(--zeno-ink)] hover:border-[var(--zeno-primary)]"
                >
                  Explore Jobs & Recommendations →
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {props.readyKits.map((kit) => (
                <Link
                  key={kit.packetId}
                  href={`/app/packets/${kit.packetId}`}
                  className="block rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5 shadow-[var(--zeno-shadow-sm)] hover:border-[var(--zeno-border-hover)] transition group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[15px] text-[var(--zeno-ink)] group-hover:text-[var(--zeno-primary)] transition">
                        {kit.title}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-[var(--zeno-ink-muted)]">
                        {kit.companyName ?? "Direct Employer"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 text-[11px] font-semibold text-blue-400">
                      Kit Ready
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-[var(--zeno-border)] text-xs text-[var(--zeno-ink-muted)]">
                    <span>Includes: Tailored CV & Cover Letter</span>
                    <span className="font-semibold text-[var(--zeno-primary)] group-hover:underline">
                      Review & Apply →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Active Pipeline */}
      {activeTab === "pipeline" ? (
        <section className="space-y-3">
          {props.applications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-8 text-center space-y-3">
              <p className="text-sm text-[var(--zeno-ink-muted)]">
                No active applications logged yet.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex rounded-xl bg-[var(--zeno-primary)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--zeno-primary-deep)] transition"
                >
                  + Log Application or Interview
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {props.applications.map((app) => {
                const badge = STATUS_BADGES[app.status] ?? STATUS_BADGES.applied!;
                return (
                  <Link
                    key={app.id}
                    href={`/app/applications/${app.id}`}
                    className="block rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 shadow-[var(--zeno-shadow-sm)] hover:border-[var(--zeno-border-hover)] transition group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-[15px] text-[var(--zeno-ink)] group-hover:text-[var(--zeno-primary)] transition">
                          {app.title}
                        </h3>
                        <p className="text-xs text-[var(--zeno-ink-muted)]">
                          {app.companyName ?? "Direct Employer"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${badge.bg} ${badge.text}`}
                        >
                          {badge.icon && <span className="mr-1.5 flex-shrink-0">{badge.icon}</span>}
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--zeno-ink-muted)] pt-2.5 border-t border-[var(--zeno-border)]">
                      {app.appliedAt ? (
                        <span>Applied: {app.appliedAt.slice(0, 10)}</span>
                      ) : null}
                      {app.interviewAt ? (
                        <span className="font-semibold text-purple-400">
                          🎙️ Interview: {app.interviewAt.slice(0, 10)}
                        </span>
                      ) : null}
                      {app.userNote ? (
                        <span className="truncate max-w-md italic opacity-80">
                          Note: "{app.userNote}"
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
