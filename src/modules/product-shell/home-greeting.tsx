"use client";

import { useEffect, useState } from "react";

const MORNING = [
  "A clear morning is a good place to begin. What would make today feel useful?",
  "No rush. Zeno is already watching the roles you care about.",
  "If you have a few minutes, we can sort what matters before the day fills up.",
];

const AFTERNOON = [
  "Glad you stopped by. We can take this at an easy pace.",
  "If the search feels noisy, we can narrow it to one next step.",
  "You're doing the work. Zeno can hold the rest until you're ready.",
];

const EVENING = [
  "You've done enough for today. If you want to talk it through, I'm here.",
  "A quiet evening is a good time to ask what would help tomorrow.",
  "Rest is part of the search too. We can pick this up gently.",
];

type Period = "morning" | "afternoon" | "evening";

function periodForHour(hour: number): Period {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function helloForPeriod(period: Period) {
  if (period === "morning") return "morning";
  if (period === "afternoon") return "afternoon";
  return "evening";
}

function linesForPeriod(period: Period) {
  if (period === "morning") return MORNING;
  if (period === "afternoon") return AFTERNOON;
  return EVENING;
}

export function HomeGreeting(props: { name: string }) {
  // Defer period resolution to client-only to avoid SSR/hydration mismatch.
  const [period, setPeriod] = useState<Period>("morning");
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const p = periodForHour(new Date().getHours());
    setPeriod(p);
    setMounted(true);
  }, []);

  useEffect(() => {
    const lines = linesForPeriod(period);
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, 9000);
    return () => window.clearInterval(id);
  }, [period]);

  const lines = linesForPeriod(period);

  return (
    <section className="mx-auto max-w-3xl text-center select-none transition-all duration-700">
      <h1 className="font-[family-name:var(--zeno-font-display)] text-[1.85rem] font-bold leading-[1.15] tracking-tight sm:text-[2.5rem] md:text-[2.85rem] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <span className="text-[var(--zeno-ink-faint)]">Good </span>
        <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-indigo-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(245,158,11,0.3)]">
          {mounted ? helloForPeriod(period) : "morning"}
        </span>
        <span className="text-[var(--zeno-ink-faint)]">, </span>
        <span className="text-[var(--zeno-ink)]">{props.name}</span>
      </h1>
      <p
        className="mt-4 text-[15px] leading-relaxed text-[var(--zeno-ink-muted)] transition-opacity duration-700"
        aria-live="polite"
        key={`${period}-${index}`}
      >
        {mounted ? lines[index] : MORNING[0]}
      </p>
    </section>
  );
}
