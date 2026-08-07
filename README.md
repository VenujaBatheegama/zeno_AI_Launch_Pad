# Zeno

Zeno is a proactive career agent. The implemented vertical slices provide
verified career evidence and preference-driven job discovery:

`CV upload → text extraction → structured draft → review/edit → verification`

`Job preferences → JSearch discovery → normalize/deduplicate → save/dismiss`

## Local setup

Requirements: Node.js 22+ and pnpm.

1. Create a Supabase project.
2. Run `supabase/migrations/0001_slice_0.sql` in its SQL editor. This creates
   the two Slice 0 tables and the private `cv-sources` bucket.
3. Run `supabase/migrations/0002_slice_1.sql`. This additively creates search
   preferences, organizations, jobs, provider listings, and user-job state.
4. Copy `.env.example` to `.env.local` and fill in the Supabase service-role
   key and `GROQ_API_KEY`.
5. Subscribe to **JSearch** and set a server-only API key:
   - Preferred: OpenWeb Ninja direct at
     [https://app.openwebninja.com/api/jsearch](https://app.openwebninja.com/api/jsearch)
     with `JSEARCH_API_KEY` and
     `JSEARCH_BASE_URL=https://api.openwebninja.com/jsearch`
   - Alternative: RapidAPI JSearch with `RAPIDAPI_KEY` and
     `JSEARCH_API_HOST=jsearch.p.rapidapi.com`
6. Install and run:

   ```sh
   pnpm install
   pnpm dev
   ```

The application deliberately uses one `DEMO_USER_ID`; it does not yet provide
authentication or production authorization. Supabase, Groq, and JSearch
access are server-only. Never expose these values with `NEXT_PUBLIC_`.
Runtime generation uses the Vercel AI SDK with the official
`@ai-sdk/groq` provider; `GROQ_MODEL` centralizes the Groq-hosted model choice.
Job discovery is deterministic and does not use AI matching.

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

JSearch calls are bounded by `JSEARCH_MAX_REQUESTS` (maximum 5), cursor-based
`JSEARCH_MAX_PAGES` (maximum 5), and a server-side timeout. The initial MVP
defaults to two pages to protect API quota. Missing salary, experience, work mode,
closing date, or apply URL values remain unknown rather than being inferred.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Image-only or password-protected PDFs are not supported. Upload a text-based
PDF or DOCX up to 10 MB.
