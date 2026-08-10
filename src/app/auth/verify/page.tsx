import Link from "next/link";

import { AuthShell } from "@/modules/identity/presentation/auth-shell";

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Check your email"
      subtitle="Confirm your address to finish setting up Zeno. Once confirmed, you can sign in."
      footer={
        <Link
          href="/auth/sign-in"
          className="font-semibold text-[var(--zeno-primary)] hover:underline"
        >
          Go to sign in
        </Link>
      }
    >
      <p className="text-sm leading-6 text-[var(--zeno-ink-muted)]">
        Didn&apos;t get the message? Check spam, or request another confirmation
        from the sign-in page after a minute.
      </p>
    </AuthShell>
  );
}
