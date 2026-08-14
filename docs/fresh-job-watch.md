# Fresh Job Watch

This document describes the original one-watch-per-user design.

**Current product language is Job Campaigns.** See `docs/job-campaigns.md` for
the multi-campaign Jobs workspace, Instant Search isolation, and the 15-minute
scheduler.

# Fresh Job Watch (historical)

Zeno can watch for newly listed jobs without turning every search into a
permanent monitor.

## Find Jobs vs Fresh Job Watch

**Find new jobs** is a one-time action on the Jobs page. It runs the existing
hybrid search, analyses a shortlist, and returns ranked cards. It does not
enable monitoring.

**Fresh Job Watch** is an explicit toggle. When active, Zeno:

- runs a **broad hybrid campaign** about twice daily (related titles, ESCO
  variants, LinkedIn Guest, JSearch, TheirStack, ITPro)
- runs a **narrow LinkedIn guest check** about every 15 minutes for one
  primary role

CV and cover-letter generation still happen only after the user accepts a
recommendation.

## Two speeds

| Lane | Interval | Purpose |
|---|---|---|
| LinkedIn fresh check | 15 minutes (configurable) | Newest cards for one primary role |
| Broad hybrid campaign | 12 hours (configurable) | Related titles and other providers |

The application layer is scheduler-independent. Vercel Cron, an external
scheduler, or a signed local POST can call `GET/POST /api/cron/campaign`.

## Canonical shared searches

Equivalent retrieval criteria share one LinkedIn request:

```text
backend-developer|sri-lanka|remote|any|linkedin-guest|fresh-1h
```

Alert thresholds, profile evidence, and notification preferences do not create
extra provider queries. Changing role, location, or work mode moves the user
to a different canonical search.

## One-hour overlap window

The LinkedIn query uses `f_TPR=r3600` and `sortBy=DD`. The scheduler may run
every 15 minutes, but the query looks back about an hour so a missed tick,
indexing delay, or brief cooldown does not drop a job. Repeated cards are
expected and discarded by provider job ID.

## Deduplication

1. Cheap card metadata is parsed (id, title, company, location, URL, published time).
2. `UNIQUE(provider, provider_job_id)` records the sighting.
3. Known IDs update `last_seen_at` only — no job-detail fetch, no Groq.
4. New IDs get `first_seen_at` (Zeno clock) separate from provider `published_at`.
5. Cross-provider duplicates use canonical apply URL, then a conservative
   company+title+location+day fingerprint. Similar titles are not merged.

## Why repeated cards do not consume LLM tokens

Empty pages, already-seen LinkedIn IDs, and jobs rejected by location/work-mode
filters never fetch descriptions and never call Groq. Extraction is cached
globally by description hash + schema/policy version.

## Groq shared rate limits

Extra API keys from the same Groq organization do not multiply quota. A 429
establishes a shared cooldown, stops the current analysis batch, and preserves
completed work. Schema failures get at most one targeted repair on the same
model. Zeno does not fall back to a larger model solely because quota is
exhausted.

## Scheduler and hosting

`vercel.json` keeps a **daily** cron (`0 6 * * *`) so the app stays deployable
on Vercel Hobby, which does not support 15-minute cron.

To actually check every 15 minutes, call the protected route from an external
scheduler (GitHub Actions, cron, or Vercel Pro):

```sh
curl -X POST "$PUBLIC_APP_BASE_URL/api/cron/campaign" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Timing is approximate. LinkedIn indexing can delay visibility. Zeno does not
guarantee discovery within 15 minutes, first-applicant status, or complete
coverage of every internet job.

## Local demonstration

1. Apply migrations through `0011_fresh_job_watch.sql` on your local/project
   database. Do not apply from this agent to remote Supabase.
2. Set `CRON_SECRET` in `.env.local` (never commit it).
3. Enable Fresh Job Watch on `/app/jobs` with a primary role and location.
4. Trigger one tick:

```sh
curl -X POST http://localhost:3000/api/cron/campaign \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

5. Confirm the panel timestamps update and that Find new jobs still runs
   independently.

## Configuration

See `.env.example` for `FRESH_*` and `LINKEDIN_FRESH_ENABLED`. Defaults are
conservative. `JOB_SOURCES` without `linkedin` disables the fresh LinkedIn
lane; broad hybrid can still run.

## Limitations

- LinkedIn Guest is an unofficial, unsupported public endpoint. It may change,
  rate-limit, return incomplete HTML, or stop working. Zeno does not log in,
  rotate proxies, or bypass CAPTCHA/blocking.
- Automated production use requires legal/terms review.
- Provider cooldowns after `429`/`403` are persisted and skip further LinkedIn
  requests until the cooldown expires.
- WhatsApp delivery stays optional and is not live-enabled by this feature.
