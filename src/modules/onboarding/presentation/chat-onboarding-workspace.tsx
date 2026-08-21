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
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [composerContext, setComposerContext] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const sendingRef = useRef(false);

  const progress = useMemo(() => progressFromEvidence(evidence), [evidence]);

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
  }, [messages, busy]);

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
        onboardingState: {
          stage: next.stage,
          messages: next.messages,
          draftEvidence: next.evidence,
          focusedEntityId: next.focusedEntityId,
          completedScriptKeys: next.completedScriptKeys,
        },
        draftEvidence: next.evidence,
        displayName: next.evidence.profile.full_name,
      }),
    });
    setSaveLabel("Saved just now");
  }

  async function sendAnswer(text: string) {
    const answer = text.trim();
    if (!answer || busy || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    setError(null);
    const clientMessageId = crypto.randomUUID();
    const userMessage: ConversationMessage = {
      id: clientMessageId,
      role: "user",
      text: composerContext
        ? `${composerContext}\n\n${answer}`
        : answer,
    };
    const pending = dedupeMessages([...messages, userMessage]);
    setMessages(pending);
    setDraft("");
    setComposerContext(null);

    try {
      const response = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.text,
          clientMessageId,
          stage,
          evidence,
          messages: pending,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not process that answer.");
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
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-6xl flex-col lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col border-[var(--zeno-border)] lg:w-[60%] lg:border-r">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--zeno-border)] px-4 py-3">
          <div>
            <p className="text-xs font-medium text-[var(--zeno-ink-muted)]">
              {stageLabel(stage)} · {progress}%
            </p>
            <p className="text-sm text-[var(--zeno-ink-faint)]">{saveLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/home"
              className="rounded-full border border-[var(--zeno-border)] px-3 py-1 text-sm"
            >
              Finish later
            </Link>
            <button
              type="button"
              className="rounded-full border border-[var(--zeno-border)] px-3 py-1 text-sm lg:hidden"
              onClick={() => setMobileProfileOpen(true)}
            >
              View profile
            </button>
          </div>
        </div>
        <div
          ref={scrollerRef}
          className="flex-1 space-y-4 overflow-y-auto bg-[#f6f5fb] px-4 py-5"
          aria-live="polite"
        >
          <p className="text-center text-xs text-[var(--zeno-ink-faint)]">
            We’re online …
          </p>
          {dedupeMessages(messages).map((message, index) =>
            message.role === "zeno" ? (
              <div
                key={`${message.id}-${index}`}
                className="flex items-end gap-2.5"
              >
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[var(--zeno-surface)] shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
                  <Image
                    src="/zeno-agent.jpeg"
                    alt="Zeno"
                    fill
                    sizes="36px"
                    className="object-cover object-top"
                  />
                </div>
                <div className="w-fit max-w-[min(78%,22rem)] whitespace-pre-wrap rounded-[18px] bg-[var(--zeno-surface)] px-3.5 py-2.5 text-[14px] leading-6 text-[var(--zeno-ink)] shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
                  {message.text}
                </div>
              </div>
            ) : (
              <div
                key={`${message.id}-${index}`}
                className="flex justify-end"
              >
                <div className="w-fit max-w-[min(78%,22rem)] whitespace-pre-wrap rounded-[18px] bg-[var(--zeno-primary)] px-3.5 py-2.5 text-[14px] leading-6 text-white shadow-[0_4px_14px_rgba(76,58,227,0.28)]">
                  {message.text}
                </div>
              </div>
            ),
          )}
          {busy ? (
            <div className="flex items-end gap-2.5">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[var(--zeno-surface)] shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
                <Image
                  src="/zeno-agent.jpeg"
                  alt="Zeno"
                  fill
                  sizes="36px"
                  className="object-cover object-top"
                />
              </div>
              <div className="w-fit rounded-[18px] bg-[var(--zeno-surface)] px-3.5 py-2.5 text-sm text-[var(--zeno-ink-faint)] shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
                Zeno is thinking…
              </div>
            </div>
          ) : null}
        </div>
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
                  : "Enter message"
              }
              className="min-h-[48px] w-full resize-none rounded-full border-0 bg-[#eef0f4] py-3 pl-4 pr-14 text-sm text-[var(--zeno-ink)] outline-none placeholder:text-[var(--zeno-ink-faint)] focus:ring-2 focus:ring-[var(--zeno-primary)]/20"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send message"
              className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--zeno-primary)] text-white transition hover:bg-[var(--zeno-primary-deep)] disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </section>

      <aside
        className={`${
          mobileProfileOpen ? "fixed inset-0 z-40 flex" : "hidden"
        } min-h-0 flex-col bg-[var(--zeno-surface)] lg:static lg:flex lg:w-[40%]`}
      >
        <div className="flex items-center justify-between border-b border-[var(--zeno-border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Live career profile</h2>
          <button
            type="button"
            className="text-sm text-[var(--zeno-ink-muted)] lg:hidden"
            onClick={() => setMobileProfileOpen(false)}
          >
            Close
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
          <LiveProfilePanel
            evidence={evidence}
            focusedEntityId={focusedEntityId}
            onAskZeno={(context) => {
              setComposerContext(context);
              setMobileProfileOpen(false);
            }}
            onChange={saveManualEvidence}
          />
        </div>
        <div className="sticky bottom-0 border-t border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4">
          <p className="text-sm font-medium">Profile completeness: {progress}%</p>
          <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
            {progress < 40
              ? "Keep chatting — Zeno will fill this as you go."
              : "Review the draft, then confirm when it looks right."}
          </p>
          <button
            type="button"
            disabled={busy || progress < 40}
            onClick={() => {
              if (
                window.confirm(
                  "Confirm your career profile?\n\nZeno will use this information to match jobs and create tailored CVs. You can edit it later.",
                )
              ) {
                void verifyProfile();
              }
            }}
            className="mt-3 min-h-[44px] w-full rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
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
        <p className="font-medium">
          {evidence.profile.full_name || "Name still needed"}
        </p>
        <p className="text-[var(--zeno-ink-muted)]">
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
          <p className="text-[var(--zeno-ink-faint)]">Missing</p>
        ) : (
          evidence.work_experience.map((item) => (
            <article
              key={item.id}
              className={`rounded-[var(--zeno-radius-sm)] border p-3 ${
                focusedEntityId === item.id
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-wash)]"
                  : "border-[var(--zeno-border)]"
              }`}
            >
              <p className="font-semibold">{item.role || "Role needed"}</p>
              <p className="text-[var(--zeno-ink-muted)]">
                {item.employer || "Employer needed"}
              </p>
              <p className="mt-1 text-xs text-[var(--zeno-ink-faint)]">
                {formatDates(item.start_date, item.end_date, item.is_current)}
              </p>
              {item.bullets.map((bullet, bulletIndex) => (
                <p
                  key={`${item.id}-bullet-${bulletIndex}`}
                  className="mt-1 text-[var(--zeno-ink-muted)]"
                >
                  • {bullet}
                </p>
              ))}
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[var(--zeno-primary)]"
                onClick={() =>
                  props.onAskZeno(
                    `Change this experience (${item.role} at ${item.employer}, id ${item.id})`,
                  )
                }
              >
                Ask Zeno to change this
              </button>
            </article>
          ))
        )}
      </Section>

      <Section title="Projects">
        {evidence.projects.length === 0 ? (
          <p className="text-[var(--zeno-ink-faint)]">Missing</p>
        ) : (
          evidence.projects.map((item) => (
            <article
              key={item.id}
              className={`rounded-[var(--zeno-radius-sm)] border p-3 ${
                focusedEntityId === item.id
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-wash)]"
                  : "border-[var(--zeno-border)]"
              }`}
            >
              <p className="font-semibold">{item.name}</p>
              <p className="text-[var(--zeno-ink-muted)]">
                {item.technologies.join(" · ") || "Technologies pending"}
              </p>
              {item.bullets.slice(0, 2).map((bullet, bulletIndex) => (
                <p
                  key={`${item.id}-project-bullet-${bulletIndex}`}
                  className="mt-1 text-[var(--zeno-ink-muted)]"
                >
                  {bullet}
                </p>
              ))}
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[var(--zeno-primary)]"
                onClick={() =>
                  props.onAskZeno(
                    `Change this project (${item.name}, id ${item.id})`,
                  )
                }
              >
                Ask Zeno to change this
              </button>
            </article>
          ))
        )}
      </Section>

      <Section title="Skills">
        {evidence.skills.length === 0 ? (
          <p className="text-[var(--zeno-ink-faint)]">Missing</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {evidence.skills.map((skill) => (
              <span
                key={skill.id}
                className="rounded-full bg-[var(--zeno-violet-wash)] px-2.5 py-1 text-xs font-medium text-[var(--zeno-primary-deep)]"
              >
                {skill.name}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Education">
        {evidence.education.length === 0 ? (
          <p className="text-[var(--zeno-ink-faint)]">Missing</p>
        ) : (
          evidence.education.map((item) => (
            <p key={item.id} className="text-[var(--zeno-ink-muted)]">
              {item.qualification || "Qualification"} · {item.institution}
            </p>
          ))
        )}
      </Section>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--zeno-ink-muted)]">
        {props.title}
      </h3>
      <div className="mt-2 space-y-2">{props.children}</div>
    </section>
  );
}

function QuickEdit(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-2 block space-y-1">
      <span className="text-xs text-[var(--zeno-ink-muted)]">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-2 py-1.5"
      />
    </label>
  );
}

function formatDates(
  start: string | null,
  end: string | null,
  isCurrent: boolean,
): string {
  if (!start && !end) return "Dates: Still needed";
  if (isCurrent || !end) return `${start ?? "Start unknown"} – Present`;
  return `${start ?? "Start unknown"} – ${end}`;
}

function dedupeMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const seen = new Set<string>();
  const result: ConversationMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    result.push(message);
  }
  return result;
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 -translate-x-px translate-y-px"
      fill="currentColor"
    >
      <path d="M3.4 20.6 21 12 3.4 3.4l-.1 6.8L14 12l-10.7 1.8.1 6.8Z" />
    </svg>
  );
}
