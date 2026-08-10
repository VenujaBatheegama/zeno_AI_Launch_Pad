import Link from "next/link";

import { AuthShell } from "@/modules/identity/presentation/auth-shell";
import { SignUpForm } from "@/modules/identity/presentation/auth-forms";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your Zeno account"
      subtitle="Find better opportunities, tailor stronger CVs and keep your career moving."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/auth/sign-in"
            className="font-semibold text-[var(--zeno-primary)] hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
