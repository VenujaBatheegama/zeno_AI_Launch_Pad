import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  normalizeTwilioWhatsAppId,
  TwilioWhatsAppSender,
  verifyTwilioSignature,
} from "./twilio-whatsapp-sender";

describe("TwilioWhatsAppSender", () => {
  it("sends sandbox messages as form-encoded WhatsApp addresses", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const sender = new TwilioWhatsAppSender({
      accountSid: "AC123",
      authToken: "secret",
      from: "whatsapp:+14155238886",
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify({ sid: "SM123" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    await sender.sendText("94770000000", "Hello from Zeno");

    expect(capturedUrl).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    const form = new URLSearchParams(String(capturedInit?.body));
    expect(form.get("From")).toBe("whatsapp:+14155238886");
    expect(form.get("To")).toBe("whatsapp:+94770000000");
    expect(form.get("Body")).toBe("Hello from Zeno");
    expect(capturedInit?.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });

  it("verifies Twilio's signed form payload and normalizes the sender", () => {
    const authToken = "secret";
    const url = "https://zeno.example/api/whatsapp/twilio/webhook";
    const params = new URLSearchParams({
      MessageSid: "SM123",
      From: "whatsapp:+94770000000",
      Body: "LINK ABCD1234",
    });
    const data = `${url}BodyLINK ABCD1234Fromwhatsapp:+94770000000MessageSidSM123`;
    const signature = createHmac("sha1", authToken)
      .update(data, "utf8")
      .digest("base64");

    expect(
      verifyTwilioSignature({
        authToken,
        url,
        params,
        signatureHeader: signature,
      }),
    ).toBe(true);
    expect(
      verifyTwilioSignature({
        authToken,
        url,
        params,
        signatureHeader: "wrong",
      }),
    ).toBe(false);
    expect(normalizeTwilioWhatsAppId("whatsapp:+94770000000")).toBe(
      "94770000000",
    );
  });
});
