import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const AUTH_PATHS = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/callback",
  "/auth/verify",
];

const PUBLIC_PREFIXES = ["/auth", "/_next", "/favicon", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const { response, user, configured } = await updateSession(request);

  // Without browser auth env, do not crash the app. Let pages load so the
  // user can see setup guidance / continue local development.
  if (!configured) {
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return response;
  }

  const authenticated = Boolean(user);

  if (!authenticated && !isPublicPath(pathname) && !isAuthPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (authenticated && isAuthPath(pathname) && pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/app/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (authenticated && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/app/home";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
