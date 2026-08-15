import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerCampaignApplication } from "@/server/composition-root";
import { getServerConfig } from "@/server/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const config = getServerConfig();
    const connection = await getCareerCampaignApplication(
      userId,
    ).getWhatsAppConnection();
    return NextResponse.json({
      ...connection,
      enabled: whatsappConfigured(config),
      provider: config.WHATSAPP_PROVIDER,
      businessPhone: businessPhone(config),
      sandboxJoinCode:
        config.WHATSAPP_PROVIDER === "twilio"
          ? config.TWILIO_SANDBOX_JOIN_CODE ?? null
          : null,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function POST() {
  try {
    const userId = await requireUserId();
    const config = getServerConfig();
    if (!whatsappConfigured(config)) {
      return NextResponse.json(
        { error: "WhatsApp has not been configured for this Zeno deployment." },
        { status: 503 },
      );
    }
    const result = await getCareerCampaignApplication(
      userId,
    ).createWhatsAppConnectionCode();
    return NextResponse.json({
      ...result,
      provider: config.WHATSAPP_PROVIDER,
      businessPhone: businessPhone(config),
      sandboxJoinCode:
        config.WHATSAPP_PROVIDER === "twilio"
          ? config.TWILIO_SANDBOX_JOIN_CODE ?? null
          : null,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await getCareerCampaignApplication(userId).disconnectWhatsApp();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

function whatsappConfigured(config: ReturnType<typeof getServerConfig>) {
  if (!config.WHATSAPP_ENABLED || !config.PUBLIC_APP_BASE_URL) return false;

  if (config.WHATSAPP_PROVIDER === "twilio") {
    return Boolean(
      config.TWILIO_ACCOUNT_SID &&
        config.TWILIO_AUTH_TOKEN &&
        businessPhone(config),
    );
  }

  return Boolean(
    config.WHATSAPP_PHONE_NUMBER_ID &&
      config.WHATSAPP_BUSINESS_PHONE_E164 &&
      config.WHATSAPP_ACCESS_TOKEN &&
      config.WHATSAPP_VERIFY_TOKEN &&
      config.WHATSAPP_APP_SECRET,
  );
}

function businessPhone(config: ReturnType<typeof getServerConfig>) {
  const value =
    config.WHATSAPP_PROVIDER === "twilio"
      ? config.TWILIO_WHATSAPP_NUMBER ?? config.WHATSAPP_BUSINESS_PHONE_E164
      : config.WHATSAPP_BUSINESS_PHONE_E164;
  return value?.replace(/^whatsapp:/iu, "") ?? null;
}
