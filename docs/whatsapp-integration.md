# WhatsApp Cloud API MVP

Zeno uses Meta's official WhatsApp Cloud API. The web application remains the
source of truth; WhatsApp is a lightweight alert and command channel.

## Implemented flow

1. An authenticated user opens **Settings → Connect WhatsApp**.
2. Zeno creates a single-use connection code that expires after 15 minutes.
3. The user sends `LINK <code>` to Zeno's WhatsApp number.
4. Meta posts the message to `/api/whatsapp/webhook`.
5. Zeno verifies `x-hub-signature-256`, claims the code atomically, links the
   WhatsApp identity to the authenticated account, opts the user in, and sends
   a confirmation reply.
6. Proactive recommendation alerts use an approved message template.

Inbound webhook message IDs are persisted so Meta retries do not execute the
same command twice.

## Commands

- `HELP` — show commands
- `JOBS` — open Jobs and campaigns
- `INBOX` — open job and Growth recommendations
- `APPLICATIONS` — open the application tracker
- `GROWTH` — open the Growth plan
- `STOP` — opt out of proactive WhatsApp alerts
- `START` — opt back in

These commands do not invoke an LLM.

## Meta setup

1. Create or open a Meta developer app and add WhatsApp.
2. In **WhatsApp → API Setup**, obtain the test/business phone number, Phone
   Number ID, and an access token.
3. Deploy Zeno to a public HTTPS URL.
4. Configure the callback URL as:

   `https://YOUR_DOMAIN/api/whatsapp/webhook`

5. Use the same private value for the dashboard verification token and
   `WHATSAPP_VERIFY_TOKEN`.
6. Subscribe the webhook to WhatsApp `messages` events.
7. Set `WHATSAPP_APP_SECRET` to the Meta app secret. Never expose it to the
   browser.
8. For proactive alerts, create and approve the template configured by
   `WHATSAPP_TEMPLATE_RECOMMENDATION`. Its body must accept two text variables:
   the recommendation title and the Zeno review link.

Example body:

`Zeno found a new match for you: {{1}} Review it here: {{2}}`

When using Meta's test number, add each recipient to the permitted test
recipient list in the Meta dashboard.

## Environment

```env
WHATSAPP_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_PHONE_E164=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_TEMPLATE_RECOMMENDATION=zeno_recommendation
WHATSAPP_TEMPLATE_LANGUAGE=en
WHATSAPP_GRAPH_API_VERSION=v21.0
PUBLIC_APP_BASE_URL=https://YOUR_DOMAIN
```

Use an API version supported by the Meta app. The version is configurable so
it can be upgraded without changing application code.

## Database

Apply `supabase/migrations/0016_whatsapp_connection.sql` after migration
`0015`. It adds expiring link codes, inbound-message idempotency, and the
service-role-only function that atomically claims a connection code.

## Deliberately deferred

- Free-form LLM career chat through WhatsApp
- Triggering expensive job searches from a webhook
- CV document delivery through WhatsApp
- Interactive buttons and list messages
- Delivery/read analytics in the Zeno UI
- Multi-channel conversation history

Keeping these out of the MVP prevents webhook retries from triggering costly
or long-running AI work. They can be added behind explicit queued commands.
