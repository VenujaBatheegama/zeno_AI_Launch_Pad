# WhatsApp MVP codebase map

This version adds WhatsApp as a secure notification and command channel while
keeping the Zeno web application and Supabase database as the source of truth.

## Request flow

1. An authenticated user creates a short-lived link code from Settings.
2. The user sends `LINK <code>` to the configured WhatsApp number.
3. Meta or Twilio sends the inbound message to its signed webhook route.
4. Zeno verifies the provider signature, deduplicates the message, atomically claims
   the code, and links the WhatsApp identity to the signed-in user.
5. Deterministic commands return links into the web app without using an LLM.
6. Approved templates can deliver proactive recommendation notifications.

## Files added

- `supabase/migrations/0016_whatsapp_connection.sql` — link codes, inbound
  idempotency, and the atomic link-code claim function.
- `src/app/api/whatsapp/link/route.ts` — authenticated connection status,
  code creation, and disconnect endpoints.
- `src/modules/career-campaign/application/whatsapp-connection.ts` — linking,
  commands, opt-in, opt-out, and inbound-message handling.
- `src/modules/career-campaign/application/whatsapp-connection.test.ts` —
  application-level behavior tests.
- `src/app/api/whatsapp/twilio/webhook/route.ts` — signed Twilio Sandbox
  webhook and inbound form parsing.
- `src/modules/career-campaign/infrastructure/twilio-whatsapp-sender.ts` —
  Twilio REST sender, signature verification, and address normalization.
- `docs/whatsapp-integration.md` — Meta/Twilio, environment, webhook, and
  database setup.

## Files extended

- `src/app/api/whatsapp/webhook/route.ts` — signed inbound webhook processing.
- `src/modules/career-campaign/application/ports.ts` — persistence operations
  required for linking and deduplication.
- `src/modules/career-campaign/application/fakes.ts` — in-memory test support.
- `src/modules/career-campaign/infrastructure/supabase-career-campaign-repository.ts`
  — Supabase implementations for the new persistence operations.
- `src/modules/career-campaign/infrastructure/whatsapp-cloud-sender.ts` — text
  replies, templates, timeout, and configurable Graph API version.
- `src/server/composition-root.ts` — provider selection, dependencies, and
  WA-ID lookup.
- `src/server/config.ts` and `.env.example` — server-only WhatsApp settings.
- `src/app/app/settings/page.tsx` — Connect WhatsApp user interface.

## Deliberately deferred

- Free-form LLM chat over WhatsApp
- Starting expensive job searches directly inside the webhook
- CV generation or application submission from an unconfirmed message
- Delivery/read analytics and interactive list messages

Those capabilities should be added behind a durable background queue after the
transport foundation is deployed and tested. This prevents Meta retries from
duplicating costly work.

## Deployment order

1. Merge the source changes through a feature branch and pull request.
2. Apply Supabase migration `0016_whatsapp_connection.sql`.
3. Deploy with `WHATSAPP_ENABLED=false` and verify the base application.
4. Add credentials for the selected provider and set `WHATSAPP_ENABLED=true`.
5. Redeploy and configure the provider callback URL.
6. Test provider onboarding, Zeno linking, commands, and an alert.
