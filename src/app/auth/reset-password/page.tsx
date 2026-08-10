import { AuthShell } from "@/modules/identity/presentation/auth-shell";
import { ResetPasswordForm } from "@/modules/identity/presentation/auth-forms";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use a password you haven't used with Zeno before."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
