"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ZenoPixelAvatar } from "@/modules/identity/presentation/zeno-mark";

function CvImportIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <rect x="16" y="10" width="34" height="46" rx="4" fill="var(--zeno-primary)" />
      <rect x="22" y="18" width="22" height="3" fill="var(--zeno-violet-soft)" />
      <rect x="22" y="26" width="18" height="3" fill="#fff" opacity="0.85" />
      <rect x="22" y="34" width="20" height="3" fill="#fff" opacity="0.7" />
      <rect x="44" y="28" width="10" height="10" fill="var(--zeno-violet)" />
      <rect x="50" y="40" width="8" height="8" fill="var(--zeno-primary-deep)" />
      <rect x="38" y="46" width="8" height="8" fill="var(--zeno-violet-soft)" />
    </svg>
  );
}

function ChatBuildIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <rect x="12" y="16" width="40" height="28" rx="8" fill="var(--zeno-primary)" />
      <rect x="20" y="24" width="16" height="4" fill="#fff" />
      <rect x="20" y="32" width="24" height="4" fill="var(--zeno-violet-soft)" />
      <rect x="18" y="44" width="8" height="8" fill="var(--zeno-primary)" />
      <rect x="46" y="36" width="12" height="10" rx="2" fill="var(--zeno-violet)" />
      <rect x="50" y="48" width="10" height="8" rx="2" fill="var(--zeno-primary-deep)" />
    </svg>
  );
}

export function WelcomeChoice() {
  const router = useRouter();
  const [selected, setSelected] = useState<"import" | "chat" | null>(null);

  function choose(path: "import" | "chat", href: string) {
    setSelected(path);
    window.setTimeout(() => {
      router.push(href);
    }, 180);
  }

  return (
    <div>
      <header className="border-b border-[var(--zeno-border)] bg-[var(--zeno-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/onboarding" className="inline-flex">
            <span className="font-[family-name:var(--zeno-font-display)] text-[1.1rem] font-bold text-[var(--zeno-ink)]">
              Zeno
            </span>
          </Link>
          <Link
            href="/app/home"
            className="text-xs font-medium text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
          >
            Finish later
          </Link>
        </div>
      </header>
      <div className="mx-auto flex min-h-[80vh] max-w-[880px] flex-col px-4 pb-16 pt-12 sm:pt-16">
        <div className="mx-auto max-w-[560px] text-center">
        <p className="inline-flex items-center gap-2 text-[15px] font-medium text-[var(--zeno-ink-muted)]">
          <ZenoPixelAvatar size={26} />
          Hi, I&apos;m Zeno.
        </p>
        <h1 className="mt-4 text-[1.7rem] font-semibold leading-[1.25] tracking-[-0.01em] text-[var(--zeno-ink)] sm:text-[2.15rem]">
          How would you like to introduce yourself?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[16px] leading-[1.55] text-[var(--zeno-ink-muted)]">
          Before I can find the right opportunities and tailor your CV, I need to
          understand what you&apos;ve studied, built and worked on.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-6">
        <ChoiceCard
          selected={selected === "import"}
          title="Import my current CV"
          body="Upload an existing CV and review the experience, projects and skills Zeno identifies."
          label="Fastest if you already have a CV"
          icon={<CvImportIcon />}
          onSelect={() => choose("import", "/onboarding/import")}
        />
        <ChoiceCard
          selected={selected === "chat"}
          title="Build my profile with Zeno"
          body="Answer a few questions conversationally while Zeno organizes your career evidence."
          label="Best if your CV is incomplete or outdated"
          icon={<ChatBuildIcon />}
          onSelect={() => choose("chat", "/onboarding/chat")}
        />
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/app/home"
          className="text-sm text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] hover:underline"
        >
          I&apos;ll finish this later
        </Link>
      </div>
    </div>
    </div>
  );
}

function ChoiceCard(props: {
  title: string;
  body: string;
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="button"
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
      className={`group relative flex min-h-[280px] flex-col rounded-[var(--zeno-radius-lg)] border bg-[var(--zeno-surface)] p-6 text-left shadow-[var(--zeno-shadow-sm)] transition-all duration-[var(--zeno-dur-base)] ease-[var(--zeno-ease)] sm:min-h-[360px] sm:p-8 ${
        props.selected
          ? "scale-[0.99] border-[var(--zeno-primary)] bg-[var(--zeno-violet-wash)]"
          : "border-[var(--zeno-border)] hover:-translate-y-0.5 hover:border-[var(--zeno-border-hover)] hover:shadow-[var(--zeno-shadow-md)]"
      }`}
    >
      {props.selected ? (
        <span className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--zeno-primary)] text-[11px] text-white">
          ✓
        </span>
      ) : null}
      <div className="mb-6 flex h-[88px] w-[88px] items-center justify-center rounded-[var(--zeno-radius-md)] bg-[var(--zeno-violet-wash)] transition group-hover:bg-[var(--zeno-violet-soft)] sm:h-[120px] sm:w-[120px]">
        {props.icon}
      </div>
      <h2 className="text-[1.15rem] font-semibold leading-snug text-[var(--zeno-ink)] sm:text-[1.35rem]">
        {props.title}
      </h2>
      <p className="mt-2 text-[15px] leading-6 text-[var(--zeno-ink-muted)]">
        {props.body}
      </p>
      <div className="mt-auto pt-4">
        <span className="inline-flex rounded-full bg-[var(--zeno-violet-soft)] px-3 py-1 text-[12.5px] font-medium text-[var(--zeno-primary-deep)]">
          {props.label}
        </span>
      </div>
    </button>
  );
}
