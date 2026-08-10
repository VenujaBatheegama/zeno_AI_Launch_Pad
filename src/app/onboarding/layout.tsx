import Link from "next/link";

import { ZenoMark } from "@/modules/identity/presentation/zeno-mark";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--zeno-bg)]">
      <header className="border-b border-[var(--zeno-border)] bg-[color-mix(in_srgb,var(--zeno-bg)_90%,white)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <ZenoMark />
          <Link
            href="/app/home"
            className="text-sm text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] hover:underline"
          >
            Finish later
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
