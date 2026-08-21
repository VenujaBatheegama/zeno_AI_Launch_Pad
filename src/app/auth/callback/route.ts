import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/onboarding";
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.searchParams.delete("code");
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");
  redirectTo.searchParams.delete("next");
  redirectTo.searchParams.delete("error");
  redirectTo.searchParams.delete("error_description");

  if (error || error_description) {
    redirectTo.pathname = "/auth/sign-in";
    redirectTo.searchParams.set(
      "error",
      error_description || error || "Authentication failed. Please try again.",
    );
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createServerSupabaseClient();

  if (token_hash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!verifyError) {
      return NextResponse.redirect(redirectTo);
    }
  }

  if (code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(redirectTo);
    }
  }

  // If user session already exists in cookies, proceed to app
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return NextResponse.redirect(redirectTo);
  }

  redirectTo.pathname = "/auth/sign-in";
  redirectTo.searchParams.set(
    "info",
    "Email confirmed. Please sign in with your credentials.",
  );
  return NextResponse.redirect(redirectTo);
}
