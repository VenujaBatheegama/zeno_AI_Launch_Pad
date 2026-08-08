# Zeno

Zeno is a proactive career agent. The implemented vertical slices provide
verified career evidence, preference-driven job discovery, and evidence-backed
career intelligence:

`CV upload → text extraction → structured draft → review/edit → verification`

`Job preferences → hybrid discovery (JSearch + TheirStack + ITPro.lk) →
normalize/merge/deduplicate → save/dismiss`

`Verified evidence + preferences → career stage → multi-query plan → analyse →
deterministic evidence-fit scoring → ranked matches`

## Local setup

Requirements: Node.js 22+ and pnpm.

1. Create a Supabase project.
2. Run `supabase/migrations/0001_slice_0.sql` in its SQL editor. This creates
   the two Slice 0 tables and the private `cv-sources` bucket.
3. Run `supabase/migrations/0002_slice_1.sql`. This additively creates search
   preferences, organizations, jobs, provider listings, and user-job state.
4. Run `supabase/migrations/0003_slice_2.sql`. This additively creates career
   stage assessments, search plans, planned queries, query provenance links,
   job analyses/requirements, and match analyses.
5. Run `supabase/migrations/0004_slice_2_1.sql`. This additively creates
   candidate capability profiles/signals and widens planned-query source values.
6. Copy `.env.example` to `.env.local` and fill in the Supabase service-role
   key and `GROQ_API_KEY`.
7. Configure hybrid job sources via `JOB_SOURCES` (default
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
   - Public ATS boards (Greenhouse/Lever) are an extension point only;
     not wired in the current MVP (`ATS_BOARDS` documented in `.env.example`)
8. Install and run:

   ```sh
   pnpm install
   pnpm dev
   ```

The application deliberately uses one `DEMO_USER_ID`; it does not yet provide
authentication or production authorization. Supabase, Groq, and JSearch
access are server-only. Never expose these values with `NEXT_PUBLIC_`.
Runtime generation uses the Vercel AI SDK with the official
`@ai-sdk/groq` provider; `GROQ_MODEL` centralizes the Groq-hosted model choice.

### Slice 02 caps

- `CAREER_SEARCH_QUERY_BUDGET` default `4` (max planned JSearch queries per run)
- `CAREER_ANALYSIS_BATCH_SIZE` default `5` (max jobs analysed per user action)

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

1. Complete Slice 0 with a verified CV that includes internship dates and skills.
2. On `/jobs`, set a broad role such as Software Engineering / Software Engineer.
   Do not force internships for the first pass.
3. Open `http://localhost:3000/matching`.
4. Run **Assess career stage** and confirm next bands prioritize associate /
   junior / graduate / Engineer I / suitable Software Engineer when internship
   experience is about six+ months.
5. Create the search plan and confirm several bounded title queries.
6. Run the planned search (uses the hybrid job-source aggregator).
7. Select a few jobs with usable descriptions and analyse them.
8. Open match details and manually recalculate one evidence-fit score from the
   displayed weights/credits.
9. Confirm gaps and unknowns remain distinct, and matched/partial items cite
   verified evidence IDs.
10. Change preferences to internships, reassess, and confirm the override is
    explained and internships remain eligible.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Image-only or password-protected PDFs are not supported. Upload a text-based
PDF or DOCX up to 10 MB.
