# Zeno

Zeno is a proactive career agent. The implemented vertical slices provide
verified career evidence, preference-driven job discovery, and evidence-backed
career intelligence:

`CV upload → text extraction → structured draft → review/edit → verification`

`Job preferences → ESCO occupation title expansion → hybrid discovery
(LinkedIn + JSearch + TheirStack + ITPro.lk) → normalize/merge/deduplicate →
save/dismiss`

`Verified evidence + preferences → career stage → analyse discovered jobs →
deterministic evidence-fit scoring → ranked matches`

`Analysed job + verified evidence → content plan → one LLM tailor call →
grounding validation → ATS PDF preview/download`

**Search principle:** you choose the roles and filters. ESCO may add a few
closely related occupation titles. Verified career evidence is used only after
discovery (matching, scoring, CV tailoring) — never to silently pick search
roles.

## Local setup

Requirements: Node.js 22+ and pnpm.

1. Create a Supabase project.
2. Run the numbered files in `supabase/migrations` through
   `0017_telegram_connection.sql`
   in order (or apply pending migrations with the Supabase CLI). Migration
   `0009` adds the ESCO resolution cache, updates planned-query sources to
   `exact_role` / `esco_preferred` / `esco_alternative`, and drops the Smart
   Skill Analyser / capability-profile tables. Migration `0010` adds the
   proactive campaign tables (recommendations, packets, applications, runs,
   notification outbox). Migration `0011` adds canonical LinkedIn searches and
   the original one-watch-per-user table. Migration `0014` adds multi-campaign
   `job_search_campaigns`, Instant Search sessions, and campaign listing
   attribution. Migration `0015` adds campaign-aware Growth, and `0016` adds
   secure WhatsApp linking and inbound-message idempotency. Migration `0017`
   adds Telegram linking, webhook idempotency, and notification delivery.
3. Copy `.env.example` to `.env.local` and fill in the Supabase service-role
   key and `GROQ_API_KEY`.
4. Configure hybrid job sources via `JOB_SOURCES` (default
   `linkedin,jsearch,theirstack,itpro`). All enabled sources are equal peers:
   concurrent fan-out, interleaved merge, no preferred provider. Missing
   optional credentials disable that source rather than failing the whole app:
   - **LinkedIn guest**: unofficial jobs-guest HTML endpoint — no API key;
     may rate-limit; keep `LINKEDIN_MAX_PAGES` small
   - **JSearch**: OpenWeb Ninja (`JSEARCH_API_KEY` + `JSEARCH_BASE_URL`) or
     RapidAPI (`RAPIDAPI_KEY` + `JSEARCH_API_HOST=jsearch.p.rapidapi.com`)
   - **TheirStack**: `THEIRSTACK_API_KEY` (keep `THEIRSTACK_PAGE_SIZE` small —
     credits are per job returned)
   - **ITPro.lk**: public `GET /api/v1/jobs`, no API key required
5. Optional ESCO tuning: `ESCO_API_BASE_URL`, `ESCO_TIMEOUT_MS`,
   `ESCO_LANGUAGE`, `ESCO_MAX_ALTERNATIVE_TITLES` (default 2). If ESCO is down
   or ambiguous, Zeno searches your exact role titles only.
6. Install and run:

   ```sh
   pnpm install
   pnpm dev
   ```

Supabase, Groq, JSearch, and ESCO access are server-only. Never expose these
values with `NEXT_PUBLIC_`. Runtime generation uses the Vercel AI SDK with the
official `@ai-sdk/groq` provider; `GROQ_MODEL` centralizes the Groq-hosted
model choice.

### Search / analysis caps

- `CAREER_SEARCH_QUERY_BUDGET` default `2` (max planned provider queries per run)
- `CAREER_ANALYSIS_BATCH_SIZE` default `15` (detailed analyse shortlist; ranked results may show fewer)
- `ESCO_MAX_ALTERNATIVE_TITLES` default `2` (extra labels per explicit role,
  excluding the ESCO preferred title)

