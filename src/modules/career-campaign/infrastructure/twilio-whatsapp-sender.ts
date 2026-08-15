import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  DeliveryResult,
  NotificationSender,
  PendingNotification,
} from "../application/ports";

export type TwilioWhatsAppConfig = {
  accountSid: string;
  authToken: string;
  from: string;
  publicBaseUrl?: string;
  fetchImpl?: typeof fetch;
  resolveWaId?: (userId: string) => Promise<string | null>;
};

/** Twilio's official WhatsApp Sandbox/registered-sender transport. */
export class TwilioWhatsAppSender implements NotificationSender {
  private readonly fetchImpl: typeof fetch;
  private readonly config: TwilioWhatsAppConfig;

  constructor(config: TwilioWhatsAppConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sendText(waId: string, text: string): Promise<void> {
    const response = await this.postMessage({
      to: formatWhatsAppAddress(waId),
      body: text.slice(0, 1600),
    });
    if (!response.ok) {
      throw new Error(`Twilio WhatsApp API HTTP ${response.status}`);
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

    try {
      const response = await this.postMessage({
        to: formatWhatsAppAddress(waId),
        body: `Zeno found a new match for you: ${title.slice(0, 100)}\n\nReview it here: ${link}`,
      });
      if (!response.ok) {
        return {
          ok: false,
          retryable: response.status === 429 || response.status >= 500,
          error: `Twilio WhatsApp API HTTP ${response.status}`,
        };
      }

      const json = (await response.json().catch(() => ({}))) as {
        sid?: string;
      };
      return { ok: true, providerMessageId: json.sid };
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : "Twilio send failed",
      };
    }
  }

  private postMessage(input: { to: string; body: string }): Promise<Response> {
    const form = new URLSearchParams({
      From: formatWhatsAppAddress(this.config.from),
      To: input.to,
      Body: input.body,
    });
    const credentials = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`,
      "utf8",
    ).toString("base64");

    return this.fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(8_000),
      },
    );
  }
}

export function verifyTwilioSignature(input: {
  authToken: string;
  url: string;
  params: URLSearchParams;
  signatureHeader: string | null;
}): boolean {
  if (!input.signatureHeader) return false;

  const entries = [...input.params.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const data = entries.reduce(
    (value, [key, entryValue]) => `${value}${key}${entryValue}`,
    input.url,
  );
  const expected = createHmac("sha1", input.authToken)
    .update(data, "utf8")
    .digest("base64");

  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(input.signatureHeader, "utf8"),
    );
  } catch {
    return false;
  }
}

export function normalizeTwilioWhatsAppId(value: string): string {
  return value.replace(/^whatsapp:/iu, "").replace(/\D/gu, "");
}

function formatWhatsAppAddress(value: string): string {
  const digits = normalizeTwilioWhatsAppId(value);
  return `whatsapp:+${digits}`;
}
