import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import type { CareerSnapshot } from "../domain/schemas";
import type { CareerAdvisor, CareerFriendRepository } from "./ports";

export async function askCareerFriend(
  input: {
    userId: string;
    conversationId?: string;
    clientMessageId: string;
    message: string;
    snapshot: CareerSnapshot;
    executeSearchJobListings?: Parameters<CareerAdvisor["reply"]>[0]["executeSearchJobListings"];
    executeRecommendRoleCategories?: Parameters<CareerAdvisor["reply"]>[0]["executeRecommendRoleCategories"];
    executeSuggestGrowthAction?: Parameters<CareerAdvisor["reply"]>[0]["executeSuggestGrowthAction"];
    executeCoverLetter?: Parameters<CareerAdvisor["reply"]>[0]["executeCoverLetter"];
    executeCv?: Parameters<CareerAdvisor["reply"]>[0]["executeCv"];
    executeSetPreferredName?: Parameters<CareerAdvisor["reply"]>[0]["executeSetPreferredName"];
  },
  deps: {
    repository: CareerFriendRepository;
    advisor: CareerAdvisor;
    createId: () => string;
    now: () => Date;
  },
) {
  const conversationId = input.conversationId ?? deps.createId();
  const now = deps.now().toISOString();
  if (input.conversationId) {
    const ownsConversation = await deps.repository.conversationBelongsToUser(
      input.userId,
      conversationId,
    );
    if (!ownsConversation) {
      throw new CareerCampaignError("NOT_FOUND", "Career conversation was not found.");
    }
  } else {
    await deps.repository.createConversation({
      id: conversationId,
      userId: input.userId,
      title: input.message.slice(0, 80),
      createdAt: now,
    });
  }

  const recentMessages = await deps.repository.listMessages({
    userId: input.userId,
    conversationId,
    limit: 8,
  });
  if (recentMessages.some((item) => item.id === input.clientMessageId)) {
    const assistant = recentMessages.findLast((item) => item.role === "assistant");
    return {
      conversationId,
      answer: assistant?.content ?? "I already received that message.",
      suggestedActions: [],
      usedModel: Boolean(assistant?.metadata.usedModel),
      uiPayload: assistant?.metadata.uiPayload,
      idempotentReplay: true,
    };
  }

  const [preferredName, previousSummary] = await Promise.all([
    deps.repository.getConversationPreferredName(input.userId, conversationId),
    deps.repository.getConversationSummary(input.userId, conversationId)
  ]);

  const [, reply] = await Promise.all([
    deps.repository.addMessage({
      id: input.clientMessageId,
      userId: input.userId,
      conversationId,
      role: "user",
      content: input.message,
      metadata: {},
      createdAt: now,
    }),
    deps.advisor.reply({
      message: input.message,
      snapshot: input.snapshot,
      recentMessages,
      preferredName: preferredName ?? undefined,
      previousSummary: previousSummary ?? undefined,
      executeSearchJobListings: input.executeSearchJobListings,
      executeRecommendRoleCategories: input.executeRecommendRoleCategories,
      executeSuggestGrowthAction: input.executeSuggestGrowthAction,
      executeCoverLetter: input.executeCoverLetter,
      executeCv: input.executeCv,
      executeSetPreferredName: input.executeSetPreferredName,
    }),
  ]);

  if (reply.uiPayload) {
    let isValid = true;
    switch (reply.uiPayload.type) {
      case "growth_suggestion":
        if (!reply.uiPayload.project || !reply.uiPayload.gapType || !reply.uiPayload.deepLink) {
          isValid = false;
        }
        break;
      case "job_listings":
        if (!reply.uiPayload.items) isValid = false;
        break;
      case "role_recommendations":
        if (!reply.uiPayload.roles) isValid = false;
        break;
      case "cv_ready":
        if (!reply.uiPayload.cvId || !reply.uiPayload.deepLink) isValid = false;
        break;
      case "cover_letter_ready":
        if (!reply.uiPayload.letterId || !reply.uiPayload.deepLink) isValid = false;
        break;
    }
    if (!isValid) {
      console.warn(`[CareerFriend] Dropping invalid UI payload of type ${reply.uiPayload.type} due to missing required fields`);
      reply.uiPayload = undefined;
    }
  }

  await deps.repository.addMessage({
    id: deps.createId(),
    userId: input.userId,
    conversationId,
    role: "assistant",
    content: reply.answer,
    metadata: {
      usedModel: reply.usedModel,
      suggestedActions: reply.suggestedActions,
      uiPayload: reply.uiPayload,
    },
    createdAt: deps.now().toISOString(),
  });

  if (recentMessages.length >= 2 && deps.advisor.summarize) {
    try {
      const newSummary = await deps.advisor.summarize({
        recentMessages: [...recentMessages, { role: "user", content: input.message }, { role: "assistant", content: reply.answer }],
        previousSummary: previousSummary ?? undefined,
      });
      if (newSummary && newSummary !== previousSummary) {
        await deps.repository.updateConversationSummary(input.userId, conversationId, newSummary);
      }
    } catch (err) {
      console.error("[CareerFriend] Failed to generate conversation summary", err);
    }
  }

  return { conversationId, ...reply, idempotentReplay: false };
}