Fetched jobs are ordered by **search relevance** plus capped **profile alignment**
(explicit preferred/excluded interests + verified skills). After Analyse,
ordering combines search relevance, interest alignment, and **scoring-v2**
evidence fit. Verified skills are never treated as interests.

Evidence-fit scoring is deterministic application policy (`scoring-v2`):

`100 × Σ(weight × credit) ÷ Σ(applicable weights)`, rounded with `Math.round`.

Weights: required=3, preferred=1, unclear=2. Credits: matched=1.0, partial=0.5,
low-confidence partial (e.g. skill-list-only)=0.25, gap=0, unknown=0.
Conjunctive multi-tech requirements need majority term coverage before earning
credit. Career-level suitability and confidence stay separate from the
percentage.

## Live Job Discovery check

1. Start Zeno and open `http://localhost:3000/jobs`.
2. Add roles such as Software Engineer, Associate Software Engineer, and
   DevOps Engineer.
3. Add Sri Lanka, Colombo, and Remote as locations, then save.
4. Refresh and confirm the preferences persist.
5. Select **Find jobs** and confirm real listings appear.
6. Open a listing and verify its external destination.
7. Save one job and dismiss another, then refresh to confirm persistence.
8. Search again and confirm existing provider listings are refreshed rather
   than duplicated.

Hybrid discovery fans out concurrently through `POST /api/jobs/discover`.
Providers are isolated (one failure/empty result does not discard others).
JSearch remains bounded by `JSEARCH_MAX_REQUESTS` / `JSEARCH_MAX_PAGES` and a
server-side timeout; TheirStack page size stays small to protect credits.
Missing salary, experience, work mode, closing date, or apply URL values remain
unknown rather than being inferred.

## Live Career Intelligence check

1. Complete onboarding with a verified CV that includes internship dates and skills.
2. On matching, set explicit roles such as Software Engineer.
3. Open `http://localhost:3000/app/matching` (or `/matching`).
4. Optionally assess career stage for post-discovery ranking context.
5. Search for jobs and confirm **Also search for** shows ESCO alternatives
   (or exact-role fallback if ESCO is unavailable).
6. Analyse discovered jobs; confirm evidence-fit ranking uses verified evidence.
7. Open match details and confirm gaps/unknowns stay distinct from matched items.
8. Tailor a CV for a matched listing and confirm grounding validation still applies.

## Jobs: Instant Search and Job Campaigns

`/app/jobs` is the Jobs control centre. **Instant Search** (`/app/jobs/search`)
is a one-off hybrid search. **Job Campaigns** are named monitors; Zeno checks
LinkedIn about every 15 minutes and runs a broader search about every 12 hours.
See `docs/job-campaigns.md` for isolation, canonical searches, token budget,
and the 15-minute scheduler (GitHub Actions; Vercel Hobby is daily-only).

## WhatsApp MVP

Zeno can link an authenticated account to a WhatsApp identity with a short-lived
one-time code, deliver proactive recommendation templates, and handle the
`HELP`, `JOBS`, `INBOX`, `APPLICATIONS`, `GROWTH`, `STOP`, and `START` commands.
Apply migration `0016` and follow `docs/whatsapp-integration.md` to configure
either Meta Cloud API or Twilio's WhatsApp Sandbox. Both transports reuse the
same linking, commands, opt-in state, notification queue, and campaign logic.

## Telegram MVP

For the competition demo, Telegram can be enabled independently of WhatsApp.
Users connect with a short-lived bot deep link; Zeno then supports proactive
recommendation alerts and `/help`, `/jobs`, `/inbox`, `/applications`,
`/growth`, `/stop`, and `/start`. Apply migration `0017` and follow
`docs/telegram-integration.md` for BotFather, Vercel, and webhook setup.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Image-only or password-protected PDFs are not supported. Upload a text-based
PDF or DOCX up to 10 MB.
