import Link from "next/link";

import { AuthShell } from "@/modules/identity/presentation/auth-shell";
import { ForgotPasswordForm } from "@/modules/identity/presentation/auth-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send a secure reset link."
      footer={
        <Link
          href="/auth/sign-in"
          className="font-semibold text-[var(--zeno-primary)] hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
