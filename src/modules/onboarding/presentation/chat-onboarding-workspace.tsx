"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import {
  emptyCareerEvidence,
  progressForStage,
  stageLabel,
  type ConversationMessage,
  type OnboardingStage,
} from "../domain/conversation-machine";
import { openingScriptMessage } from "../domain/conversation-script";
import { progressFromEvidence } from "../domain/profile-operations";
import {
  BasicsContactCard,
  RolesAndSkillsCard,
  ExperienceCard,
  ProjectsEducationCard,
  ReviewVerificationCard,
} from "./onboarding-interactive-cards";

export function ChatOnboardingWorkspace(props: {
  initialStage?: OnboardingStage;
  initialEvidence?: CareerEvidence | null;
  initialMessages?: ConversationMessage[];
  initialFocusedEntityId?: string | null;
  initialCompletedScriptKeys?: string[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<OnboardingStage>(
    props.initialStage ?? "about_you",
  );
  const [evidence, setEvidence] = useState<CareerEvidence>(
    props.initialEvidence ?? emptyCareerEvidence(),
  );
  const [messages, setMessages] = useState<ConversationMessage[]>(() =>
    dedupeMessages(props.initialMessages ?? []),
  );
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(
    props.initialFocusedEntityId ?? null,
  );
  const [completedScriptKeys, setCompletedScriptKeys] = useState<string[]>(
    props.initialCompletedScriptKeys ?? [],
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Saved");
  const [error, setError] = useState<string | null>(null);
  const [composerContext, setComposerContext] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const sendingRef = useRef(false);

  const progress = useMemo(() => progressFromEvidence(evidence), [evidence]);

  // Determine active interactive card step
  const activeStep = useMemo(() => {
    if (!evidence.profile.full_name?.trim()) return "basics";
    if (evidence.skills.length === 0 && !completedScriptKeys.includes("skills_done")) return "roles_skills";
    if (evidence.work_experience.length === 0 && !completedScriptKeys.includes("experience_skipped")) return "experience";
    if (evidence.projects.length === 0 && evidence.education.length === 0 && !completedScriptKeys.includes("projects_skipped")) return "projects_education";
    return "review";
  }, [evidence, completedScriptKeys]);

  useEffect(() => {
    if (messages.length > 0 || openedRef.current) return;
    openedRef.current = true;
    const opening: ConversationMessage = {
      id: "intro",
      role: "zeno",
      text: openingScriptMessage(),
    };
    setMessages([opening]);
    void persist({
      stage,
      evidence,
      messages: [opening],
      focusedEntityId,
      completedScriptKeys,
    });
    // Intentionally run once on mount for a fresh conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy, activeStep]);

  async function persist(next: {
    stage: OnboardingStage;
    evidence: CareerEvidence;
    messages: ConversationMessage[];
    focusedEntityId: string | null;
    completedScriptKeys: string[];
  }) {
    setSaveLabel("Saving…");
    await fetch("/api/onboarding/progress", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        onboardingMethod: "conversation",
        onboardingStatus:
          next.stage === "review" ? "awaiting_verification" : "in_progress",
        onboardingCurrentStep: next.stage,
        onboardingProgress: Math.max(
          progressForStage(next.stage),
          progressFromEvidence(next.evidence),
        ),
        onboardingEvidenceSnapshot: next.evidence,
        conversationHistory: next.messages,
        focusedEntityId: next.focusedEntityId,
        completedScriptKeys: next.completedScriptKeys,
      }),
    });
    setSaveLabel("Saved just now");
  }

  async function sendAnswer(rawAnswer: string) {
    const trimmed = rawAnswer.trim();
    if (!trimmed || busy || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    setError(null);
    setDraft("");
    setComposerContext(null);

    const clientMessageId = crypto.randomUUID();
    const userMessage: ConversationMessage = {
      id: clientMessageId,
      role: "user",
      text: trimmed,
    };
    const pending = [...messages, userMessage];
    setMessages(dedupeMessages(pending));

    try {
      const response = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMessageId,
          message: trimmed,
          stage,
          evidence,
          messages,
          focusedEntityId,
          completedScriptKeys,
        }),
      });
      const payload = (await response.json()) as {
        assistantMessage?: string;
        evidence?: CareerEvidence;
        stage?: OnboardingStage;
        messages?: ConversationMessage[];
        focusedEntityId?: string | null;
        completedScriptKeys?: string[];
        error?: string;
      };
      if (!response.ok || !payload.evidence || !payload.stage) {
        throw new Error(payload.error ?? "Zeno couldn't process that turn.");
      }

      setEvidence(payload.evidence);
      setStage(payload.stage);
      setFocusedEntityId(payload.focusedEntityId ?? null);
      setCompletedScriptKeys(payload.completedScriptKeys ?? []);
      setMessages(dedupeMessages(payload.messages ?? pending));
      setSaveLabel("Saved just now");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "I couldn't process that. Your answer is still here — try again.";
      setError(message);
      setMessages((current) =>
        dedupeMessages([
          ...current,
          {
            id: crypto.randomUUID(),
            role: "zeno",
            text: message,
          },
        ]),
      );
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function saveManualEvidence(next: CareerEvidence) {
    setEvidence(next);
    await persist({
      stage,
      evidence: next,
      messages,
      focusedEntityId,
      completedScriptKeys,
    });
  }

  async function verifyProfile() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Verification failed.");
      }
      router.push("/app/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-6xl flex-col bg-[var(--zeno-bg)] text-[var(--zeno-ink)] lg:flex-row">
      {/* Left Chat & Guided Form Section */}
      <section className="flex min-h-0 flex-1 flex-col border-[var(--zeno-border)] lg:w-[60%] lg:border-r">
        {/* Header Strip */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-[var(--zeno-primary)]">
              {stageLabel(stage)} · {progress}% complete
            </p>
            <p className="text-xs text-[var(--zeno-ink-faint)]">{saveLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/home"
              className="rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 py-1 text-xs font-medium text-[var(--zeno-ink-muted)] transition hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
            >
              Finish later
            </Link>
          </div>
        </div>

        {/* Message Feed & Interactive Cards Container */}
        <div
          ref={scrollerRef}
          className="flex-1 space-y-4 overflow-y-auto bg-[var(--zeno-bg)] px-4 py-5"
          aria-live="polite"
        >
          {dedupeMessages(messages).map((message, index) => {
            const isLastZenoMessage =
              message.role === "zeno" &&
              index ===
                messages
                  .map((m, i) => (m.role === "zeno" ? i : -1))
                  .filter((i) => i !== -1)
                  .pop();

            return (
              <div key={`${message.id}-${index}`} className="space-y-2">
                {message.role === "zeno" ? (
                  <div className="flex items-start gap-3">
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] shadow-[var(--zeno-shadow-sm)]">
                      <Image
                        src="/zeno-agent.jpeg"
                        alt="Zeno"
                        fill
                        sizes="32px"
                        className="object-cover object-top"
                      />
                    </div>
                    <div className="w-fit max-w-[min(88%,28rem)] whitespace-pre-wrap rounded-[18px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-3 text-[14px] leading-relaxed text-[var(--zeno-ink)] shadow-[var(--zeno-shadow-sm)]">
                      {message.text}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="w-fit max-w-[min(85%,26rem)] whitespace-pre-wrap rounded-[18px] bg-[var(--zeno-primary)] px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-[0_4px_14px_rgba(76,58,227,0.3)]">
                      {message.text}
                    </div>
                  </div>
                )}

                {/* Render Interactive Card below the latest Zeno message */}
                {isLastZenoMessage && !busy ? (
                  <div className="pl-11 pr-2">
                    {activeStep === "basics" ? (
                      <BasicsContactCard
                        initialEvidence={evidence}
                        onSubmit={(msg) => void sendAnswer(msg)}
                        disabled={busy}
                      />
                    ) : activeStep === "roles_skills" ? (
                      <RolesAndSkillsCard
                        initialEvidence={evidence}
                        onSubmit={(msg) => {
                          setCompletedScriptKeys((prev) => [...prev, "skills_done"]);
                          void sendAnswer(msg);
                        }}
                        disabled={busy}
                      />
                    ) : activeStep === "experience" ? (
                      <ExperienceCard
                        initialEvidence={evidence}
                        onSubmit={(msg) => void sendAnswer(msg)}
                        onSkip={() => {
                          setCompletedScriptKeys((prev) => [...prev, "experience_skipped"]);
                          void sendAnswer("I don't have work experience to add right now. Move on.");
                        }}
                        disabled={busy}
                      />
                    ) : activeStep === "projects_education" ? (
                      <ProjectsEducationCard
                        initialEvidence={evidence}
                        onSubmit={(msg) => void sendAnswer(msg)}
                        onSkip={() => {
                          setCompletedScriptKeys((prev) => [...prev, "projects_skipped"]);
                          void sendAnswer("Skip projects and education for now.");
                        }}
                        disabled={busy}
                      />
                    ) : (
                      <ReviewVerificationCard
                        evidence={evidence}
                        progress={progress}
                        onVerify={() => void verifyProfile()}
                        disabled={busy}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          {busy ? (
            <div className="flex items-start gap-3">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] shadow-[var(--zeno-shadow-sm)]">
                <Image
                  src="/zeno-agent.jpeg"
                  alt="Zeno"
                  fill
                  sizes="32px"
                  className="object-cover object-top"
                />
              </div>
              <div className="w-fit rounded-[18px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-2.5 text-sm text-[var(--zeno-ink-muted)] shadow-[var(--zeno-shadow-sm)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 animate-bounce rounded-full bg-[var(--zeno-primary)]" />
                  <span className="size-2 animate-bounce rounded-full bg-[var(--zeno-primary)] [animation-delay:0.2s]" />
                  <span className="size-2 animate-bounce rounded-full bg-[var(--zeno-primary)] [animation-delay:0.4s]" />
                  <span className="ml-1 text-xs">Zeno is updating profile…</span>
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Bottom Freeform Composer Bar */}
        <div className="border-t border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-3">
          {error ? (
            <p className="mb-2 text-xs text-[var(--zeno-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          {composerContext ? (
            <p className="mb-2 text-xs text-[var(--zeno-ink-muted)]">
              Context: {composerContext}
            </p>
          ) : null}
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              void sendAnswer(draft);
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
              placeholder={
                composerContext
                  ? "Tell Zeno what you want to change…"
                  : "Or type any response freely here…"
              }
              className="min-h-[46px] w-full resize-none rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] py-2.5 pl-4 pr-14 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none placeholder:text-[var(--zeno-ink-faint)] focus:border-[var(--zeno-primary)]"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send message"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--zeno-primary)] text-white transition hover:opacity-90 disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </section>

      {/* Desktop Side Live Profile Panel (Visible on lg screens) */}
      <aside className="hidden min-h-0 flex-col border-[var(--zeno-border)] bg-[var(--zeno-surface)] lg:flex lg:w-[40%]">
        <div className="flex items-center justify-between border-b border-[var(--zeno-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--zeno-ink)]">
            Live career profile
          </h2>
          <span className="rounded-full bg-[var(--zeno-violet-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--zeno-primary-deep)]">
            {progress}% Complete
          </span>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
          <LiveProfilePanel
            evidence={evidence}
            focusedEntityId={focusedEntityId}
            onAskZeno={(context) => setComposerContext(context)}
            onChange={saveManualEvidence}
          />
        </div>
        <div className="sticky bottom-0 border-t border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4">
          <button
            type="button"
            disabled={busy || progress < 25}
            onClick={() => {
              if (
                window.confirm(
                  "Confirm your career profile?\n\nZeno will use this information to match jobs and create tailored CVs. You can edit it later.",
                )
              ) {
                void verifyProfile();
              }
            }}
            className="min-h-[44px] w-full rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--zeno-shadow-sm)] transition hover:opacity-90 disabled:opacity-50"
          >
            Verify and finish profile
          </button>
        </div>
      </aside>
    </div>
  );
}

function LiveProfilePanel(props: {
  evidence: CareerEvidence;
  focusedEntityId: string | null;
  onAskZeno: (context: string) => void;
  onChange: (evidence: CareerEvidence) => void;
}) {
  const { evidence, focusedEntityId } = props;
  return (
    <div className="space-y-4 text-sm">
      <Section title="About you">
        <p className="font-medium text-[var(--zeno-ink)]">
          {evidence.profile.full_name || "Name still needed"}
        </p>
        <p className="text-xs text-[var(--zeno-ink-muted)]">
          {[evidence.profile.email, evidence.profile.location]
            .filter(Boolean)
            .join(" · ") || "Contact details pending"}
        </p>
        <QuickEdit
          label="Name"
          value={evidence.profile.full_name ?? ""}
          onChange={(value) =>
            props.onChange({
              ...evidence,
              profile: { ...evidence.profile, full_name: value || null },
            })
          }
        />
      </Section>

      <Section title="Experience">
        {evidence.work_experience.length === 0 ? (
          <p className="text-xs text-[var(--zeno-ink-faint)]">No work experience added yet</p>
        ) : (
          evidence.work_experience.map((item) => (
            <article
              key={item.id}
              className={`rounded-[var(--zeno-radius-sm)] border p-3 ${
                focusedEntityId === item.id
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-surface-elevated)]"
                  : "border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)]"
              }`}
            >
              <p className="font-semibold text-[var(--zeno-ink)]">{item.role || "Role needed"}</p>
              <p className="text-xs text-[var(--zeno-ink-muted)]">
                {item.employer || "Employer needed"}
              </p>
              <p className="mt-1 text-xs text-[var(--zeno-ink-faint)]">
                {formatDates(item.start_date, item.end_date, item.is_current)}
              </p>
              {item.bullets.map((bullet, bulletIndex) => (
                <p
                  key={`${item.id}-bullet-${bulletIndex}`}
                  className="mt-1 text-xs text-[var(--zeno-ink-muted)]"
                >
                  • {bullet}
                </p>
              ))}
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[var(--zeno-primary)]"
                onClick={() =>
                  props.onAskZeno(
                    `Let's update the experience at ${item.employer || item.role}.`,
                  )
                }
              >
                Ask Zeno to update this role
              </button>
            </article>
          ))
        )}
      </Section>

      <Section title="Projects">
        {evidence.projects.length === 0 ? (
          <p className="text-xs text-[var(--zeno-ink-faint)]">No projects added yet</p>
        ) : (
          evidence.projects.map((project) => (
            <article
              key={project.id}
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3"
            >
              <p className="font-semibold text-[var(--zeno-ink)]">{project.name}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {project.technologies.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-[var(--zeno-surface)] px-1.5 py-0.5 text-[11px] text-[var(--zeno-primary)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
              {project.bullets.map((bullet, i) => (
                <p key={i} className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
                  • {bullet}
                </p>
              ))}
            </article>
          ))
        )}
      </Section>

      <Section title="Education">
        {evidence.education.length === 0 ? (
          <p className="text-xs text-[var(--zeno-ink-faint)]">No education added yet</p>
        ) : (
          evidence.education.map((edu) => (
            <article
              key={edu.id}
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3"
            >
              <p className="font-semibold text-[var(--zeno-ink)]">
                {edu.qualification || edu.field_of_study || "Qualification"}
              </p>
              <p className="text-xs text-[var(--zeno-ink-muted)]">
                {edu.institution} {edu.field_of_study && edu.qualification ? `· ${edu.field_of_study}` : ""}
              </p>
            </article>
          ))
        )}
      </Section>

      <Section title="Skills">
        {evidence.skills.length === 0 ? (
          <p className="text-xs text-[var(--zeno-ink-faint)]">No skills captured yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {evidence.skills.map((skill) => (
              <span
                key={skill.name}
                className="rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-2.5 py-1 text-xs text-[var(--zeno-ink)]"
              >
                {skill.name}
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-3.5 shadow-[var(--zeno-shadow-sm)]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function QuickEdit(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(props.value);
  return (
    <div className="pt-1">
      <button
        type="button"
        className="text-xs font-semibold text-[var(--zeno-primary)] hover:underline"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Done" : `Edit ${props.label.toLowerCase()}`}
      </button>
      {open ? (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="h-8 flex-1 rounded border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-2 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
          />
          <button
            type="button"
            className="rounded bg-[var(--zeno-primary)] px-3 text-xs font-semibold text-white"
            onClick={() => {
              props.onChange(draft.trim());
              setOpen(false);
            }}
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}

function dedupeMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const seen = new Set<string>();
  const out: ConversationMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    out.push(message);
  }
  return out;
}

function formatDates(
  start?: string | null,
  end?: string | null,
  isCurrent?: boolean,
) {
  if (!start && !end) return "Dates pending";
  const startPart = start || "Unknown start";
  const endPart = isCurrent ? "Present" : end || "Unknown end";
  return `${startPart} — ${endPart}`;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
