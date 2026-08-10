import { redirect } from "next/navigation";

import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { getSessionUser } from "@/server/auth";
import { getProfileRepository } from "@/server/identity";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  // Local recovery path before browser auth env is configured.
  if (!isSupabaseAuthConfigured()) {
    redirect("/app/matching");
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/sign-in");
  }

  const profile = await getProfileRepository().getOrCreate(
    user.id,
    (user.user_metadata?.display_name as string | undefined) ?? null,
  );

  if (profile.onboardingStatus === "completed") {
    redirect("/app/home");
  }

  redirect("/onboarding");
}
