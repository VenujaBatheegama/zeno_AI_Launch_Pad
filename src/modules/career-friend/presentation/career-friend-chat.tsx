"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { TelegramConnectModal } from "@/modules/career-campaign/presentation/telegram-connect-modal";
import type { AgentUIPayload } from "../domain/agent-outputs";

type Message = { role: "user" | "assistant"; content: string; uiPayload?: AgentUIPayload };

const ACTION_LINKS: Record<string, { href: string; label: string }> = {
  view_jobs: { href: "/app/jobs", label: "View jobs & campaigns" },
  job_search: { href: "/app/jobs", label: "Search jobs" },
  review_recommendations: { href: "/app/recommendations", label: "Review recommendations" },
  start_sprint: { href: "/app/growth", label: "Open growth plan" },
  growth_sprint: { href: "/app/growth", label: "Open growth plan" },
  update_profile: { href: "/app/career-profile", label: "Update profile" },
  tailor_cv: { href: "/app/cvs", label: "Open CV & Cover Letter Hub" },
  cover_letter: { href: "/app/cvs?tab=cover-letters", label: "Cover Letters" },
};

const STARTERS = [
  "Find junior remote DevOps jobs",
  "Write a cover letter for my matched job",
  "What skills should I learn next?",
  "What's the biggest gap in my profile?",
  "Tailor my CV for a specific role",
];

// ---------------------------------------------------------------------------
// Lightweight markdown → React renderer
// Handles: **bold**, *italic*, numbered lists, bullet lists, bare links
// (<https://…> and https://… patterns), [text](url), and blank-line paragraphs.
// ---------------------------------------------------------------------------

