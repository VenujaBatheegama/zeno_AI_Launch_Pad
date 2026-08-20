import "server-only";

import { cache } from "react";
import { NextResponse } from "next/server";

import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServerConfig } from "./config";

export type AppUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" = "UNAUTHENTICATED",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const getSessionUser = cache(async function getSessionUser(): Promise<AppUser | null> {
  if (!isSupabaseAuthConfigured()) return null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
});

export const requireUser = cache(async function requireUser(): Promise<AppUser> {
  const user = await getSessionUser();
  if (user) return user;

  // Local development fallback while anon key is being configured.
  if (process.env.NODE_ENV === "development" && !isSupabaseAuthConfigured()) {
    const config = getServerConfig();
    return {
      id: config.DEMO_USER_ID,
      email: "demo@zeno.local",
      user_metadata: { display_name: "Demo" },
    };
  }

  throw new AuthError("Sign in to continue.");
});

export const requireUserId = cache(async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
});

export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "FORBIDDEN" ? 403 : 401 },
    );
  }
  return null;
}
