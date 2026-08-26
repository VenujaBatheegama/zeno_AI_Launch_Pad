import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  detectAdversarialJailbreak,
  formatTelegramAppLinks,
  getDeflectionMessage,
  sanitizeUserInput,
} from "@/modules/career-friend/domain/guardrails";
import { formatTelegramMarkdown } from "./telegram-formatter";
import type { CareerCampaignRepository } from "./ports";

const LINK_CODE_TTL_MINUTES = 15;

export type TelegramConnectionView = {
  connected: boolean;
  optedIn: boolean;
  displayName: string | null;
};

export async function getTelegramConnection(
  userId: string,
  repository: CareerCampaignRepository,
): Promise<TelegramConnectionView> {
  const link = await repository.getTelegramLink(userId);
  return {
    connected: Boolean(link),
    optedIn: Boolean(link?.optedInAt && !link.optedOutAt),
    displayName: link
      ? link.username
        ? `@${link.username}`
        : maskChatId(link.chatId)
      : null,
  };
}

export async function createTelegramConnectionCode(input: {
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

  await input.repository.createTelegramLinkCode({
    id: randomUUID(),
    userId: input.userId,
    codeHash: hashTelegramLinkCode(code),
    createdAt: now.toISOString(),
    expiresAt,
  });

  return { code, expiresAt };
}

export async function disconnectTelegram(
  userId: string,
  repository: CareerCampaignRepository,
): Promise<void> {
  await repository.deleteTelegramLink(userId);
}

export type TelegramInboundResult =
  | { status: "duplicate" | "ignored" }
  | { status: "replied"; command: string; userId: string | null };

export async function handleTelegramInboundMessage(input: {
  updateId: string;
  chatId: string;
  username: string | null;
  text: string | null;
  repository: CareerCampaignRepository;
  sendText: (chatId: string, text: string) => Promise<void>;
  sendChatAction?: (
    chatId: string,
    action?: "typing" | "upload_document",
  ) => Promise<void>;
  sendDocument?: (
    chatId: string,
    document: Uint8Array | Buffer,
    filename: string,
    caption?: string,
  ) => Promise<void>;
  askAgent?: (agentInput: {
    userId: string;
    message: string;
  }) => Promise<{
    answer: string;
    attachment?: { bytes: Uint8Array | Buffer; filename: string };
  }>;
  publicBaseUrl?: string;
  now?: () => Date;
}): Promise<TelegramInboundResult> {
  const now = input.now?.() ?? new Date();
  const claimed = await input.repository.claimTelegramInboundMessage({
    updateId: input.updateId,
    chatId: input.chatId,
    receivedAt: now.toISOString(),
  });
  if (!claimed) return { status: "duplicate" };

  const text = input.text?.trim() ?? "";
  if (!text) return { status: "ignored" };

  const linkMatch = /^\/start(?:@[a-z0-9_]+)?\s+([a-z0-9]{8,16})$/iu.exec(text);
  if (linkMatch) {
    const userId = await input.repository.claimTelegramLinkCode({
      codeHash: hashTelegramLinkCode(linkMatch[1]!),
      chatId: input.chatId,
      username: input.username,
      claimedAt: now.toISOString(),
    });
    const linkedUserId =
      userId ??
      (await input.repository.getUserIdByTelegramChatId(input.chatId));
    const existingLink =
      !userId && linkedUserId
        ? await input.repository.getTelegramLink(linkedUserId)
        : null;
    const existingAlertsEnabled = Boolean(
      existingLink?.optedInAt && !existingLink.optedOutAt,
    );
    const reply = userId
      ? "Telegram is connected to Zeno. Proactive alerts are on. Ask me any career question or send /help to see commands."
      : linkedUserId
        ? existingAlertsEnabled
          ? "This Telegram chat is already connected to Zeno. Proactive alerts are on. Ask me any career question or send /help to see commands."
          : "This Telegram chat is already connected to Zeno, but proactive alerts are paused. Send /start to resume them."
        : "That connection link is invalid, expired, or already used. Generate a new one in Zeno Settings.";
    await input.sendText(
      input.chatId,
      reply,
    );
    return { status: "replied", command: "link", userId: linkedUserId };
  }

  const userId = await input.repository.getUserIdByTelegramChatId(input.chatId);
  if (!userId) {
    const unlinkedDeflection = getDeflectionMessage("unlinked", input.publicBaseUrl);
    await input.sendText(input.chatId, unlinkedDeflection);
    return { status: "replied", command: "unlinked", userId: null };
  }

  // Trigger typing bubble immediately so user sees the agent is typing
  await input.sendChatAction?.(input.chatId, "typing").catch(() => undefined);

  const command = normalizeCommand(text);
  const baseUrl = input.publicBaseUrl?.replace(/\/+$/u, "") ?? "";
  const appLink = (path: string) => (baseUrl ? `${baseUrl}${path}` : path);

  if (command === "stop" && text.startsWith("/")) {
    await input.repository.setTelegramOptOut(userId, now.toISOString());
    await input.sendText(
      input.chatId,
      "Zeno Telegram alerts are paused. Send /start whenever you want to receive them again.",
    );
    return { status: "replied", command: "stop", userId };
  }

  if (command === "start" && text.startsWith("/")) {
    await input.repository.setTelegramOptIn(userId, now.toISOString());
    await input.sendText(
      input.chatId,
      "Zeno Telegram alerts are on. You can ask me any career question or send /help to see commands.",
    );
    return { status: "replied", command: "start", userId };
  }

  if (command === "help" && text.startsWith("/")) {
    await input.sendText(
      input.chatId,
      [
        "Zeno Career Agent Commands:",
        "/jobs [query] — search jobs (e.g. /jobs remote react or /jobs python)",
        "/inbox — review high-fit & growth recommendations",
        "/applications — open your application tracker",
        "/growth — review growth projects & sprints",
        "/cvs — access tailored CVs & cover letters",
        "/stop — pause proactive alerts",
        "/start — resume proactive alerts",
        "",
        "💡 You can also ask me anything directly in natural chat — like:",
        "• 'Find junior remote DevOps jobs'",
        "• 'Search for Flutter developer roles in Sri Lanka'",
        "• 'What skills should I learn next?'",
        "• 'Send me my CV' or 'Write a cover letter'",
      ].join("\n"),
    );
    return { status: "replied", command: "help", userId };
  }

  const links: Record<string, { label: string; path: string }> = {
    jobs: { label: "Open your Zeno Jobs workspace", path: "/app/jobs" },
    inbox: { label: "Open your Zeno Inbox", path: "/app/recommendations" },
    applications: {
      label: "Open your applications",
      path: "/app/applications",
    },
    growth: { label: "Open your Growth plan", path: "/app/growth" },
    cvs: { label: "Open your CV Hub", path: "/app/cvs" },
  };
  const selected = links[command];
  if (selected && text.startsWith("/")) {
    await input.sendText(
      input.chatId,
      `${selected.label}: ${appLink(selected.path)}`,
    );
    return { status: "replied", command, userId };
  }

  // Pre-LLM Guardrail check for jailbreak / prompt injection
  if (detectAdversarialJailbreak(text)) {
    const jailbreakDeflection = getDeflectionMessage("jailbreak");
    await input.sendText(input.chatId, jailbreakDeflection);
    return { status: "replied", command: "jailbreak_deflected", userId };
  }

  // Route to Conversational Agent with typing pulse & document attachment support
  if (input.askAgent) {
    let typingInterval: NodeJS.Timeout | undefined;
    if (input.sendChatAction) {
      typingInterval = setInterval(() => {
        input.sendChatAction?.(input.chatId, "typing").catch(() => undefined);
      }, 4000);
    }

    try {
      const sanitized = sanitizeUserInput(text);
      const agentResult = await input.askAgent({
        userId,
        message: sanitized,
      });
      const formatted = formatTelegramMarkdown(
        formatTelegramAppLinks(
          agentResult.answer,
          input.publicBaseUrl,
        )
      );

      if (agentResult.attachment && input.sendDocument) {
        await input.sendChatAction?.(input.chatId, "upload_document").catch(() => undefined);
        await input.sendDocument(
          input.chatId,
          agentResult.attachment.bytes,
          agentResult.attachment.filename,
          formatted,
        );
      } else {
        await input.sendText(input.chatId, formatted);
      }
      return { status: "replied", command: "conversational", userId };
    } finally {
      if (typingInterval) clearInterval(typingInterval);
    }
  }

  await input.sendText(
    input.chatId,
    [
      "Zeno commands:",
      "/jobs — open job search and campaigns",
      "/inbox — review job and Growth recommendations",
      "/applications — open your application tracker",
      "/growth — continue your Growth plan",
      "/cvs — access tailored CVs & cover letters",
      "/stop — pause proactive alerts",
      "/start — resume proactive alerts",
    ].join("\n"),
  );
  return { status: "replied", command: "help", userId };
}

export function hashTelegramLinkCode(code: string): string {
  return createHash("sha256")
    .update(normalizeLinkCode(code), "utf8")
    .digest("hex");
}

function normalizeLinkCode(code: string): string {
  return code.trim().replace(/[^a-z0-9]/giu, "").toUpperCase();
}

function normalizeCommand(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/^\//u, "")
    .replace(/@[a-z0-9_]+(?=\s|$)/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return `••${chatId}`;
  return `Telegram ••••${chatId.slice(-4)}`;
}
