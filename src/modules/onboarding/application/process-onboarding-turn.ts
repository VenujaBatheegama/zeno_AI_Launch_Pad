import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import { applyConversationAnswer } from "./apply-answer";
import {
  emptyCareerEvidence,
  nextQuestion,
  type ConversationMessage,
  type OnboardingStage,
} from "../domain/conversation-machine";
import {
  advanceCompletedScriptKeys,
  ensureAssistantAsksScriptStep,
  formatScriptBrief,
  getCurrentScriptStep,
  type ScriptStep,
} from "../domain/conversation-script";
import {
  applyProfileOperations,
  onboardingTurnResultSchema,
  progressFromEvidence,
  resolveNextStage,
  type OnboardingTurnResult,
  type ProfileOperation,
  type RejectedOperation,
} from "../domain/profile-operations";

export type OnboardingConversationalist = {
  completeTurn(input: {
    stage: OnboardingStage;
    evidence: CareerEvidence;
    focusedEntityId: string | null;
    recordRevisions: Record<string, number>;
    recentMessages: ConversationMessage[];
    userMessage: string;
    scriptStep: ScriptStep;
    scriptBrief: string;
  }): Promise<OnboardingTurnResult>;
};

export type ProcessOnboardingTurnCommand = {
  userId: string;
  message: string;
  clientMessageId: string;
  stage?: OnboardingStage;
  evidence?: CareerEvidence | null;
  messages?: ConversationMessage[];
  focusedEntityId?: string | null;
  recordRevisions?: Record<string, number>;
  processedClientMessageIds?: string[];
  completedScriptKeys?: string[];
};

export type ProcessOnboardingTurnResult = {
  assistantMessage: string;
  evidence: CareerEvidence;
  stage: OnboardingStage;
  messages: ConversationMessage[];
  focusedEntityId: string | null;
  recordRevisions: Record<string, number>;
  progress: number;
  suggestedReplies: string[];
  completedScriptKeys: string[];
  scriptStepKey: string;
  acceptedOperations: ProfileOperation[];
  rejectedOperations: RejectedOperation[];
  sectionStatus: OnboardingTurnResult["sectionStatus"];
  idempotentReplay: boolean;
};

