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
      idempotentReplay: true,
    };
  }

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
    }),
  ]);
  await deps.repository.addMessage({
    id: deps.createId(),
    userId: input.userId,
    conversationId,
    role: "assistant",
    content: reply.answer,
    metadata: {
      usedModel: reply.usedModel,
      suggestedActions: reply.suggestedActions,
    },
    createdAt: deps.now().toISOString(),
  });
  return { conversationId, ...reply, idempotentReplay: false };
}
