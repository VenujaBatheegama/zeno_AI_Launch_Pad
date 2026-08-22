"use client";

import Link from "next/link";
import { useState } from "react";
import { Glowing3dOrb } from "./glowing-3d-orb";

type Message = { role: "user" | "assistant"; content: string };

const ACTION_LINKS: Record<string, { href: string; label: string }> = {
  view_jobs: { href: "/app/jobs", label: "View jobs & campaigns" },
  job_search: { href: "/app/jobs", label: "Search jobs" },
  review_recommendations: { href: "/app/recommendations", label: "Review recommendations" },
  start_sprint: { href: "/app/growth", label: "Open growth plan" },
  growth_sprint: { href: "/app/growth", label: "Open growth plan" },
  update_profile: { href: "/app/career-profile", label: "Update profile" },
  tailor_cv: { href: "/app/cvs", label: "Open CV Hub" },
  cover_letter: { href: "/app/cvs?tab=cover-letters", label: "Cover Letters" },
};

const QUICK_PILLS = [
  { label: "Find Opportunities", icon: "💼", prompt: "Find recent senior and mid software engineering opportunities matching my verified skills" },
  { label: "Tailor CV", icon: "📄", prompt: "How do I tailor my CV and cover letter for my highest scored job match?" },
  { label: "Growth Sprint", icon: "🚀", prompt: "What is the single most valuable technical project I should build to close my market gaps?" },
  { label: "Explore Paths", icon: "💡", prompt: "Analyze my verified career profile and outline high-growth career trajectories for me" },
];

