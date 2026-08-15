import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  DeliveryResult,
  NotificationSender,
  PendingNotification,
} from "../application/ports";

export type WhatsAppCloudConfig = {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateLanguage: string;
  graphApiVersion?: string;
  publicBaseUrl?: string;
  fetchImpl?: typeof fetch;
  resolveWaId?: (userId: string) => Promise<string | null>;
};

/**
 * Official WhatsApp Cloud API sender (template messages only for proactive alerts).
 */
export class WhatsAppCloudNotificationSender implements NotificationSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: WhatsAppCloudConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sendText(waId: string, text: string): Promise<void> {
    const response = await this.postMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: "text",
      text: {
        preview_url: false,
        body: text.slice(0, 4096),
      },
    });
    if (!response.ok) {
      throw new Error(`WhatsApp API HTTP ${response.status}`);
    }
  }

  async send(notification: PendingNotification): Promise<DeliveryResult> {
    const waId = this.config.resolveWaId
      ? await this.config.resolveWaId(notification.userId)
      : typeof notification.payload.waId === "string"
        ? notification.payload.waId
        : null;

    if (!waId) {
      return {
        ok: false,
        retryable: false,
        error: "No WhatsApp identity mapped",
      };
    }

    const reviewPath =
      typeof notification.payload.reviewPath === "string"
        ? notification.payload.reviewPath
        : "/app/recommendations";
    const link = this.config.publicBaseUrl
      ? `${this.config.publicBaseUrl.replace(/\/+$/, "")}${reviewPath}`
      : reviewPath;

    const title =
      typeof notification.payload.title === "string"
        ? notification.payload.title
        : "New Zeno recommendation";

    const body = {
      messaging_product: "whatsapp",
      to: waId,
      type: "template",
      template: {
        name: this.config.templateName,
        language: { code: this.config.templateLanguage },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: title.slice(0, 60) },
              { type: "text", text: link.slice(0, 200) },
            ],
          },
        ],
      },
    };

    try {
      const response = await this.postMessage(body);

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        return {
          ok: false,
          retryable,
          error: `WhatsApp API HTTP ${response.status}`,
        };
      }

      const json = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
      };
      return {
        ok: true,
        providerMessageId: json.messages?.[0]?.id,
      };
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : "WhatsApp send failed",
      };
    }
  }

  private postMessage(body: Record<string, unknown>): Promise<Response> {
    const version = (this.config.graphApiVersion ?? "v21.0").replace(
      /^\/+|\/+$/gu,
      "",
    );
    const url = `https://graph.facebook.com/${version}/${this.config.phoneNumberId}/messages`;
    return this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  }
}

export function verifyWhatsAppSignature(input: {
  appSecret: string;
  rawBody: string;
  signatureHeader: string | null;
}): boolean {
  if (!input.signatureHeader?.startsWith("sha256=")) return false;
  const expected = input.signatureHeader.slice("sha256=".length);
  const digest = createHmac("sha256", input.appSecret)
    .update(input.rawBody, "utf8")
    .digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(digest, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}
