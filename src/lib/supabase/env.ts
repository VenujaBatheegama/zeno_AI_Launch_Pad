export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

export function tryGetSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  ).trim();

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const env = tryGetSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return env;
}

export function isSupabaseAuthConfigured(): boolean {
  return tryGetSupabasePublicEnv() !== null;
}
