import { describe, expect, it } from "vitest";

import { InMemoryCareerCampaignRepository } from "./fakes";
import {
  createWhatsAppConnectionCode,
  handleWhatsAppInboundMessage,
} from "./whatsapp-connection";

const now = () => new Date("2026-08-14T08:00:00.000Z");

describe("WhatsApp connection", () => {
  it("links a WhatsApp identity with a one-time code", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    const generated = await createWhatsAppConnectionCode({
      userId: "user-1",
      repository,
      now,
      createCode: () => "ABCD1234",
    });
    const replies: string[] = [];

    const result = await handleWhatsAppInboundMessage({
      messageId: "wamid.link",
      waId: "94770000000",
      text: `LINK ${generated.code}`,
      repository,
      now,
      sendText: async (_waId, text) => {
        replies.push(text);
      },
    });

    expect(result).toMatchObject({ status: "replied", command: "link" });
    expect(await repository.getUserIdByWhatsAppId("94770000000")).toBe(
      "user-1",
    );
    expect(replies[0]).toMatch(/connected to Zeno/iu);
  });

  it("handles opt-out, opt-in, links, and duplicate webhook delivery", async () => {
    const repository = new InMemoryCareerCampaignRepository();
    repository.whatsapp.set("user-1", {
      userId: "user-1",
      waId: "94770000000",
      optedInAt: now().toISOString(),
      optedOutAt: null,
    });
    const replies: string[] = [];
    const sendText = async (_waId: string, text: string) => {
      replies.push(text);
    };

    await handleWhatsAppInboundMessage({
      messageId: "wamid.stop",
      waId: "94770000000",
      text: "STOP",
      repository,
      now,
      sendText,
    });
    expect((await repository.getWhatsAppLink("user-1"))?.optedOutAt).toBe(
      now().toISOString(),
    );

    await handleWhatsAppInboundMessage({
      messageId: "wamid.start",
      waId: "94770000000",
      text: "START",
      repository,
      now,
      sendText,
    });
    expect((await repository.getWhatsAppLink("user-1"))?.optedOutAt).toBeNull();

    const first = await handleWhatsAppInboundMessage({
      messageId: "wamid.jobs",
      waId: "94770000000",
      text: "JOBS",
      repository,
      publicBaseUrl: "https://zeno.example/",
      now,
      sendText,
    });
    const duplicate = await handleWhatsAppInboundMessage({
      messageId: "wamid.jobs",
      waId: "94770000000",
      text: "JOBS",
      repository,
      publicBaseUrl: "https://zeno.example/",
      now,
      sendText,
    });

    expect(first).toMatchObject({ status: "replied", command: "jobs" });
    expect(duplicate).toEqual({ status: "duplicate" });
    expect(replies.at(-1)).toContain("https://zeno.example/app/jobs");
  });
});
