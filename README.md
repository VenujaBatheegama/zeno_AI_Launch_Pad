# Zeno

Zeno is a proactive career agent. The current vertical slice turns a CV into
user-reviewed, verified career evidence:

`CV upload → text extraction → structured draft → review/edit → verification`

## Local setup

Requirements: Node.js 22+ and pnpm.

1. Create a Supabase project.
2. Run `supabase/migrations/0001_slice_0.sql` in its SQL editor. This creates
   the two Slice 0 tables and the private `cv-sources` bucket.
3. Copy `.env.example` to `.env.local` and fill in the Supabase service-role
   key and `GROQ_API_KEY`. Never expose these values with `NEXT_PUBLIC_`.
4. Install and run:

   ```sh
   pnpm install
   pnpm dev
   ```

The application deliberately uses one `DEMO_USER_ID`; it does not yet provide
authentication or production authorization. Supabase and Groq access are
server-only. Runtime generation uses the Vercel AI SDK with the official
`@ai-sdk/groq` provider; `GROQ_MODEL` centralizes the Groq-hosted model choice.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Image-only or password-protected PDFs are not supported. Upload a text-based
PDF or DOCX up to 10 MB.
