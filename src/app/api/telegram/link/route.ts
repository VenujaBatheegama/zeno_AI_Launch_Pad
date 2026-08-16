import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";
import { getServerConfig } from "@/server/config";

export const runtime = "nodejs";

function telegramAvailability() {
  const config = getServerConfig();
  const botUsername = config.TELEGRAM_BOT_USERNAME?.replace(/^@/u, "") ?? null;
  return {
    config,
    botUsername,
    enabled: Boolean(
      config.TELEGRAM_ENABLED &&
        config.TELEGRAM_BOT_TOKEN &&
        botUsername &&
        config.TELEGRAM_WEBHOOK_SECRET &&
        config.PUBLIC_APP_BASE_URL,
    ),
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const { enabled, botUsername } = telegramAvailability();
    const connection = await getCareerCampaignApplication(
      userId,
    ).getTelegramConnection();
    return NextResponse.json({ ...connection, enabled, botUsername });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST() {
  try {
    const userId = await requireUserId();
    const { enabled, botUsername } = telegramAvailability();
    if (!enabled || !botUsername) {
      return NextResponse.json(
        { error: "Telegram is not configured for this deployment." },
        { status: 503 },
      );
    }
    const result = await getCareerCampaignApplication(
      userId,
    ).createTelegramConnectionCode();
    return NextResponse.json({
      ...result,
      botUsername,
      botUrl: `https://t.me/${botUsername}?start=${result.code}`,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await getCareerCampaignApplication(userId).disconnectTelegram();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
