import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { CareerCampaignRepository } from "./ports";

const LINK_CODE_TTL_MINUTES = 15;

export type WhatsAppConnectionView = {
  connected: boolean;
  optedIn: boolean;
  maskedNumber: string | null;
};

export async function getWhatsAppConnection(
  userId: string,
  repository: CareerCampaignRepository,
): Promise<WhatsAppConnectionView> {
  const link = await repository.getWhatsAppLink(userId);
  return {
    connected: Boolean(link),
    optedIn: Boolean(link?.optedInAt && !link.optedOutAt),
    maskedNumber: link ? maskWhatsAppId(link.waId) : null,
  };
}

export async function createWhatsAppConnectionCode(input: {
  userId: string;
  repository: CareerCampaignRepository;
  now?: () => Date;
  createCode?: () => string;
}): Promise<{ code: string; expiresAt: string }> {
  const now = input.now?.() ?? new Date();
  const expiresAt = new Date(
    now.getTime() + LINK_CODE_TTL_MINUTES * 60_000,
  ).toISOString();
  const code = normalizeLinkCode(
    input.createCode?.() ?? randomBytes(5).toString("hex"),
  );

  await input.repository.createWhatsAppLinkCode({
    id: randomUUID(),
    userId: input.userId,
    codeHash: hashWhatsAppLinkCode(code),
    createdAt: now.toISOString(),
    expiresAt,
  });

  return { code, expiresAt };
}

export async function disconnectWhatsApp(
  userId: string,
  repository: CareerCampaignRepository,
): Promise<void> {
  await repository.deleteWhatsAppLink(userId);
}

export type WhatsAppInboundResult =
  | { status: "duplicate" | "ignored" }
  | { status: "replied"; command: string; userId: string | null };

export async function handleWhatsAppInboundMessage(input: {
  messageId: string;
  waId: string;
  text: string | null;
  repository: CareerCampaignRepository;
  sendText: (waId: string, text: string) => Promise<void>;
  publicBaseUrl?: string;
  now?: () => Date;
}): Promise<WhatsAppInboundResult> {
  const now = input.now?.() ?? new Date();
  const claimed = await input.repository.claimWhatsAppInboundMessage({
    messageId: input.messageId,
    waId: input.waId,
    receivedAt: now.toISOString(),
  });
  if (!claimed) return { status: "duplicate" };

  const text = input.text?.trim() ?? "";
  if (!text) return { status: "ignored" };

  const linkMatch = /^link\s+([a-z0-9]{8,16})$/iu.exec(text);
  if (linkMatch) {
    const userId = await input.repository.claimWhatsAppLinkCode({
      codeHash: hashWhatsAppLinkCode(linkMatch[1]!),
      waId: input.waId,
      claimedAt: now.toISOString(),
    });
    await input.sendText(
      input.waId,
      userId
        ? "Your WhatsApp is connected to Zeno. Alerts are on. Send HELP to see available commands."
        : "That connection code is invalid, expired, or already linked. Generate a new code in Zeno Settings.",
    );
    return { status: "replied", command: "link", userId };
  }

  const userId = await input.repository.getUserIdByWhatsAppId(input.waId);
  if (!userId) {
    await input.sendText(
      input.waId,
      "This number is not connected to Zeno yet. Open Settings in Zeno, choose Connect WhatsApp, then send the LINK code shown there.",
    );
    return { status: "replied", command: "unlinked", userId: null };
  }

  const command = text.toLocaleLowerCase().replace(/\s+/gu, " ");
  const baseUrl = input.publicBaseUrl?.replace(/\/+$/u, "") ?? "";
  const appLink = (path: string) => (baseUrl ? `${baseUrl}${path}` : path);

  if (["stop", "unsubscribe", "opt out"].includes(command)) {
    await input.repository.setWhatsAppOptOut(userId, now.toISOString());
    await input.sendText(
      input.waId,
      "Zeno WhatsApp alerts are paused. Send START whenever you want to receive them again.",
    );
    return { status: "replied", command: "stop", userId };
  }

  if (["start", "subscribe", "opt in"].includes(command)) {
    await input.repository.setWhatsAppOptIn(userId, now.toISOString());
    await input.sendText(
      input.waId,
      "Zeno WhatsApp alerts are on again. Send HELP to see available commands.",
    );
    return { status: "replied", command: "start", userId };
  }

  const links: Record<string, { label: string; path: string }> = {
    jobs: { label: "Open your Zeno Jobs workspace", path: "/app/jobs" },
    inbox: { label: "Open your Zeno Inbox", path: "/app/recommendations" },
    applications: {
      label: "Open your applications",
      path: "/app/applications",
    },
    growth: { label: "Open your Growth plan", path: "/app/growth" },
  };
  const selected = links[command];
  if (selected) {
    await input.sendText(
      input.waId,
      `${selected.label}: ${appLink(selected.path)}`,
    );
    return { status: "replied", command, userId };
  }

  await input.sendText(
    input.waId,
    [
      "Zeno commands:",
      "JOBS — open job search and campaigns",
      "INBOX — review job and Growth recommendations",
      "APPLICATIONS — open your application tracker",
      "GROWTH — continue your Growth plan",
      "STOP — pause proactive alerts",
      "START — resume proactive alerts",
    ].join("\n"),
  );
  return { status: "replied", command: "help", userId };
}

export function hashWhatsAppLinkCode(code: string): string {
  return createHash("sha256")
    .update(normalizeLinkCode(code), "utf8")
    .digest("hex");
}

function normalizeLinkCode(code: string): string {
  return code.trim().replace(/[^a-z0-9]/giu, "").toUpperCase();
}

function maskWhatsAppId(waId: string): string {
  if (waId.length <= 4) return `••${waId}`;
  return `••••${waId.slice(-4)}`;
}
