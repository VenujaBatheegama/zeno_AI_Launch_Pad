# Telegram Bot MVP

Telegram is Zeno's competition-demo communication channel. The web app remains
the source of truth; the bot provides account linking, proactive alerts, and
short navigation commands. Telegram does not impose WhatsApp's 24-hour
customer-service window or approved-template requirement.

## Create the bot

1. Open Telegram and message the verified **@BotFather** account.
2. Send `/newbot`, choose a display name and a username ending in `bot`.
3. Copy the bot token. Treat it as a server secret.
4. Set the Vercel environment variables below and redeploy.

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456789:replace-with-botfather-token
TELEGRAM_BOT_USERNAME=ZenoCareerBot
TELEGRAM_WEBHOOK_SECRET=replace-with-a-random-16-to-256-character-secret
PUBLIC_APP_BASE_URL=https://zeno-ai-launch-pad.vercel.app
```

Generate the webhook secret locally with `openssl rand -hex 24`. Do not place
the token or webhook secret in a `NEXT_PUBLIC_` variable.

## Database and deployment

1. Apply `supabase/migrations/0017_telegram_connection.sql` after migration
   `0016`.
2. Add the five environment variables to Vercel **Production**, and to Preview
   only if you intend to test a preview deployment.
3. Redeploy so the server functions receive the new values.

## Register the webhook

Run this once from your terminal, replacing the placeholders. Do not paste the
real token into chat or commit it to Git.

```sh
curl --request POST \
  "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://zeno-ai-launch-pad.vercel.app/api/telegram/webhook",
    "secret_token": "YOUR_TELEGRAM_WEBHOOK_SECRET",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

A successful response contains `"ok":true`. You can inspect the registration
without exposing the token in application logs:

```sh
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
```

The webhook URL must be the stable production domain, not a branch-preview URL.

## Demo flow

1. Sign in to Zeno and open **Settings**.
2. Select **Connect Telegram**.
3. Select **Open Telegram**, then press **Start** in the bot chat.
4. Return to Settings and refresh the connection status.
5. Send `/jobs`, `/inbox`, `/applications`, `/growth`, or `/help`.
6. Run a job campaign that creates a recommendation. Zeno enqueues and sends a
   proactive Telegram alert when pending notifications are delivered.

`/stop` pauses proactive alerts and `/start` resumes them. Webhook `update_id`
values are stored so Telegram retries cannot execute a command twice.

## Scope and token control

Bot commands are deterministic and do not invoke an LLM. The webhook does not
run job discovery or CV generation. This prevents retries from causing costly
or long-running work. A later iteration can route free-form messages into the
existing Career Friend agent behind a queue, rate limit, and explicit tool
permissions.