export function ZyriconHomeExperience(props: {
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
  const [modelDropdown, setModelDropdown] = useState(false);

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

  return (
    <div className="relative min-h-[calc(100vh-5rem)] rounded-[32px] border border-white/10 bg-[#161223]/90 p-5 sm:p-8 md:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-2xl text-white overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-96 rounded-full bg-gradient-to-b from-purple-600/20 via-pink-500/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-80 rounded-full bg-purple-900/20 blur-3xl" />

      {/* Top Header Controls Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
        {/* Model Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setModelDropdown((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-purple-200 transition hover:bg-white/10 hover:border-purple-400/50"
          >
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zeno Career Intelligence v4.0</span>
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5 opacity-70">
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>

          {modelDropdown ? (
            <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl border border-white/10 bg-[#1e172e] p-2 shadow-2xl backdrop-blur-xl z-30">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-purple-400/80">
                Active Intelligence
              </div>
              <button
                type="button"
                onClick={() => setModelDropdown(false)}
                className="w-full text-left rounded-xl px-3 py-2 text-xs font-medium text-white bg-purple-500/20 flex items-center justify-between"
              >
                <span>Hybrid Match & Groq 70B</span>
                <span className="text-[10px] text-purple-300">Active</span>
              </button>
              <button
                type="button"
                onClick={() => setModelDropdown(false)}
                className="w-full text-left rounded-xl px-3 py-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition"
              >
                Deterministic Evidence Engine
              </button>
            </div>
          ) : null}
        </div>

        {/* Right Header Buttons */}
        <div className="flex items-center gap-2">
          <Link
            href="/app/settings"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/10 hover:text-white"
          >
            <span>Configuration</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </Link>
          <Link
            href="/app/jobs"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/10 hover:text-white"
          >
            <span>Opportunities</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Main Center Area */}
      <div className="relative z-10 mx-auto max-w-2xl py-8 sm:py-10 text-center space-y-6">
        {/* Floating 3D Glowing Globe */}
        <Glowing3dOrb />

        {/* Hero Title */}
        <div className="space-y-2">
          <h1 className="font-[family-name:var(--zeno-font-display)] text-3xl sm:text-4xl md:text-[2.65rem] font-medium tracking-tight text-white">
            Ready to Create Something New?
          </h1>
          <p className="text-sm text-purple-200/70">
            {props.userName ? `Welcome back, ${props.userName}. ` : ""}Ask anything about opportunities, tailored CVs, or career growth.
          </p>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {QUICK_PILLS.map((pill) => (
            <button
              key={pill.label}
              type="button"
              onClick={() => void send(pill.prompt)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-purple-200/90 transition hover:border-purple-400/60 hover:bg-purple-500/15 hover:text-white"
            >
              <span>{pill.icon}</span>
              <span>{pill.label}</span>
            </button>
          ))}
        </div>

        {/* Interactive Chat Stream if active */}
        {messages.length > 0 ? (
          <div className="text-left space-y-4 rounded-2xl border border-white/10 bg-[#1b152b]/80 p-5 backdrop-blur-md max-h-96 overflow-y-auto">
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
                        ? "bg-[#251c3a] border border-white/10 text-purple-100"
                        : "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-600/20"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{item.content}</p>
                  </div>
                  {isAssistant ? (
                    <button
                      type="button"
                      onClick={() => void copyReply(item.content, index)}
                      className="text-[11px] text-purple-300/60 hover:text-purple-200 px-2"
                    >
                      {copiedIndex === index ? "Copied ✓" : "Copy"}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {pending ? (
              <div className="flex items-center gap-2 text-xs text-purple-300 animate-pulse">
                <span className="inline-block size-2 rounded-full bg-fuchsia-400 animate-ping" />
                <span>Zeno is reasoning against your verified evidence profile…</span>
              </div>
            ) : null}

            {suggestedActions.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                {suggestedActions.map((actionKey) => {
                  const action = ACTION_LINKS[actionKey];
                  if (!action) return null;
                  return (
                    <Link
                      key={actionKey}
                      href={action.href}
                      className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/20 border border-purple-400/30 px-3 py-1 text-xs font-semibold text-purple-200 hover:bg-purple-500/30 hover:text-white transition"
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

        {/* The Main Glowing Prompt Container */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="relative rounded-2xl border border-purple-500/30 bg-[#1d162d]/80 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 focus-within:border-purple-400 focus-within:shadow-[0_0_30px_rgba(168,85,247,0.25)] text-left"
        >
          <div className="flex items-start gap-3">
            <span className="mt-1 text-base text-fuchsia-400">✦</span>
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
              placeholder="Ask anything about opportunities, tailored CVs, or career growth..."
              className="w-full bg-transparent text-sm text-white placeholder:text-purple-300/40 outline-none resize-none leading-relaxed"
            />
          </div>

          {error ? (
            <p className="mt-2 text-xs text-rose-400">{error}</p>
          ) : null}

          {/* Bottom Controls Bar inside Prompt Box */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
            <div className="flex items-center gap-4 text-xs text-purple-300/70">
              <Link
                href="/app/career-profile"
                className="inline-flex items-center gap-1.5 hover:text-purple-200 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
                <span>Attach</span>
              </Link>
              <Link
                href="/app/jobs"
                className="inline-flex items-center gap-1.5 hover:text-purple-200 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                </svg>
                <span>Settings</span>
              </Link>
              <Link
                href="/app/recommendations"
                className="inline-flex items-center gap-1.5 hover:text-purple-200 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                </svg>
                <span>Options</span>
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="size-8 rounded-full flex items-center justify-center text-purple-300/80 hover:bg-white/10 hover:text-white transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v7.5a3 3 0 0 1-3 3Z" />
                </svg>
              </button>
              <button
                type="submit"
                disabled={!input.trim() || pending || props.disabled}
                className="size-9 rounded-full bg-gradient-to-tr from-purple-600 to-fuchsia-500 hover:from-purple-500 hover:to-fuchsia-400 text-white shadow-lg shadow-purple-600/40 flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 3 Bottom Feature Cards (Matching the design image) */}
      <div className="relative z-10 grid gap-4 sm:grid-cols-3 pt-4">
        {/* Card 1: Job Discovery & Campaigns */}
        <Link
          href="/app/jobs"
          className="group rounded-2xl border border-white/10 bg-[#1b1528]/70 p-5 backdrop-blur-lg transition-all duration-300 hover:border-purple-500/40 hover:bg-[#201832]/90 hover:-translate-y-0.5 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <span className="flex size-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300">
              💼
            </span>
            <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-300 group-hover:bg-purple-500/20 group-hover:border-purple-400/40 transition">
              Find Jobs
            </span>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-white group-hover:text-purple-200 transition">
            Job Campaign Engine
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-purple-200/60">
            Real-time market scanning and deterministic fit scoring from active search campaigns.
          </p>
        </Link>

        {/* Card 2: CV & Cover Letter Tailoring */}
        <Link
          href="/app/cvs"
          className="group rounded-2xl border border-white/10 bg-[#1b1528]/70 p-5 backdrop-blur-lg transition-all duration-300 hover:border-purple-500/40 hover:bg-[#201832]/90 hover:-translate-y-0.5 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <span className="flex size-9 items-center justify-center rounded-xl bg-fuchsia-500/20 text-fuchsia-300">
              📄
            </span>
            <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-fuchsia-300 group-hover:bg-fuchsia-500/20 group-hover:border-fuchsia-400/40 transition">
              Tailor Materials
            </span>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-white group-hover:text-fuchsia-200 transition">
            Tailored CV & Cover Letter
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-purple-200/60">
            Transform verified experiences into ATS-optimized CVs and factually grounded cover letters.
          </p>
        </Link>

        {/* Card 3: Career Growth Advisor */}
        <Link
          href="/app/growth"
          className="group rounded-2xl border border-white/10 bg-[#1b1528]/70 p-5 backdrop-blur-lg transition-all duration-300 hover:border-purple-500/40 hover:bg-[#201832]/90 hover:-translate-y-0.5 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <span className="flex size-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
              🚀
            </span>
            <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-300 group-hover:bg-cyan-500/20 group-hover:border-cyan-400/40 transition">
              Start Sprint
            </span>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-white group-hover:text-cyan-200 transition">
            Career Growth Advisor
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-purple-200/60">
            Systematically bridge verified market gaps with structured portfolio milestone sprints.
          </p>
        </Link>
      </div>
    </div>
  );
}
