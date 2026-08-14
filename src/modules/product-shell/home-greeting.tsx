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
  "You’re doing the work. Zeno can hold the rest until you’re ready.",
];

const EVENING = [
  "You’ve done enough for today. If you want to talk it through, I’m here.",
  "A quiet evening is a good time to ask what would help tomorrow.",
  "Rest is part of the search too. We can pick this up gently.",
];

function periodForHour(hour: number) {
  if (hour < 12) return "morning" as const;
  if (hour < 18) return "afternoon" as const;
  return "evening" as const;
}

function helloForPeriod(period: ReturnType<typeof periodForHour>) {
  if (period === "morning") return "Good morning";
  if (period === "afternoon") return "Good afternoon";
  return "Good evening";
}

function linesForPeriod(period: ReturnType<typeof periodForHour>) {
  if (period === "morning") return MORNING;
  if (period === "afternoon") return AFTERNOON;
  return EVENING;
}

export function HomeGreeting(props: { name: string }) {
  const period = periodForHour(new Date().getHours());
  const lines = linesForPeriod(period);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, 9000);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <section className="mx-auto max-w-3xl text-center">
      <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.5rem] leading-[1.05] tracking-[-0.04em] text-[var(--zeno-ink)] sm:text-[3.15rem]">
        {helloForPeriod(period)}, {props.name}
      </h1>
      <p
        className="mt-3 text-[15px] leading-relaxed text-[var(--zeno-ink-muted)] transition-opacity duration-500"
        aria-live="polite"
        key={`${period}-${index}`}
      >
        {lines[index]}
      </p>
    </section>
  );
}
