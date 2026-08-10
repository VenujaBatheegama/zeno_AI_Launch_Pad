"use client";

import { createBrowserClient } from "@supabase/ssr";

import { tryGetSupabasePublicEnv } from "./env";

export function createBrowserSupabaseClient() {
  const env = tryGetSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase browser auth is not configured. Add NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
    );
  }
  return createBrowserClient(env.url, env.anonKey);
}
