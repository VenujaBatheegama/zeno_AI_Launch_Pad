import { NextResponse } from "next/server";

import { handleTelegramInboundMessage } from "@/modules/career-campaign/application/telegram-connection";
import { SupabaseCareerCampaignRepository } from "@/modules/career-campaign/infrastructure/supabase-career-campaign-repository";
import {
  TelegramBotNotificationSender,
  verifyTelegramWebhookSecret,
} from "@/modules/career-campaign/infrastructure/telegram-bot-sender";
import { getServerConfig } from "@/server/config";
import { createSupabaseClient } from "@/server/supabase-client";

export const runtime = "nodejs";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number; type?: string; username?: string };
    from?: { username?: string };
  };
};

export async function POST(request: Request) {
  const config = getServerConfig();
  if (
    !config.TELEGRAM_ENABLED ||
    !config.TELEGRAM_BOT_TOKEN ||
    !config.TELEGRAM_WEBHOOK_SECRET ||
    !config.PUBLIC_APP_BASE_URL
  ) {
    return NextResponse.json({ error: "Telegram is disabled." }, { status: 503 });
  }

  if (
    !verifyTelegramWebhookSecret({
      expectedSecret: config.TELEGRAM_WEBHOOK_SECRET,
      receivedSecret: request.headers.get("x-telegram-bot-api-secret-token"),
    })
  ) {
    return NextResponse.json(
      { error: "Invalid webhook secret." },
      { status: 401 },
    );
  }

  const update = (await request
    .json()
    .catch(() => null)) as TelegramUpdate | null;
  const updateId = update?.update_id;
  const chatId = update?.message?.chat?.id;
  if (typeof updateId !== "number" || typeof chatId !== "number") {
    return NextResponse.json({ ok: true });
  }
  if (update?.message?.chat?.type !== "private") {
    return NextResponse.json({ ok: true });
  }

  const repository = new SupabaseCareerCampaignRepository(
    createSupabaseClient(config),
  );
  const sender = new TelegramBotNotificationSender({
    botToken: config.TELEGRAM_BOT_TOKEN,
    publicBaseUrl: config.PUBLIC_APP_BASE_URL,
  });

  try {
    await handleTelegramInboundMessage({
      updateId: String(updateId),
      chatId: String(chatId),
      username:
        update?.message?.from?.username ??
        update?.message?.chat?.username ??
        null,
      text: update?.message?.text ?? null,
      repository,
      publicBaseUrl: config.PUBLIC_APP_BASE_URL,
      sendText: (targetChatId, text) => sender.sendText(targetChatId, text),
    });
  } catch (error) {
    await repository
      .releaseTelegramInboundMessage(String(updateId))
      .catch(() => undefined);
    throw error;
  }

  return NextResponse.json({ ok: true });
}
