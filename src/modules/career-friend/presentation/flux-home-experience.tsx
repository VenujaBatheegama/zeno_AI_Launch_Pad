"use client";

import Link from "next/link";
import { useState } from "react";
import { Glowing3dOrb } from "./glowing-3d-orb";

type Message = { role: "user" | "assistant"; content: string };

const ACTION_LINKS = {
  view_jobs: { href: "/app/jobs", label: "View jobs & campaigns" },
  review_recommendations: { href: "/app/recommendations", label: "Review recommendations" },
  start_sprint: { href: "/app/growth", label: "Open growth plan" },
  update_profile: { href: "/app/career-profile", label: "Update profile" },
  tailor_cv: { href: "/app/cvs", label: "Open CV Hub" },
} as const;

const PROMPT_STARTERS = [
  "Find remote senior software engineer opportunities matching my profile",
  "Tailor my CV and cover letter for my highest scored job match",
  "What is the most high-impact portfolio project I should build to close skill gaps?",
  "Review my verified career evidence and summarize my strongest competitive advantages",
];

export function FluxHomeExperience(props: {
  userName?: string;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [suggestedActions, setSuggestedActions] = useState<Array<keyof typeof ACTION_LINKS>>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copiedIndex, setCopiedIndex] = useState<number>();
  const [promptDrawer, setPromptDrawer] = useState(false);

  async function send(content: string) {
    if (!content.trim() || pending || props.disabled) return;
    const text = content.trim();
    setInput("");
    setError(undefined);
    setSuggestedActions([]);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setPending(true);

    try {
      const response = await fetch("/api/career-friend/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId,
          clientMessageId: crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as {
        conversationId?: string;
        answer?: string;
        suggestedActions?: Array<keyof typeof ACTION_LINKS>;
        error?: string;
      };
      if (!response.ok || !body.answer) {
        throw new Error(body.error ?? "Zeno could not reply.");
      }
      setConversationId(body.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: body.answer! }]);
      setSuggestedActions(body.suggestedActions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeno could not reply.");
    } finally {
      setPending(false);
    }
  }

  async function copyReply(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((c) => (c === index ? undefined : c)), 1600);
    } catch {
      setError("Could not copy that reply.");
    }
  }

  function handleNewChat() {
    setMessages([]);
    setConversationId(undefined);
    setSuggestedActions([]);
    setInput("");
    setError(undefined);
  }

  return (
    <div className="mx-auto max-w-5xl py-2 px-2 sm:px-4 space-y-8 text-gray-900">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Career Workspace
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-gray-800 transition"
          >
            <span>+</span>
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* Hero Center Section */}
      <div className="mx-auto max-w-2xl text-center space-y-5 pt-4">
        {/* Floating 3D Glowing Globe */}
        <div className="flex justify-center">
          <Glowing3dOrb />
        </div>

        {/* Greeting and Headline */}
        <div className="space-y-2">
          <p className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">
            Hello, {props.userName || "Friend"}
          </p>
          <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl sm:text-4xl md:text-[2.65rem] font-normal tracking-tight text-gray-900 leading-tight">
            Let&apos;s accelerate your career growth.
          </h1>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            Your personal AI assistant for job discovery, verified evidence, and tailored applications.
          </p>
        </div>

        {/* Interactive Chat Stream if active */}
        {messages.length > 0 ? (
          <div className="text-left space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm max-h-96 overflow-y-auto">
            {messages.map((item, index) => {
              const isAssistant = item.role === "assistant";
              return (
                <div
                  key={index}
                  className={`flex flex-col gap-1.5 ${
                    isAssistant ? "items-start" : "items-end"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isAssistant
                        ? "bg-gray-100 text-gray-900 border border-gray-200/80"
                        : "bg-black text-white shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{item.content}</p>
                  </div>
                  {isAssistant ? (
                    <button
                      type="button"
                      onClick={() => void copyReply(item.content, index)}
                      className="text-[11px] text-gray-400 hover:text-gray-600 px-2"
                    >
                      {copiedIndex === index ? "Copied ✓" : "Copy"}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {pending ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
                <span className="inline-block size-2 rounded-full bg-blue-600 animate-ping" />
                <span>Zeno is reasoning against your verified evidence profile…</span>
              </div>
            ) : null}

            {suggestedActions.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {suggestedActions.map((actionKey) => {
                  const action = ACTION_LINKS[actionKey];
                  if (!action) return null;
                  return (
                    <Link
                      key={actionKey}
                      href={action.href}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-200 hover:text-black transition"
                    >
                      <span>{action.label}</span>
                      <span>→</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* The Clean White Command Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="relative rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm text-left transition focus-within:border-gray-400 focus-within:shadow-md"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-1 text-sm text-gray-400">✦</span>
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              disabled={pending || props.disabled}
              placeholder="Initiate a query or send a command to the AI..."
              className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none resize-none leading-relaxed"
            />
          </div>

          {error ? (
            <p className="mt-2 text-xs text-rose-500">{error}</p>
          ) : null}

          {/* Bottom Controls Bar inside Prompt Box */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            {/* Left Action Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                href="/app/career-profile"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
                <span>Attach</span>
              </Link>
              <button
                type="button"
                onClick={() => setPromptDrawer((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
                <span>Browse Prompts</span>
              </button>
              <Link
                href="/app/recommendations"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v7.5a3 3 0 0 1-3 3Z" />
                </svg>
                <span>Voice Records</span>
              </Link>
            </div>

            {/* Right Action Icons & Send Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="size-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
              </button>
              <button
                type="button"
                className="size-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              </button>
              <button
                type="submit"
                disabled={!input.trim() || pending || props.disabled}
                className="size-8 rounded-lg bg-black text-white shadow-sm flex items-center justify-center transition hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick Prompts Dropdown Drawer */}
          {promptDrawer ? (
            <div className="mt-3 border-t border-gray-100 pt-3 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Suggested Prompts
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PROMPT_STARTERS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setPromptDrawer(false);
                      void send(prompt);
                    }}
                    className="text-left rounded-lg p-2 text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 hover:text-black transition"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </form>
      </div>

      {/* 3 Bottom Feature Cards (Matching the clean FLUX reference image) */}
      <div className="grid gap-4 sm:grid-cols-3 pt-4">
        {/* Card 1: Job Discovery & Campaigns */}
        <Link
          href="/app/jobs"
          className="group rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-gray-600 group-hover:text-black transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
              </svg>
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Campaigns
            </span>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            Job Campaigns
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Scan live global feeds and get deterministic match fit scoring against your verified skills.
          </p>
        </Link>

        {/* Card 2: CV & Cover Letter Tailoring */}
        <Link
          href="/app/cvs"
          className="group rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-gray-600 group-hover:text-black transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Tailoring
            </span>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            Tailored CV & Cover Letter
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Generate ATS-optimized CVs and factually grounded cover letters customized for target roles.
          </p>
        </Link>

        {/* Card 3: Growth Engine & Sprints */}
        <Link
          href="/app/growth"
          className="group rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-gray-600 group-hover:text-black transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Growth
            </span>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            Growth Engine
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Systematically close verified market skill gaps with structured portfolio project milestones.
          </p>
        </Link>
      </div>
    </div>
  );
}
