import { redirect } from "next/navigation";

import { AppShell } from "@/modules/product-shell/app-shell";
import { WorkspacePreloader } from "@/modules/product-shell/workspace-preloader";
import { AuthError } from "@/server/auth";
import { requireProfile } from "@/server/identity";

export const dynamic = "force-dynamic";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const profile = await requireProfile();
    return (
      <AppShell profile={profile}>
        <WorkspacePreloader />
        {children}
      </AppShell>
    );
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/auth/sign-in");
    }
    throw error;
  }
}
