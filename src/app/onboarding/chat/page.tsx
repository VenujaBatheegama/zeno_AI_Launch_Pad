import { ChatOnboardingWorkspace } from "@/modules/onboarding/presentation/chat-onboarding-workspace";
import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import type {
  ConversationMessage,
  OnboardingStage,
} from "@/modules/onboarding/domain/conversation-machine";
import { requireProfile, updateProfileOnboarding } from "@/server/identity";

export const dynamic = "force-dynamic";

export default async function OnboardingChatPage() {
  const profile = await requireProfile();
  await updateProfileOnboarding(profile.userId, {
    onboardingMethod: "conversation",
    onboardingStatus: "in_progress",
    onboardingCurrentStep:
      profile.onboardingCurrentStep === "welcome"
        ? "about_you"
        : profile.onboardingCurrentStep,
    onboardingProgress: Math.max(profile.onboardingProgress, 10),
  });

  const state = profile.onboardingState as {
    stage?: OnboardingStage;
    messages?: ConversationMessage[];
    draftEvidence?: CareerEvidence;
    focusedEntityId?: string | null;
    completedScriptKeys?: string[];
  };

  return (
    <ChatOnboardingWorkspace
      initialStage={state.stage}
      initialEvidence={state.draftEvidence ?? null}
      initialMessages={state.messages}
      initialFocusedEntityId={state.focusedEntityId ?? null}
      initialCompletedScriptKeys={state.completedScriptKeys ?? []}
    />
  );
}
