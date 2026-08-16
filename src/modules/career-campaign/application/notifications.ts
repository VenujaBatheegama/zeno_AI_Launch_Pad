import type {
  CareerCampaignRepository,
  DeliveryResult,
  NotificationSender,
} from "./ports";

export async function deliverPendingNotifications(
  deps: {
    repository: CareerCampaignRepository;
    senders: Partial<
      Record<"in_app" | "whatsapp" | "telegram", NotificationSender>
    >;
    now: () => Date;
    channel?: "in_app" | "whatsapp" | "telegram";
    userId?: string;
    limit?: number;
  },
): Promise<{ delivered: number; failed: number; suppressed: number }> {
  const now = deps.now().toISOString();
  const pending = await deps.repository.claimPendingNotifications({
    ...(deps.channel ? { channel: deps.channel } : {}),
    ...(deps.userId ? { userId: deps.userId } : {}),
    limit: deps.limit ?? 20,
    now,
  });

  let delivered = 0;
  let failed = 0;
  let suppressed = 0;

  for (const item of pending) {
    if (item.channel === "whatsapp") {
      const link = await deps.repository.getWhatsAppLink(item.userId);
      if (!link?.optedInAt || link.optedOutAt) {
        await deps.repository.updateNotification(item.id, {
          status: "suppressed",
          lastError: "User not opted in to WhatsApp",
        });
        suppressed += 1;
        continue;
      }
    }

    if (item.channel === "telegram") {
      const link = await deps.repository.getTelegramLink(item.userId);
      if (!link?.optedInAt || link.optedOutAt) {
        await deps.repository.updateNotification(item.id, {
          status: "suppressed",
          lastError: "User not opted in to Telegram",
        });
        suppressed += 1;
        continue;
      }
    }

    const sender = deps.senders[item.channel];
    if (!sender) {
      if (item.channel === "in_app") {
        await deps.repository.updateNotification(item.id, {
          status: "sent",
          sentAt: now,
          lastError: null,
        });
        delivered += 1;
        continue;
      }
      await deps.repository.updateNotification(item.id, {
        status: "failed",
        lastError: `${item.channel} sender not configured`,
      });
      failed += 1;
      continue;
    }

    const result: DeliveryResult = await sender.send(item);
    if (result.ok) {
      await deps.repository.updateNotification(item.id, {
        status: "sent",
        sentAt: now,
        lastError: null,
      });
      delivered += 1;
    } else {
      await deps.repository.updateNotification(item.id, {
        status: result.retryable && item.attemptCount < 5 ? "failed" : "failed",
        lastError: result.error.slice(0, 400),
      });
      failed += 1;
    }
  }

  return { delivered, failed, suppressed };
}

/** In-app: persistence is delivery. */
export class InAppNotificationSender implements NotificationSender {
  async send(): Promise<DeliveryResult> {
    return { ok: true };
  }
}
