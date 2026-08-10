import { redirect } from "next/navigation";

import { WelcomeChoice } from "@/modules/onboarding/presentation/welcome-choice";
import { requireProfile, updateProfileOnboarding } from "@/server/identity";

export const dynamic = "force-dynamic";

export default async function OnboardingWelcomePage() {
  const profile = await requireProfile();

  if (profile.onboardingStatus === "completed") {
    redirect("/app/home");
  }

  if (
    profile.onboardingStatus === "in_progress" &&
    profile.onboardingMethod === "conversation" &&
    profile.onboardingProgress > 0
  ) {
    // Still allow welcome, but user can resume from cards.
  }

  if (profile.onboardingStatus === "not_started") {
    await updateProfileOnboarding(profile.userId, {
      onboardingStatus: "in_progress",
      onboardingCurrentStep: "welcome",
      onboardingProgress: 5,
    });
  }

  return <WelcomeChoice />;
}
