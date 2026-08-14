"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { ZenoMark } from "@/modules/identity/presentation/zeno-mark";
import type { UserProfile } from "@/modules/identity/domain/profile";

const NAV = [
  { href: "/app/home", label: "Home", icon: "home" },
  { href: "/app/recommendations", label: "Inbox", icon: "jobs" },
  { href: "/app/jobs", label: "Jobs", icon: "jobs" },
  { href: "/app/growth", label: "Growth", icon: "growth" },
  { href: "/app/applications", label: "Apps", icon: "cvs" },
  { href: "/app/cvs", label: "CVs", icon: "cvs" },
  { href: "/app/career-profile", label: "Profile", icon: "profile" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
] as const;

export function AppShell(props: {
  profile: UserProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const incomplete = props.profile.onboardingStatus !== "completed";
  const bleedWorkspace =
    pathname.startsWith("/app/cvs/tailor") ||
    pathname.startsWith("/app/cvs/matched");

  const crumb = useMemo(() => breadcrumbLabel(pathname), [pathname]);
  const initials = initialsFromName(props.profile.displayName);

  async function signOut() {
    if (isSupabaseAuthConfigured()) {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    }
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-[var(--zeno-bg)] text-[var(--zeno-ink)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-[var(--zeno-border)] bg-white lg:flex">
        <div className="px-5 py-5">
          <Link href="/app/home" className="inline-flex">
            <ZenoMark className="font-[family-name:var(--zeno-font-display)] text-[1.15rem] tracking-[-0.02em]" />
          </Link>
        </div>

        <nav className="flex-1 px-3" aria-label="Primary">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--zeno-ink-faint)]">
            Workspace
          </p>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition ${
                      active
                        ? "bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)]"
                        : "text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-violet-wash)] hover:text-[var(--zeno-ink)]"
                    }`}
                  >
                    <NavIcon name={item.icon} active={active} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[var(--zeno-border)] p-3">
          <div className="flex items-center gap-2.5 rounded-[12px] px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--zeno-violet-soft)] text-[11px] font-semibold text-[var(--zeno-primary-deep)]">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--zeno-ink)]">
                {props.profile.displayName || "Account"}
              </p>
              <p className="truncate text-[11px] text-[var(--zeno-ink-muted)]">
                Job seeker
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[232px] flex-col bg-white shadow-[var(--zeno-shadow-lg)]">
            <div className="flex items-center justify-between px-4 py-4">
              <ZenoMark className="font-[family-name:var(--zeno-font-display)]" />
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-[var(--zeno-ink-muted)]"
                onClick={() => setMobileNavOpen(false)}
              >
                Close
              </button>
            </div>
            <nav className="flex-1 px-3" aria-label="Mobile">
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--zeno-ink-faint)]">
                Workspace
              </p>
              <ul className="space-y-0.5">
                {NAV.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium ${
                          active
                            ? "bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)]"
                            : "text-[var(--zeno-ink-muted)]"
                        }`}
                      >
                        <NavIcon name={item.icon} active={active} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--zeno-border)] bg-[color-mix(in_srgb,var(--zeno-bg)_88%,white)] px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-md border border-[var(--zeno-border)] px-2 py-1 text-sm lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            Menu
          </button>

          <p className="hidden text-[13px] text-[var(--zeno-ink-muted)] sm:block">
            <span className="text-[var(--zeno-ink-faint)]">Zeno</span>
            <span className="mx-1.5 text-[var(--zeno-ink-faint)]">/</span>
            <span className="font-medium text-[var(--zeno-ink)]">{crumb}</span>
          </p>

          <div className="mx-auto hidden w-full max-w-md md:block">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--zeno-ink-faint)]">
                <SearchIcon />
              </span>
              <input
                type="search"
                placeholder="Search jobs, evidence, applications"
                className="h-9 w-full rounded-full border border-[var(--zeno-border)] bg-white pl-9 pr-3 text-[13px] text-[var(--zeno-ink)] outline-none placeholder:text-[var(--zeno-ink-faint)] focus:border-[var(--zeno-border-hover)]"
              />
            </label>
          </div>

          <div className="ml-auto flex items-center gap-2">
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
                className="flex size-8 items-center justify-center rounded-full bg-[var(--zeno-violet-soft)] text-[11px] font-semibold text-[var(--zeno-primary-deep)]"
                onClick={() => setMenuOpen((value) => !value)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {initials}
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
          </div>
        </header>

        <main
          className={
            bleedWorkspace
              ? "min-h-0 flex-1 overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
          }
        >
          {bleedWorkspace ? (
            props.children
          ) : (
            <div className="mx-auto w-full max-w-6xl">{props.children}</div>
          )}
        </main>
      </div>
    </div>
  );
}

function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function breadcrumbLabel(pathname: string): string {
  if (pathname.startsWith("/app/cvs")) return "CVs";
  if (pathname.startsWith("/app/recommendations")) return "Inbox";
  if (pathname.startsWith("/app/applications")) return "Applications";
  if (pathname.startsWith("/app/packets")) return "Packet";
  if (pathname.startsWith("/app/jobs")) return "Jobs";
  if (pathname.startsWith("/app/growth")) return "Growth";
  if (pathname.startsWith("/app/career-profile")) return "Profile";
  if (pathname.startsWith("/app/settings")) return "Settings";
  if (pathname.startsWith("/app/home")) return "Home";
  return "Workspace";
}

function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "Z";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function NavIcon({
  name,
  active,
}: {
  name: (typeof NAV)[number]["icon"];
  active: boolean;
}) {
  const className = `size-4 shrink-0 ${active ? "opacity-100" : "opacity-80"}`;
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "jobs":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "cvs":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
        </svg>
      );
    case "growth":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M5 20V10M12 20V4M19 20v-7" />
          <path d="m4 8 6-5 5 4 5-4" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    default:
      return null;
  }
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}
