import { NextResponse } from "next/server";

import { handleWhatsAppInboundMessage } from "@/modules/career-campaign/application/whatsapp-connection";
import {
  normalizeTwilioWhatsAppId,
  TwilioWhatsAppSender,
  verifyTwilioSignature,
} from "@/modules/career-campaign/infrastructure/twilio-whatsapp-sender";
import { getCareerCampaignCronServices } from "@/server/composition-root";
import { getServerConfig } from "@/server/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getServerConfig();
  if (
    config.WHATSAPP_PROVIDER !== "twilio" ||
    !config.TWILIO_ACCOUNT_SID ||
    !config.TWILIO_AUTH_TOKEN ||
    !twilioFrom(config) ||
    (!config.TWILIO_WHATSAPP_WEBHOOK_URL && !config.PUBLIC_APP_BASE_URL)
  ) {
    return NextResponse.json(
      { error: "Twilio WhatsApp is not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const webhookUrl =
    config.TWILIO_WHATSAPP_WEBHOOK_URL ??
    `${config.PUBLIC_APP_BASE_URL!.replace(/\/+$/u, "")}/api/whatsapp/twilio/webhook`;

  if (
    !verifyTwilioSignature({
      authToken: config.TWILIO_AUTH_TOKEN,
      url: webhookUrl,
      params,
      signatureHeader: request.headers.get("x-twilio-signature"),
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const messageId = params.get("MessageSid") ?? params.get("SmsMessageSid");
  const from = params.get("From");
  if (!messageId || !from) return emptyTwiml();

  const waId = normalizeTwilioWhatsAppId(from);
  const sender = new TwilioWhatsAppSender({
    accountSid: config.TWILIO_ACCOUNT_SID,
    authToken: config.TWILIO_AUTH_TOKEN,
    from: twilioFrom(config)!,
    publicBaseUrl: config.PUBLIC_APP_BASE_URL,
  });
  const { repository } = getCareerCampaignCronServices();

  try {
    await handleWhatsAppInboundMessage({
      messageId,
      waId,
      text: params.get("Body"),
      repository,
      publicBaseUrl: config.PUBLIC_APP_BASE_URL,
      sendText: (recipientWaId, text) =>
        sender.sendText(recipientWaId, text),
    });
  } catch (error) {
    console.error("[twilio-whatsapp] inbound message failed", {
      messageId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return emptyTwiml();
}

function twilioFrom(config: ReturnType<typeof getServerConfig>) {
  return config.TWILIO_WHATSAPP_NUMBER ?? config.WHATSAPP_BUSINESS_PHONE_E164;
}

function emptyTwiml() {
  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