export async function processOnboardingTurn(
  command: ProcessOnboardingTurnCommand,
  dependencies: {
    conversationalist: OnboardingConversationalist;
    createId: () => string;
  },
): Promise<ProcessOnboardingTurnResult> {
  const message = command.message.trim();
  if (!message) {
    throw new Error("Message cannot be empty.");
  }

  const processed = new Set(command.processedClientMessageIds ?? []);
  const existingMessages = command.messages ?? [];
  const completedScriptKeys = [...(command.completedScriptKeys ?? [])];

  if (processed.has(command.clientMessageId)) {
    const lastAssistant = [...existingMessages]
      .reverse()
      .find((entry) => entry.role === "zeno");
    const evidence = command.evidence ?? emptyCareerEvidence();
    const stage = command.stage ?? "about_you";
    const step = getCurrentScriptStep(evidence, completedScriptKeys);
    return {
      assistantMessage:
        lastAssistant?.text ??
        "I already saved that answer. What would you like to add next?",
      evidence,
      stage,
      messages: existingMessages,
      focusedEntityId: command.focusedEntityId ?? null,
      recordRevisions: command.recordRevisions ?? {},
      progress: progressFromEvidence(evidence),
      suggestedReplies: [],
      completedScriptKeys,
      scriptStepKey: step.key,
      acceptedOperations: [],
      rejectedOperations: [],
      sectionStatus: "in_progress",
      idempotentReplay: true,
    };
  }

  const evidence = command.evidence ?? emptyCareerEvidence();
  const stage = command.stage ?? "about_you";
  const currentStep = getCurrentScriptStep(evidence, completedScriptKeys);
  const userMessage: ConversationMessage = {
    id: command.clientMessageId,
    role: "user",
    text: message,
  };
  // Client often already appended the optimistic user message with this id.
  const messagesWithUser = existingMessages.some(
    (entry) => entry.id === command.clientMessageId,
  )
    ? existingMessages.map((entry) =>
        entry.id === command.clientMessageId ? userMessage : entry,
      )
    : [...existingMessages, userMessage];

  let modelResult: OnboardingTurnResult;
  try {
    modelResult = onboardingTurnResultSchema.parse(
      await dependencies.conversationalist.completeTurn({
        stage: currentStep.stage,
        evidence,
        focusedEntityId: command.focusedEntityId ?? null,
        recordRevisions: command.recordRevisions ?? {},
        recentMessages: messagesWithUser.slice(-8),
        userMessage: message,
        scriptStep: currentStep,
        scriptBrief: formatScriptBrief(currentStep),
      }),
    );
  } catch {
    // Temporary resilience: keep the turn usable when the LLM is unavailable.
    const question = nextQuestion({
      stage,
      evidence,
      completedScriptKeys,
    });
    const fallback = applyConversationAnswer({
      stage,
      questionKey: question.questionKey,
      answer: message,
      evidence,
    });
    const nextKeys = advanceCompletedScriptKeys({
      beforeEvidence: evidence,
      afterEvidence: fallback.evidence,
      completedKeys: completedScriptKeys,
      userMessage: message,
      intent: "provide_information",
    });
    const nextStep = getCurrentScriptStep(fallback.evidence, nextKeys);
    const assistantText = ensureAssistantAsksScriptStep(
      fallback.zenoReply,
      nextStep,
      message.length,
    );
    const assistantMessage: ConversationMessage = {
      id: dependencies.createId(),
      role: "zeno",
      text: assistantText,
    };
    return {
      assistantMessage: assistantMessage.text,
      evidence: fallback.evidence,
      stage: nextStep.stage,
      messages: [...messagesWithUser, assistantMessage],
      focusedEntityId: command.focusedEntityId ?? null,
      recordRevisions: command.recordRevisions ?? {},
      progress: progressFromEvidence(fallback.evidence),
      suggestedReplies: [],
      completedScriptKeys: nextKeys,
      scriptStepKey: nextStep.key,
      acceptedOperations: [],
      rejectedOperations: [],
      sectionStatus: "in_progress",
      idempotentReplay: false,
    };
  }

  const applied = applyProfileOperations({
    evidence,
    operations: modelResult.profileOperations,
    recordRevisions: command.recordRevisions,
    focusedEntityId: command.focusedEntityId ?? null,
  });

  const nextKeys = advanceCompletedScriptKeys({
    beforeEvidence: evidence,
    afterEvidence: applied.evidence,
    completedKeys: completedScriptKeys,
    userMessage: message,
    intent: modelResult.intent,
  });

  const nextStage = resolveNextStage({
    current: stage,
    proposed: modelResult.nextSection,
    intent: modelResult.intent,
    evidence: applied.evidence,
    completedScriptKeys: nextKeys,
  });
  const nextStep = getCurrentScriptStep(applied.evidence, nextKeys);

  let assistantText = modelResult.assistantMessage.trim();
  if (applied.rejected.length > 0 && applied.accepted.length > 0) {
    assistantText = `${assistantText}\n\nI saved what I could and skipped a couple of unclear details.`;
  } else if (applied.rejected.length > 0 && applied.accepted.length === 0) {
    assistantText =
      modelResult.clarificationReason ||
      assistantText ||
      "I need a bit more detail before I can update your profile.";
  }

  // Agent always carries the next scripted question — never leave it to chips.
  assistantText = ensureAssistantAsksScriptStep(
    assistantText,
    nextStep,
    message.length,
  );

  const assistantMessage: ConversationMessage = {
    id: dependencies.createId(),
    role: "zeno",
    text: assistantText,
  };

  return {
    assistantMessage: assistantText,
    evidence: applied.evidence,
    stage: nextStage,
    messages: dedupeMessages([...messagesWithUser, assistantMessage]),
    focusedEntityId: modelResult.focusedEntityId ?? applied.focusedEntityId,
    recordRevisions: applied.recordRevisions,
    progress: progressFromEvidence(applied.evidence),
    suggestedReplies: [],
    completedScriptKeys: nextKeys,
    scriptStepKey: nextStep.key,
    acceptedOperations: applied.accepted,
    rejectedOperations: applied.rejected,
    sectionStatus: modelResult.sectionStatus,
    idempotentReplay: false,
  };
}

function dedupeMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const seen = new Set<string>();
  const result: ConversationMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    result.push(message);
  }
  return result;
}
