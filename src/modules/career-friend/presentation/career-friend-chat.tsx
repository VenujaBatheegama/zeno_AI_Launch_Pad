"use client";

import Link from "next/link";
import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const ACTION_LINKS = {
  view_jobs: { href: "/app/jobs", label: "View jobs" },
  review_recommendations: { href: "/app/recommendations", label: "Review inbox" },
  start_sprint: { href: "/app/growth", label: "Open growth plan" },
  update_profile: { href: "/app/career-profile", label: "Update profile" },
} as const;

const STARTERS = [
  "What should I focus on this week?",
  "Any new matches I should look at?",
  "What's the biggest gap in my profile?",
];

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
          : "flex flex-col rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-white shadow-[var(--zeno-shadow-sm)]"
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
          featured ? "px-1 py-2" : "max-h-[360px] px-5 py-4"
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
              className="max-w-[min(100%,40rem)] rounded-[22px] bg-white px-5 py-4 shadow-[var(--zeno-shadow-sm)]"
            >
              <p className="whitespace-pre-wrap text-[14px] leading-7 text-[var(--zeno-ink)]">
                {item.content}
              </p>
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
              className="max-w-[92%] rounded-2xl bg-[var(--zeno-violet-wash)] px-4 py-3 text-[14px] leading-7 text-[var(--zeno-ink)]"
            >
              {item.content}
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
        <div className="mb-3 flex flex-wrap justify-center gap-2 px-1">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={props.disabled}
              onClick={() => void send(starter)}
              className="rounded-full bg-white px-3.5 py-2 text-[12px] font-medium text-[var(--zeno-ink-muted)] shadow-[var(--zeno-shadow-sm)] transition hover:text-[var(--zeno-ink)] disabled:opacity-50"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}
      <form
        onSubmit={sendMessage}
        className={featured ? "sticky bottom-0 pt-2" : "border-t border-[var(--zeno-border)] p-4"}
      >
        <div
          className={`flex items-center gap-2 ${
            featured
              ? "rounded-full border border-[var(--zeno-border)] bg-white px-3 py-2 shadow-[var(--zeno-shadow-md)]"
              : ""
          }`}
        >
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={props.disabled || pending}
            maxLength={2000}
            placeholder={featured ? "Message Zeno…" : "What should I focus on this week?"}
            aria-label="Message Zeno"
            className={
              featured
                ? "min-w-0 flex-1 bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-[var(--zeno-ink-faint)]"
                : "min-w-0 flex-1 rounded-full border border-[var(--zeno-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--zeno-border-hover)]"
            }
          />
          <button
            type="submit"
            disabled={props.disabled || pending || !message.trim()}
            className={
              featured
                ? "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--zeno-primary)] text-white disabled:cursor-not-allowed disabled:opacity-50"
                : "rounded-full bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            }
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
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        {featured ? null : (
          <p className="mt-2 text-xs text-[var(--zeno-ink-faint)]">
            Advice is grounded in your Zeno profile and activity. Review suggestions before acting.
          </p>
        )}
      </form>
    </section>
  );
}
