export function humanizeAuthError(error: unknown): string {
  const message =
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message.toLocaleLowerCase()
      : String(error).toLocaleLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Those credentials look incorrect. Check your email and password.";
  }
  if (message.includes("user already registered")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email before signing in. Check your inbox for a link.";
  }
  if (message.includes("password should be")) {
    return "Use a password with at least 6 characters.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (message.includes("expired") || message.includes("otp")) {
    return "This reset link has expired. Request a new one.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Network problem. Check your connection and try again.";
  }

  return "Something went wrong. Please try again.";
}
