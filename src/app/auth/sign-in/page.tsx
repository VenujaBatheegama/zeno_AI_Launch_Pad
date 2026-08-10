import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "@/modules/identity/presentation/auth-shell";
import { SignInForm } from "@/modules/identity/presentation/auth-forms";

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Continue building your career with Zeno."
      footer={
        <>
          New here?{" "}
          <Link
            href="/auth/sign-up"
            className="font-semibold text-[var(--zeno-primary)] hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<p className="text-sm text-[var(--zeno-ink-muted)]">Loading…</p>}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
