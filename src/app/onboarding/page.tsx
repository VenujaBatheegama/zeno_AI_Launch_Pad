import { redirect } from "next/navigation";

import { WelcomeChoice } from "@/modules/onboarding/presentation/welcome-choice";
import { requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";
import { requireProfile, updateProfileOnboarding } from "@/server/identity";

export const dynamic = "force-dynamic";

export default async function OnboardingWelcomePage(props: {
  searchParams?: Promise<{ reset?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const userId = await requireUserId();
  const profile = await requireProfile();

  if (searchParams.reset === "1") {
    await updateProfileOnboarding(userId, {
      onboardingMethod: null,
      onboardingStatus: "in_progress",
      onboardingCurrentStep: "welcome",
      onboardingProgress: 5,
    });
    profile.onboardingMethod = null;
    profile.onboardingProgress = 5;
  }

  if (profile.onboardingStatus === "completed") {
    redirect("/app/home");
  }

  const evidenceApp = getCareerEvidenceApplication(userId);
  const currentEvidence = await evidenceApp.getCurrent().catch(() => null);

  // If evidence is already verified, complete onboarding and proceed to home
  if (currentEvidence && currentEvidence.status === "verified") {
    await updateProfileOnboarding(userId, {
      onboardingStatus: "completed",
      onboardingCurrentStep: "completed",
      onboardingProgress: 100,
      careerProfileVerifiedAt:
        currentEvidence.verifiedAt ?? new Date().toISOString(),
      displayName:
        currentEvidence.evidence.profile.full_name ?? profile.displayName,
    });
    redirect("/app/home");
  }

  // If draft exists or awaiting verification, route directly to review page
  if (
    profile.onboardingStatus === "awaiting_verification" ||
    profile.onboardingCurrentStep === "review" ||
    profile.onboardingProgress >= 100 ||
    currentEvidence !== null
  ) {
    redirect("/onboarding/review");
  }

  // If in progress by conversation, continue in chat
  if (
    profile.onboardingMethod === "conversation" &&
    profile.onboardingProgress > 0
  ) {
    redirect("/onboarding/chat");
  }

  // If in progress by cv upload, continue in import flow
  if (
    profile.onboardingMethod === "cv_import" &&
    profile.onboardingProgress > 0
  ) {
    redirect("/onboarding/import");
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
