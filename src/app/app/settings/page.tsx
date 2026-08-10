"use client";

import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export default function SettingsPage() {
  const router = useRouter();

  async function signOut() {
    if (isSupabaseAuthConfigured()) {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    }
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Manage your Zeno account.
        </p>
      </header>
      <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Sign out</h2>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          You can sign back in anytime with the same email.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-4 rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 py-2 text-sm font-semibold hover:border-[var(--zeno-border-hover)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
