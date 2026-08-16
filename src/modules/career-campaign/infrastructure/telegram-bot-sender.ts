import { timingSafeEqual } from "node:crypto";

import type {
  DeliveryResult,
  NotificationSender,
  PendingNotification,
} from "../application/ports";

export type TelegramBotConfig = {
  botToken: string;
  publicBaseUrl?: string;
  fetchImpl?: typeof fetch;
  resolveChatId?: (userId: string) => Promise<string | null>;
};

type TelegramResponse = {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
};

export class TelegramBotNotificationSender implements NotificationSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: TelegramBotConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sendText(chatId: string, text: string): Promise<void> {
    const response = await this.postMessage(chatId, text);
    const body = (await response.json().catch(() => ({}))) as TelegramResponse;
    if (!response.ok || body.ok === false) {
      throw new Error(`Telegram API HTTP ${response.status}`);
    }
  }

  async send(notification: PendingNotification): Promise<DeliveryResult> {
    const chatId = this.config.resolveChatId
      ? await this.config.resolveChatId(notification.userId)
      : typeof notification.payload.chatId === "string"
        ? notification.payload.chatId
        : null;

    if (!chatId) {
      return { ok: false, retryable: false, error: "No Telegram chat mapped" };
    }

    const reviewPath =
      typeof notification.payload.reviewPath === "string"
        ? notification.payload.reviewPath
        : "/app/recommendations";
    const link = this.config.publicBaseUrl
      ? `${this.config.publicBaseUrl.replace(/\/+$/u, "")}${reviewPath}`
      : reviewPath;
    const title =
      typeof notification.payload.title === "string"
        ? notification.payload.title
        : "New Zeno recommendation";

    try {
      const response = await this.postMessage(
        chatId,
        `${title.slice(0, 180)}\n\nReview in Zeno: ${link}`,
      );
      const body = (await response.json().catch(() => ({}))) as TelegramResponse;
      if (!response.ok || body.ok === false) {
        return {
          ok: false,
          retryable: response.status === 429 || response.status >= 500,
          error: `Telegram API HTTP ${response.status}`,
        };
      }
      return {
        ok: true,
        providerMessageId:
          typeof body.result?.message_id === "number"
            ? String(body.result.message_id)
            : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : "Telegram send failed",
      };
    }
  }

  private postMessage(chatId: string, text: string): Promise<Response> {
    return this.fetchImpl(
      `https://api.telegram.org/bot${this.config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.slice(0, 4096),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
  }
}

export function verifyTelegramWebhookSecret(input: {
  expectedSecret: string;
  receivedSecret: string | null;
}): boolean {
  if (!input.receivedSecret) return false;
  try {
    return timingSafeEqual(
      Buffer.from(input.expectedSecret, "utf8"),
      Buffer.from(input.receivedSecret, "utf8"),
    );
  } catch {
    return false;
  }
}
