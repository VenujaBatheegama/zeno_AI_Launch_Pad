import { describe, expect, it, vi } from "vitest";

import {
  TelegramBotNotificationSender,
  verifyTelegramWebhookSecret,
} from "./telegram-bot-sender";

describe("Telegram bot sender", () => {
  it("sends a proactive recommendation without exposing the token in content", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 42 } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    const sender = new TelegramBotNotificationSender({
      botToken: "secret-token",
      publicBaseUrl: "https://zeno.example",
      resolveChatId: async () => "12345",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await sender.send({
      id: "notification-1",
      userId: "user-1",
      eventType: "recommendation_created",
      channel: "telegram",
      relatedEntityType: "job_recommendation",
      relatedEntityId: "recommendation-1",
      payload: { title: "Software Engineer", reviewPath: "/app/recommendations" },
      idempotencyKey: "rec:1:telegram",
      status: "pending",
      scheduledAt: new Date().toISOString(),
      sentAt: null,
      attemptCount: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(result).toEqual({ ok: true, providerMessageId: "42" });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(String(init?.body)).toContain("Software Engineer");
    expect(String(init?.body)).not.toContain("secret-token");
  });

  it("validates the webhook secret", () => {
    expect(
      verifyTelegramWebhookSecret({
        expectedSecret: "0123456789abcdef",
        receivedSecret: "0123456789abcdef",
      }),
    ).toBe(true);
    expect(
      verifyTelegramWebhookSecret({
        expectedSecret: "0123456789abcdef",
        receivedSecret: "wrong",
      }),
    ).toBe(false);
  });

  it("sends chat action like typing to Telegram API", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const sender = new TelegramBotNotificationSender({
      botToken: "secret-token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await sender.sendChatAction("12345", "typing");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/botsecret-token/sendChatAction",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chat_id: "12345", action: "typing" }),
      }),
    );
  });

  it("sends document file upload to Telegram API", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const sender = new TelegramBotNotificationSender({
      botToken: "secret-token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const docBytes = new Uint8Array([1, 2, 3, 4]);
    await sender.sendDocument("12345", docBytes, "resume.pdf", "Your tailored CV");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/botsecret-token/sendDocument",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.body).toBeInstanceOf(FormData);
  });
});
