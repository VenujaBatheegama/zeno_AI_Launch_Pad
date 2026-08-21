"use client";

import Link from "next/link";
import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const ACTION_LINKS = {
  view_jobs: { href: "/app/jobs", label: "View jobs & campaigns" },
  review_recommendations: { href: "/app/recommendations", label: "Review recommendations" },
  start_sprint: { href: "/app/growth", label: "Open growth plan" },
  update_profile: { href: "/app/career-profile", label: "Update profile" },
  tailor_cv: { href: "/app/cvs", label: "Open CV & Cover Letter Hub" },
} as const;

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
    const label = match[2] ?? href;
    segments.push(
      <a
        key={`a-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-[var(--zeno-primary)] underline-offset-2 hover:underline"
      >
        {label}
        <svg viewBox="0 0 24 24" className="size-3 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="2">
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

    // Numbered list block: starts with "1." or "2." etc.
    const isNumbered = /^\d+\.\s/.test(lines[0]!);
    // Bullet list block: starts with "- " or "* "
    const isBullet = /^[-*]\s/.test(lines[0]!);

    if (isNumbered || isBullet) {
      const items: React.ReactNode[] = [];
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li]!.trim();
        if (!line) continue;
        // Strip leading "1. " / "- " / "* "
        const stripped = line.replace(/^(\d+\.|[-*])\s+/, "");
        items.push(
          <li
            key={li}
            className="flex gap-3 py-2 border-b border-[var(--zeno-border)] last:border-0"
          >
            {isNumbered ? (
              <span className="shrink-0 flex size-5 items-center justify-center rounded-full bg-[var(--zeno-violet-soft)] text-[10px] font-bold text-[var(--zeno-primary)]">
                {li + 1}
              </span>
            ) : (
              <span className="shrink-0 mt-[5px] size-1.5 rounded-full bg-[var(--zeno-primary)] opacity-70" />
            )}
            <span className="min-w-0 text-[14px] leading-6 text-[var(--zeno-ink)]">
              <InlineContent text={stripped} />
            </span>
          </li>
        );
      }
      nodes.push(
        <ul key={bi} className={`my-1 space-y-0 ${isNumbered ? "list-none" : "list-none pl-1"}`}>
          {items}
        </ul>
      );
      continue;
    }

    // Heading: starts with #
    if (/^#{1,3}\s/.test(lines[0]!)) {
      const text = lines[0]!.replace(/^#+\s/, "");
      nodes.push(
        <p key={bi} className="mt-2 mb-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--zeno-ink-muted)]">
          <InlineContent text={text} />
        </p>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(lines[0]!)) {
      nodes.push(<hr key={bi} className="my-2 border-[var(--zeno-border)]" />);
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

  return <div className="space-y-2">{nodes}</div>;
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
  const [suggestedActions, setSuggestedActions] = useState<Array<keyof typeof ACTION_LINKS>>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copiedIndex, setCopiedIndex] = useState<number>();

  const featured = Boolean(props.featured);
  const emptyFeatured = featured && messages.length === 0 && !pending;

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
        suggestedActions?: Array<keyof typeof ACTION_LINKS>;
        usedModel?: boolean;
        error?: string;
      };
      if (!response.ok || !body.answer) {
        throw new Error(body.error ?? "Zeno could not reply.");
      }
      setConversationId(body.conversationId);
      setMessages((items) => [...items, { role: "assistant", content: body.answer! }]);
      setSuggestedActions(body.suggestedActions ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Zeno could not reply.");
    } finally {
      setPending(false);
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
    <section
      className={
        featured
          ? `flex flex-col ${emptyFeatured ? "" : "min-h-[min(42vh,440px)]"}`
          : "flex flex-col rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] shadow-[var(--zeno-shadow-sm)]"
      }
    >
      {featured ? null : (
        <div className="border-b border-[var(--zeno-border)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--zeno-primary)]">
            Career friend
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--zeno-ink)]">Ask Zeno</h2>
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
              className="ml-auto max-w-[min(92%,36rem)] rounded-full bg-[var(--zeno-violet-soft)] px-4 py-2.5 text-[14px] leading-6 text-[var(--zeno-primary-deep)]"
            >
              {item.content}
            </div>
          ) : featured ? (
            <article
              key={`assistant-${index}`}
              className="max-w-[min(100%,44rem)] rounded-[22px] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]"
            >
              {renderMarkdown(item.content)}
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
              className="max-w-[92%] rounded-2xl bg-[var(--zeno-violet-wash)] px-4 py-3"
            >
              {renderMarkdown(item.content)}
            </div>
          ),
        )}
        {pending ? (
          <p className="text-sm text-[var(--zeno-ink-muted)]">Zeno is thinking…</p>
        ) : null}
      </div>
      {suggestedActions.length > 0 ? (
        <div className={`flex flex-wrap gap-2 ${featured ? "px-1 pb-3" : "px-5 pb-3"}`}>
          {suggestedActions.map((action) => (
            <Link
              key={action}
              href={ACTION_LINKS[action].href}
              className="rounded-full border border-[var(--zeno-border-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--zeno-primary-deep)]"
            >
              {ACTION_LINKS[action].label}
            </Link>
          ))}
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
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={props.disabled || pending}
            maxLength={2000}
            placeholder={featured ? "Message Zeno…" : "What should I focus on this week?"}
            aria-label="Message Zeno"
            className={
              featured
                ? "min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[16px] sm:text-[14px] outline-none placeholder:text-[var(--zeno-ink-faint)]"
                : "min-w-0 flex-1 rounded-full border border-[var(--zeno-border)] px-4 py-2 text-[16px] sm:text-sm outline-none focus:border-[var(--zeno-border-hover)]"
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
  );
}
