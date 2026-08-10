"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { ZenoMark } from "@/modules/identity/presentation/zeno-mark";
import type { UserProfile } from "@/modules/identity/domain/profile";

const NAV = [
  { href: "/app/home", label: "Home" },
  { href: "/app/jobs", label: "Jobs" },
  { href: "/app/career-profile", label: "Career Profile" },
  { href: "/app/cvs", label: "CVs" },
  { href: "/app/settings", label: "Settings" },
] as const;

export function AppShell(props: {
  profile: UserProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const incomplete = props.profile.onboardingStatus !== "completed";

  async function signOut() {
    if (isSupabaseAuthConfigured()) {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    }
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--zeno-bg)] text-[var(--zeno-ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--zeno-border)] bg-[color-mix(in_srgb,var(--zeno-bg)_92%,white)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/app/home" className="shrink-0">
              <ZenoMark />
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {NAV.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)]"
                        : "text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-violet-wash)] hover:text-[var(--zeno-ink)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {incomplete ? (
              <Link
                href="/onboarding"
                className="hidden rounded-full bg-[var(--zeno-violet-soft)] px-3 py-1 text-xs font-medium text-[var(--zeno-primary-deep)] sm:inline-flex"
              >
                Profile {props.profile.onboardingProgress}%
              </Link>
            ) : null}
            <div className="relative">
              <button
                type="button"
                className="rounded-full border border-[var(--zeno-border)] bg-white px-3 py-1.5 text-sm font-medium"
                onClick={() => setMenuOpen((value) => !value)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {props.profile.displayName || "Account"}
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-44 rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-white p-1 shadow-[var(--zeno-shadow-md)]"
                >
                  <Link
                    href="/app/settings"
                    className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--zeno-violet-wash)]"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--zeno-violet-wash)]"
                    role="menuitem"
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-md border border-[var(--zeno-border)] px-2 py-1 text-sm md:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Open navigation"
            >
              Menu
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav className="border-t border-[var(--zeno-border)] px-4 py-2 md:hidden" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block py-2 text-sm font-medium text-[var(--zeno-ink-muted)]"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{props.children}</main>
    </div>
  );
}