function InlineContent({ text }: { text: string }) {
  // Split on link patterns first, then handle bold/italic inline.
  const URL_RE = /(\[([^\]]+)\]\((https?:\/\/[^)]+)\))|(<(https?:\/\/[^>]+)>)|(https?:\/\/\S+)/g;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) segments.push(<InlineText key={`t-${lastIndex}`} text={before} />);

    const href = match[3] ?? match[5] ?? match[6]!;
    let label = match[2] ?? href;
    if (label.startsWith("http://") || label.startsWith("https://")) {
      label = "View Listing / Apply";
    }
    segments.push(
      <a
        key={`a-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-medium text-[var(--zeno-primary)] underline-offset-2 hover:underline bg-[var(--zeno-violet-soft)] px-2.5 py-1 rounded-md text-[12px] transition hover:bg-[var(--zeno-violet-wash)] border border-[var(--zeno-border)]/50"
      >
        <span>{label}</span>
        <svg viewBox="0 0 24 24" className="size-3 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(<InlineText key={`t-end`} text={text.slice(lastIndex)} />);
  }

  return <>{segments}</>;
}

function InlineText({ text }: { text: string }) {
  // Handle **bold** and *italic* inline patterns
  const INLINE_RE = /(\*\*(.+?)\*\*)|(\*(.+?)\*)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={m.index} className="font-semibold text-[var(--zeno-ink)]">{m[2]}</strong>);
    else if (m[4]) parts.push(<em key={m.index}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function renderMarkdown(raw: string): React.ReactNode {
  // Split into blocks on blank lines
  const blocks = raw.split(/\n{2,}/);
  const nodes: React.ReactNode[] = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]!.trim();
    if (!block) continue;

    const lines = block.split("\n");

    // Pure bullet list: each line starts with - or *
    const isPureBullet = lines.length > 1 && lines.every((l) => /^[-*]\s/.test(l.trim()));
    if (isPureBullet) {
      nodes.push(
        <ul key={bi} className="my-2 space-y-1.5 pl-1">
          {lines.map((line, li) => {
            const stripped = line.trim().replace(/^[-*]\s+/, "");
            return (
              <li key={li} className="flex items-start gap-2 text-[14px] leading-6 text-[var(--zeno-ink)]">
                <span className="shrink-0 mt-2.5 size-1.5 rounded-full bg-[var(--zeno-primary)] opacity-80" />
                <span className="min-w-0">
                  <InlineContent text={stripped} />
                </span>
              </li>
            );
          })}
        </ul>
      );
      continue;
    }

    // Multi-line Card / Job block (starts with 1. or has location/link sublines)
    const isJobOrCard =
      /^\d+\.\s/.test(lines[0]!) ||
      lines.some((l) => l.includes("📍") || l.includes("🔗") || l.includes("Matches:"));

    if (isJobOrCard) {
      nodes.push(
        <div
          key={bi}
          className="my-2 rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)]/60 px-4 py-3 shadow-[var(--zeno-shadow-sm)] transition hover:border-[var(--zeno-border-hover)]"
        >
          <div className="space-y-1.5">
            {lines.map((line, li) => {
              const cleanLine = line.trim().replace(/^(\d+\.|[-*])\s+/, "");
              if (!cleanLine) return null;
              if (li === 0) {
                return (
                  <div key={li} className="text-[14px] font-semibold text-[var(--zeno-ink)]">
                    <InlineContent text={cleanLine} />
                  </div>
                );
              }
              return (
                <div key={li} className="text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
                  <InlineContent text={cleanLine} />
                </div>
              );
            })}
          </div>
        </div>
      );
      continue;
    }

    // Heading: starts with #
    if (/^#{1,3}\s/.test(lines[0]!)) {
      const text = lines[0]!.replace(/^#+\s/, "");
      nodes.push(
        <p key={bi} className="mt-3 mb-1 text-[13px] font-semibold uppercase tracking-wider text-[var(--zeno-primary-deep)]">
          <InlineContent text={text} />
        </p>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(lines[0]!)) {
      nodes.push(<hr key={bi} className="my-3 border-[var(--zeno-border)]" />);
      continue;
    }

    // Normal paragraph — join lines with a space
    const paragraph = lines.join(" ");
    nodes.push(
      <p key={bi} className="text-[14px] leading-7 text-[var(--zeno-ink)]">
        <InlineContent text={paragraph} />
      </p>
    );
  }

  return <div className="space-y-2.5">{nodes}</div>;
}

function safeRenderMarkdown(raw: string): React.ReactNode {
  try {
    return renderMarkdown(raw);
  } catch {
    return <p className="text-[14px] leading-7 text-[var(--zeno-ink)] whitespace-pre-wrap">{raw}</p>;
  }
}

// ---------------------------------------------------------------------------

export function CareerFriendChat(props: {
  disabled?: boolean;
  featured?: boolean;
}) {
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>(() =>
    props.featured
      ? []
      : [
          {
            role: "assistant",
            content:
              "Ask me about your opportunities, applications, career gaps, or the most useful thing to work on next.",
          },
        ],
  );
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copiedIndex, setCopiedIndex] = useState<number>();
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const featured = Boolean(props.featured);
  const emptyFeatured = featured && messages.length === 0 && !pending;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send(content: string) {
    if (!content || pending || props.disabled) return;
    setMessage("");
    setError(undefined);
    setSuggestedActions([]);
    setMessages((items) => [...items, { role: "user", content }]);
    setPending(true);
    try {
      const response = await fetch("/api/career-friend/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId,
          clientMessageId: crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as {
        conversationId?: string;
        answer?: string;
        suggestedActions?: string[];
        usedModel?: boolean;
        uiPayload?: AgentUIPayload;
        error?: string;
      };
      if (!response.ok || !body.answer) {
        throw new Error(body.error ?? "Zeno could not reply.");
      }
      setConversationId(body.conversationId);
      setMessages((items) => [...items, { role: "assistant", content: body.answer!, uiPayload: body.uiPayload }]);
      setSuggestedActions(body.suggestedActions ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Zeno could not reply.");
    } finally {
      setPending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    await send(message.trim());
  }

  async function copyReply(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => {
        setCopiedIndex((current) => (current === index ? undefined : current));
      }, 1600);
    } catch {
      setError("Could not copy that reply.");
    }
  }

  return (
    <>
      <TelegramConnectModal
        isOpen={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
      />
      <section
        className={
          featured
            ? `flex flex-col ${emptyFeatured ? "" : "min-h-[min(42vh,440px)]"}`
            : "flex flex-col rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] shadow-[var(--zeno-shadow-sm)]"
        }
      >
        {featured ? null : (
          <div className="flex items-center justify-between border-b border-[var(--zeno-border)] px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--zeno-primary)]">
                Career friend
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-[var(--zeno-ink)]">Ask Zeno</h2>
            </div>
            <button
              type="button"
              onClick={() => setTelegramModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--zeno-ink-muted)] hover:border-[#229ED9] hover:text-[#229ED9] transition shadow-sm"
            >
              <svg viewBox="0 0 24 24" className="size-3.5 fill-[#229ED9]">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
              </svg>
              <span>Chat on Phone</span>
            </button>
          </div>
        )}
      <div
        className={`flex-1 space-y-4 overflow-y-auto ${
          featured ? "px-1 py-2" : "max-h-[460px] px-5 py-4"
        }`}
        aria-live="polite"
      >
        {messages.map((item, index) =>
          item.role === "user" ? (
            <div
              key={`user-${index}`}
              className="ml-auto w-fit max-w-[min(92%,36rem)] rounded-2xl bg-[var(--zeno-violet-soft)] px-4 py-2.5 text-[14px] leading-6 text-[var(--zeno-primary-deep)]"
            >
              {item.content}
            </div>
          ) : featured ? (
            <article
              key={`assistant-${index}`}
              className="w-fit max-w-[min(100%,44rem)] rounded-[22px] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]"
            >
              {safeRenderMarkdown(item.content)}
              {item.uiPayload && (
                <div className="mt-4 border-t border-[var(--zeno-border)] pt-4">
                  {item.uiPayload.type === "job_listings" && (
                    <div className="space-y-3">
                      {item.uiPayload.items.map((job) => (
                        <div key={job.id} className="rounded-lg border border-[var(--zeno-border)] p-3">
                          <h4 className="font-semibold text-[var(--zeno-ink)]">{job.title}</h4>
                          <p className="text-sm text-[var(--zeno-ink-muted)]">{job.company} • {job.location}</p>
                          {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="text-sm text-[var(--zeno-primary)] hover:underline">View Job</a>}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.uiPayload.type === "role_recommendations" && (
                    <div className="space-y-3">
                      {item.uiPayload.roles.map((role, i) => (
                        <div key={i} className="rounded-lg border border-[var(--zeno-border)] p-3">
                          <h4 className="font-semibold text-[var(--zeno-ink)]">{role.title}</h4>
                          <p className="text-sm text-[var(--zeno-ink-muted)]">{role.rationale}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.uiPayload.type === "growth_suggestion" && (
                    <div className="rounded-lg border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-4">
                      <h4 className="font-semibold text-[var(--zeno-ink)]">Suggested Project: {item.uiPayload.project}</h4>
                      <p className="text-sm text-[var(--zeno-ink-muted)] mb-3">Addresses gap: {item.uiPayload.gapType}</p>
                      <Link href={item.uiPayload.deepLink} className="inline-flex rounded-md bg-[var(--zeno-primary)] px-3 py-1.5 text-sm font-semibold text-white">Start Project</Link>
                    </div>
                  )}
                  {item.uiPayload.type === "cv_ready" && (
                    <Link href={item.uiPayload.deepLink} className="inline-flex rounded-md border border-[var(--zeno-primary)] text-[var(--zeno-primary)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--zeno-primary)] hover:text-white transition">View Tailored CV</Link>
                  )}
                  {item.uiPayload.type === "cover_letter_ready" && (
                    <Link href={item.uiPayload.deepLink} className="inline-flex rounded-md border border-[var(--zeno-primary)] text-[var(--zeno-primary)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--zeno-primary)] hover:text-white transition">View Cover Letter</Link>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => void copyReply(item.content, index)}
                className="mt-3 text-[12px] font-medium text-[var(--zeno-ink-faint)] hover:text-[var(--zeno-primary)]"
              >
                {copiedIndex === index ? "Copied" : "Copy"}
              </button>
            </article>
          ) : (
            <div
              key={`assistant-${index}`}
              className="w-fit max-w-[92%] rounded-2xl bg-[var(--zeno-violet-wash)] px-4 py-3"
            >
              {safeRenderMarkdown(item.content)}
              {item.uiPayload && (
                <div className="mt-4 border-t border-[var(--zeno-border)]/50 pt-3">
                  <span className="text-sm italic text-[var(--zeno-ink-muted)]">Interactive element rendered below.</span>
                </div>
              )}
            </div>
          ),
        )}
        {pending ? (
          <div className="flex items-center gap-3 rounded-[20px] bg-[var(--zeno-surface)] px-4 py-3 shadow-[var(--zeno-shadow-sm)] border border-[var(--zeno-border)]/60 max-w-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--zeno-primary)] animate-bounce [animation-delay:-0.3s]" />
              <span className="size-2 rounded-full bg-[var(--zeno-primary)] animate-bounce [animation-delay:-0.15s]" />
              <span className="size-2 rounded-full bg-[var(--zeno-primary)] animate-bounce" />
            </span>
            <span className="text-[13px] font-medium text-[var(--zeno-ink-muted)]">
              Zeno is searching…
            </span>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>
      {suggestedActions.length > 0 ? (
        <div className={`flex flex-wrap gap-2 ${featured ? "px-1 pb-3" : "px-5 pb-3"}`}>
          {suggestedActions.map((action) => {
            const link = ACTION_LINKS[action];
            if (!link) return null;
            return (
              <Link
                key={action}
                href={link.href}
                className="rounded-full border border-[var(--zeno-border-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--zeno-primary-deep)] hover:bg-[var(--zeno-violet-wash)] transition-colors"
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      ) : null}
      {emptyFeatured ? (
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto px-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={props.disabled}
              onClick={() => void send(starter)}
              className="rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)]/80 backdrop-blur-sm px-3.5 py-1.5 text-[12px] font-medium text-[var(--zeno-ink-muted)] shadow-[var(--zeno-shadow-sm)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--zeno-primary)]/70 hover:bg-[var(--zeno-surface-elevated)] hover:text-[var(--zeno-ink)] hover:shadow-[0_0_15px_rgba(99,102,241,0.25)] active:scale-95 disabled:opacity-50"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}
      <form
        onSubmit={sendMessage}
        className={featured ? "sticky bottom-0 pt-2 pb-1" : "border-t border-[var(--zeno-border)] p-3 sm:p-4"}
      >
        <div
          className={`flex items-center gap-2 transition-all duration-300 ${
            featured
              ? "rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)]/90 backdrop-blur-md px-3 py-2.5 sm:px-4 sm:py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.36)] focus-within:border-[var(--zeno-primary)]/80 focus-within:shadow-[0_0_25px_rgba(99,102,241,0.25)]"
              : ""
          }`}
        >
          {featured ? (
            <span className="shrink-0 text-[var(--zeno-primary)]" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                <path d="M12 2 13.8 9.2 21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z" />
              </svg>
            </span>
          ) : null}
          <input
            ref={inputRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={props.disabled || pending}
            maxLength={2000}
            placeholder={featured ? "Message Zeno…" : "What should I focus on this week?"}
            aria-label="Message Zeno"
            className={
              featured
                ? "min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[16px] sm:text-[14px] placeholder:text-[var(--zeno-ink-faint)] !outline-none !ring-0 !border-none !shadow-none"
                : "min-w-0 flex-1 rounded-full border border-[var(--zeno-border)] px-4 py-2 text-[16px] sm:text-sm outline-none focus:ring-0 focus:border-[var(--zeno-border-hover)] focus:outline-none"
            }
          />
          <button
            type="submit"
            disabled={props.disabled || pending || !message.trim()}
            className={
              featured
                ? "inline-flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full text-white shadow-[var(--zeno-shadow-sm)] disabled:cursor-not-allowed disabled:opacity-50"
                : "rounded-full px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            }
            style={{ background: "var(--zeno-primary-gradient)" }}
            aria-label={featured ? "Send" : undefined}
          >
            {featured ? (
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            ) : (
              "Send"
            )}
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-xs" style={{ color: "var(--zeno-danger)" }}>
            {error}
          </p>
        ) : null}
        {featured ? null : (
          <p className="mt-2 text-xs text-[var(--zeno-ink-faint)]">
            Advice is grounded in your Zeno profile and activity. Review suggestions before acting.
          </p>
        )}
      </form>
    </section>
  </>
  );
}
