# Job Campaign scheduler

The Jobs workspace has two discovery modes:

1. **Instant Search** (`/app/jobs/search`) — a one-off hybrid search that ranks
   analysed jobs against the verified profile. It never creates Inbox
   recommendations and never edits campaigns.
2. **Job Campaigns** (`/app/jobs/campaigns/...`) — named, durable monitors.
   Equivalent campaigns share one canonical LinkedIn query. Each campaign keeps
   its own listing attribution.

## Fresh Job Watch migration

Existing `fresh_job_watches` rows are copied into `job_search_campaigns` by
migration `0014_job_search_campaigns.sql`. Each user with one watch receives
one equivalent campaign (`{role} — {location}`). Canonical searches and
memberships are reused. The old table is left in place but the application no
longer writes to it.

## Search-result isolation

Instant Search writes `job_search_sessions` / `job_search_session_listings`.
Campaigns write `campaign_listing_sightings`. Shared `job_listings`, saved
`user_jobs`, extraction cache, and match analyses are reused. Starting a new
Instant Search archives the previous Instant Search *display* session. It does
not delete campaign sightings. Scheduled campaign runs never clear Instant
Search sessions.

## Canonical LinkedIn searches

The canonical key remains:

```text
backend-developer|sri-lanka|remote|any|linkedin-guest|fresh-1h
```

Membership is now `(canonical_search_id, campaign_id)`. Pausing or archiving
detaches membership without deleting the shared search. Editing criteria
increments `criteria_version`, moves membership, and schedules an immediate
fresh check.

## Token budget

No Groq call when:

- LinkedIn returns zero cards
- every provider ID was already seen
- listing extraction is cached
- the same user/listing analysis is still current

## Scheduler

The application tick is stateless. Call `GET` or `POST /api/cron/campaign`
about every **15 minutes** with `Authorization: Bearer $CRON_SECRET`.

Vercel Hobby only supports daily cron. `vercel.json` keeps a daily fallback so
the project still deploys on Hobby. **Do not treat that daily cron as the
15-minute LinkedIn checker.**

Use GitHub Actions (`.github/workflows/job-campaign-scheduler.yml`) or another
external scheduler:

| Secret | Purpose |
|---|---|
| `APP_URL` | Deployed origin, e.g. `https://your-app.vercel.app` |
| `CRON_SECRET` | Same value as the app `CRON_SECRET` |

On Vercel Pro you may instead set a 15-minute cron for `/api/cron/campaign`.

## Inbox attribution and re-surfacing

Background campaigns create Inbox items when the fit score meets the threshold,
the listing is hard-constraint eligible, the listing is not already recommended,
and the per-run cap is not exceeded.

- **Attribution**: Inbox recommendation cards display a `via {campaign_name}` badge.
- **Jobs re-surfacing**: Dismissed recommendations are eligible to re-surface in the
  Inbox if `RESURFACING_WINDOW_DAYS` (default 30 days) have elapsed since dismissal
  AND the underlying listing has a new campaign sighting (`seen_at > dismissed_at`).
- **Growth re-surfacing (FU-5, deferred)**: Re-surfacing on the Growth tab is
  keyed on assessment refresh events rather than listing sightings, and is deferred.

