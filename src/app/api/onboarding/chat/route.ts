import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { careerEvidenceSchema } from "@/modules/career-evidence/domain/evidence";
import { processOnboardingTurn } from "@/modules/onboarding/application/process-onboarding-turn";
import {
  ONBOARDING_STAGES,
  type ConversationMessage,
  type OnboardingStage,
} from "@/modules/onboarding/domain/conversation-machine";
import { authErrorResponse, requireUserId } from "@/server/auth";
import {
  getCareerEvidenceApplication,
  getOnboardingConversationalist,
} from "@/server/composition-root";
import { requireProfile, updateProfileOnboarding } from "@/server/identity";

const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["zeno", "user"]),
  text: z.string(),
});

const bodySchema = z.object({
  message: z.string().min(1),
  clientMessageId: z.string().min(1),
  stage: z
    .custom<OnboardingStage>(
      (value) =>
        typeof value === "string" &&
        (ONBOARDING_STAGES as readonly string[]).includes(value),
    )
    .optional(),
  // Legacy fields accepted for older clients; ignored by the LLM path.
  questionKey: z.string().optional(),
  answer: z.string().optional(),
  evidence: careerEvidenceSchema.optional(),
  messages: z.array(messageSchema).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await request.json());
    const profile = await requireProfile();
    const evidenceApp = getCareerEvidenceApplication(userId);

    const state = (profile.onboardingState ?? {}) as {
      stage?: OnboardingStage;
      messages?: ConversationMessage[];
      draftEvidence?: unknown;
      focusedEntityId?: string | null;
      recordRevisions?: Record<string, number>;
      processedClientMessageIds?: string[];
      completedScriptKeys?: string[];
    };

    const currentEvidenceSet = await evidenceApp.getCurrent();
    const evidence =
      body.evidence ??
      currentEvidenceSet?.evidence ??
      (state.draftEvidence
        ? careerEvidenceSchema.parse(state.draftEvidence)
        : undefined);

    const message = body.message || body.answer || "";
    const result = await processOnboardingTurn(
      {
        userId,
        message,
        clientMessageId: body.clientMessageId,
        stage: body.stage ?? state.stage,
        evidence,
        messages: body.messages ?? state.messages,
        focusedEntityId: state.focusedEntityId ?? null,
        recordRevisions: state.recordRevisions ?? {},
        processedClientMessageIds: state.processedClientMessageIds ?? [],
        completedScriptKeys: state.completedScriptKeys ?? [],
      },
      {
        conversationalist: getOnboardingConversationalist(),
        createId: randomUUID,
      },
    );

    const processedClientMessageIds = Array.from(
      new Set([
        ...(state.processedClientMessageIds ?? []),
        body.clientMessageId,
      ]),
    ).slice(-100);

    const onboardingState = {
      stage: result.stage,
      messages: result.messages,
      draftEvidence: result.evidence,
      focusedEntityId: result.focusedEntityId,
      recordRevisions: result.recordRevisions,
      processedClientMessageIds,
      completedScriptKeys: result.completedScriptKeys,
      scriptStepKey: result.scriptStepKey,
    };

    await updateProfileOnboarding(userId, {
      onboardingMethod: "conversation",
      onboardingStatus:
        result.stage === "review" ? "awaiting_verification" : "in_progress",
      onboardingCurrentStep: result.stage,
      onboardingProgress: result.progress,
      onboardingState,
      displayName:
        result.evidence.profile.full_name ?? profile.displayName ?? null,
    });

    if (currentEvidenceSet) {
      await evidenceApp.saveDraft({
        id: currentEvidenceSet.id,
        evidence: result.evidence,
      });
    } else {
      await evidenceApp.ensureConversationDraft(result.evidence);
    }

    return NextResponse.json({
      zenoReply: result.assistantMessage,
      assistantMessage: result.assistantMessage,
      evidence: result.evidence,
      stage: result.stage,
      messages: result.messages,
      focusedEntityId: result.focusedEntityId,
      progress: result.progress,
      suggestedReplies: [],
      completedScriptKeys: result.completedScriptKeys,
      scriptStepKey: result.scriptStepKey,
      acceptedOperations: result.acceptedOperations,
      rejectedOperations: result.rejectedOperations,
      sectionStatus: result.sectionStatus,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
