import { describe, expect, it } from "vitest";

import { InMemoryCareerCampaignRepository } from "./fakes";
import {
  createTelegramConnectionCode,
  handleTelegramInboundMessage,
} from "./telegram-connection";

const now = () => new Date("2026-08-16T08:00:00.000Z");

describe("Telegram connection", () => {
  it("links a chat from a Telegram deep-link start command", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    const generated = await createTelegramConnectionCode({
      userId: "user-1",
      repository,
      now,
      createCode: () => "ABCD1234",
    });
    const replies: string[] = [];

    const result = await handleTelegramInboundMessage({
      updateId: "1001",
      chatId: "94770000000",
      username: "venuja",
      text: `/start ${generated.code}`,
      repository,
      now,
      sendText: async (_chatId, text) => {
        replies.push(text);
      },
    });

    expect(result).toMatchObject({ status: "replied", command: "link" });
    expect(await repository.getUserIdByTelegramChatId("94770000000")).toBe(
      "user-1",
    );
    expect(replies[0]).toMatch(/connected to Zeno/iu);
  });

  it("handles commands, opt-out, and duplicate updates", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    repository.telegram.set("user-1", {
      userId: "user-1",
      chatId: "12345",
      username: null,
      optedInAt: now().toISOString(),
      optedOutAt: null,
    });
    const replies: string[] = [];
    const sendText = async (_chatId: string, text: string) => {
      replies.push(text);
    };

    await handleTelegramInboundMessage({
      updateId: "1002",
      chatId: "12345",
      username: null,
      text: "/stop",
      repository,
      now,
      sendText,
    });
    expect((await repository.getTelegramLink("user-1"))?.optedOutAt).toBe(
      now().toISOString(),
    );

    const first = await handleTelegramInboundMessage({
      updateId: "1003",
      chatId: "12345",
      username: null,
      text: "/jobs@ZenoCareerBot",
      repository,
      publicBaseUrl: "https://zeno.example/",
      now,
      sendText,
    });
    const duplicate = await handleTelegramInboundMessage({
      updateId: "1003",
      chatId: "12345",
      username: null,
      text: "/jobs",
      repository,
      now,
      sendText,
    });

    expect(first).toMatchObject({ status: "replied", command: "jobs" });
    expect(duplicate).toEqual({ status: "duplicate" });
    expect(replies.at(-1)).toContain("https://zeno.example/app/jobs");
  });

  it("does not claim paused alerts are enabled for an invalid link", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    repository.telegram.set("user-1", {
      userId: "user-1",
      chatId: "12345",
      username: null,
      optedInAt: now().toISOString(),
      optedOutAt: now().toISOString(),
    });
    const replies: string[] = [];

    await handleTelegramInboundMessage({
      updateId: "1004",
      chatId: "12345",
      username: null,
      text: "/start INVALID1",
      repository,
      now,
      sendText: async (_chatId, text) => {
        replies.push(text);
      },
    });

    expect(replies[0]).toMatch(/alerts are paused/iu);
  });

  it("requires slash-prefixed navigation commands", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    repository.telegram.set("user-1", {
      userId: "user-1",
      chatId: "12345",
      username: null,
      optedInAt: now().toISOString(),
      optedOutAt: null,
    });
    const replies: string[] = [];

    const result = await handleTelegramInboundMessage({
      updateId: "1005",
      chatId: "12345",
      username: null,
      text: "jobs",
      repository,
      publicBaseUrl: "https://zeno.example",
      now,
      sendText: async (_chatId, text) => {
        replies.push(text);
      },
    });

    expect(result).toMatchObject({ command: "help" });
    expect(replies[0]).not.toContain("https://zeno.example/app/jobs");
  });
});
