"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { humanizeAuthError } from "../domain/auth-messages";

function Field(props: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5" htmlFor={props.id}>
      <span className="text-sm font-medium text-[var(--zeno-ink)]">
        {props.label}
      </span>
      <div className="relative">
        <input
          id={props.id}
          type={props.type ?? "text"}
          value={props.value}
          autoComplete={props.autoComplete}
          required={props.required}
          onChange={(event) => props.onChange(event.target.value)}
          className="w-full rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 py-2.5 text-[16px] sm:text-[15px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)]"
        />
        {props.children}
      </div>
    </label>
  );
}

function SubmitButton(props: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={props.loading}
      className="inline-flex w-full items-center justify-center rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--zeno-primary-deep)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {props.loading ? "Please wait…" : props.label}
    </button>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-danger)]/25 bg-[var(--zeno-danger-soft)]/50 px-3 py-2 text-sm text-[var(--zeno-danger)]"
    >
      {message}
    </p>
  );
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/app/home";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  const authConfigured = isSupabaseAuthConfigured();

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {!authConfigured ? (
        <div className="space-y-3 rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-violet-wash)] px-3 py-3 text-sm text-[var(--zeno-ink)]">
          <p>
            Browser auth is not configured yet. Add{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
            <code className="text-xs">.env.local</code>, then restart the dev
            server.
          </p>
          <Link
            href="/app/matching"
            className="inline-flex font-semibold text-[var(--zeno-primary)] hover:underline"
          >
            Continue locally without sign-in
          </Link>
        </div>
      ) : null}
      <ErrorBanner message={error} />
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
      />
      <Field
        id="password"
        label="Password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
      >
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-[var(--zeno-ink-muted)]"
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </Field>
      <div className="flex justify-end">
        <Link
          href="/auth/forgot-password"
          className="text-sm font-medium text-[var(--zeno-primary)] hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <SubmitButton loading={loading} label="Sign in" />
    </form>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() || undefined },
          emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
        },
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }
      setInfo(
        "Check your email to confirm your account, then sign in to continue.",
      );
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <ErrorBanner message={error} />
      {info ? (
        <p className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-success)]/25 bg-[var(--zeno-success-soft)]/50 px-3 py-2 text-sm text-[var(--zeno-success)]">
          {info}
        </p>
      ) : null}
      <Field
        id="displayName"
        label="Display name"
        value={displayName}
        onChange={setDisplayName}
        autoComplete="name"
      />
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
      />
      <Field
        id="password"
        label="Password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
      >
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-[var(--zeno-ink-muted)]"
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </Field>
      <SubmitButton loading={loading} label="Create account" />
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/auth/reset-password` },
      );
      if (resetError) throw resetError;
      setInfo("If an account exists for that email, a reset link is on the way.");
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <ErrorBanner message={error} />
      {info ? (
        <p className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-success)]/25 bg-[var(--zeno-success-soft)]/50 px-3 py-2 text-sm text-[var(--zeno-success)]">
          {info}
        </p>
      ) : null}
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
      />
      <SubmitButton loading={loading} label="Send reset link" />
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/app/home");
      router.refresh();
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <ErrorBanner message={error} />
      <Field
        id="password"
        label="New password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
      >
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-[var(--zeno-ink-muted)]"
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </Field>
      <SubmitButton loading={loading} label="Update password" />
    </form>
  );
}
