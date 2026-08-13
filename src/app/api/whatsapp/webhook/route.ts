import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { verifyWhatsAppSignature } from "@/modules/career-campaign/infrastructure/whatsapp-cloud-sender";
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

/** Inbound WhatsApp events (status + opt-out). Signature required. */
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

    const { repository } = getCareerCampaignCronServices();
    const seen = new Set<string>();

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          if (!message.id || seen.has(message.id)) continue;
          seen.add(message.id);
          const text = message.text?.body?.trim().toLocaleLowerCase() ?? "";
          if (
            message.from &&
            (text === "stop" || text === "unsubscribe" || text === "opt out")
          ) {
            const userId = await repository.getUserIdByWhatsAppId(message.from);
            if (userId) {
              await repository.setWhatsAppOptOut(
                userId,
                new Date().toISOString(),
              );
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
