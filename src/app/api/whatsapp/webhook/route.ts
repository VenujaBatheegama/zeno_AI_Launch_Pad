import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { handleWhatsAppInboundMessage } from "@/modules/career-campaign/application/whatsapp-connection";
import {
  verifyWhatsAppSignature,
  WhatsAppCloudNotificationSender,
} from "@/modules/career-campaign/infrastructure/whatsapp-cloud-sender";
import { getCareerCampaignCronServices } from "@/server/composition-root";
import { getServerConfig } from "@/server/config";

export const runtime = "nodejs";

/** Meta webhook verification challenge. */
export async function GET(request: Request) {
  const config = getServerConfig();
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    config.WHATSAPP_VERIFY_TOKEN &&
    token === config.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Inbound WhatsApp messages. Signature required. */
export async function POST(request: Request) {
  try {
    const config = getServerConfig();
    const rawBody = await request.text();
    if (!config.WHATSAPP_APP_SECRET) {
      return NextResponse.json(
        { error: "WhatsApp not configured" },
        { status: 503 },
      );
    }

    const signature = request.headers.get("x-hub-signature-256");
    if (
      !verifyWhatsAppSignature({
        appSecret: config.WHATSAPP_APP_SECRET,
        rawBody,
        signatureHeader: signature,
      })
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id?: string;
              from?: string;
              type?: string;
              text?: { body?: string };
            }>;
            statuses?: Array<{ id?: string; status?: string }>;
          };
        }>;
      }>;
    };

    if (!config.WHATSAPP_ACCESS_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
      return NextResponse.json(
        { error: "WhatsApp messaging is not configured" },
        { status: 503 },
      );
    }

    const { repository } = getCareerCampaignCronServices();
    const sender = new WhatsAppCloudNotificationSender({
      accessToken: config.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      templateName:
        config.WHATSAPP_TEMPLATE_RECOMMENDATION ?? "zeno_recommendation",
      templateLanguage: config.WHATSAPP_TEMPLATE_LANGUAGE,
      graphApiVersion: config.WHATSAPP_GRAPH_API_VERSION,
      publicBaseUrl: config.PUBLIC_APP_BASE_URL,
    });

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          if (!message.id || !message.from) continue;
          try {
            await handleWhatsAppInboundMessage({
              messageId: message.id,
              waId: message.from,
              text: message.type === "text" ? message.text?.body ?? null : null,
              repository,
              publicBaseUrl: config.PUBLIC_APP_BASE_URL,
              sendText: (waId, text) => sender.sendText(waId, text),
            });
          } catch (messageError) {
            console.error("[whatsapp] inbound message failed", {
              messageId: message.id,
              error:
                messageError instanceof Error
                  ? messageError.message
                  : "Unknown WhatsApp error",
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
