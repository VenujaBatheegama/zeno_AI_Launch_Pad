import { CvImportFlow } from "@/modules/onboarding/presentation/cv-import-flow";
import { updateProfileOnboarding, requireProfile } from "@/server/identity";

export const dynamic = "force-dynamic";

export default async function OnboardingImportPage() {
  const profile = await requireProfile();
  await updateProfileOnboarding(profile.userId, {
    onboardingMethod: "cv_import",
    onboardingStatus: "in_progress",
    onboardingCurrentStep: "import",
    onboardingProgress: Math.max(profile.onboardingProgress, 15),
  });
  return <CvImportFlow />;
}
