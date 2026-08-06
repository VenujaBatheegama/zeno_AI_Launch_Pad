# Zeno MVP — Cursor Context / Source of Truth

Last updated: 2026-08-06

## 1. What Zeno is

Zeno is a proactive AI career agent that helps a user discover relevant jobs, tailor CVs from verified career evidence, manage applications, and receive useful career actions through the channels they already use.

The MVP is intentionally focused on three core jobs:

1. Job discovery and ranking.
2. Evidence-grounded CV tailoring.
3. Application management.

The proactive agent and chat integrations remain important differentiators, but they come after the core web/backend workflows work reliably.

Zeno is not a generic job board, a CV template editor, or a WhatsApp-only bot.

## 2. Product problem

Job seekers currently jump between job boards, CV files, application trackers, LinkedIn, reminders, and messaging apps. This creates repetitive work and causes people to apply late, use generic CVs, lose track of applications, and miss useful career actions.

Zeno should reduce that cognitive and operational load by maintaining career context and proactively helping the user act.

## 3. MVP promise

The user should eventually be able to:

- Maintain one verified source of career evidence.
- Discover and rank jobs based on their preferences and evidence.
- Understand why a job is a good or bad match.
- Generate a role-specific CV without inventing experience or skills.
- Track applications and their statuses.
- Ask the same system for actions through chat.
- Receive proactive alerts when a sufficiently relevant opportunity appears.

Example future chat actions:

- `Find jobs`
- `Show my best matches`
- `Why does this job match me?`
- `Show my applications`
- `Tailor my CV for this job`
- `Pause alerts`

## 4. Current build philosophy

We are FUNCTIONALITY FIRST.

For the initial prototype:

- Do not implement authentication yet.
- Do not spend significant time polishing the frontend.
- Do not build deferred features just because they are easy to add.
- Do not perform a large rewrite of working existing code without a concrete reason.
- Build one end-to-end vertical slice at a time.
- Keep the architecture compatible with authentication and multiple users later.
- Include `user_id` on user-owned data even while using one hard-coded demo user.
- Prefer simple, inspectable flows over premature abstractions.
- Preserve a deterministic/manual fallback for demo-critical external-data flows.

The prototype should prove the product loop before we optimize productization.

## 5. Non-negotiable AI/data rule

Zeno must distinguish between extracted information and user-verified evidence.

An LLM may extract, classify, summarize, rank, or rewrite. It must not silently invent career facts.

Core rule:

`Tailored CV content must be grounded in user-verified career evidence.`

If the evidence does not support a claim, Zeno should not add it merely because the job description requests it.

Suggested evidence lifecycle:

`uploaded CV -> extracted structured data -> user reviews/edits -> user confirms -> verified career evidence`

Keep the original uploaded source and/or provenance needed to understand where extracted evidence came from.

## 6. Current milestone: Slice 0 — Career evidence ingestion

This is the first real implementation milestone.

### Goal

A user uploads a real CV, Zeno extracts structured career information, the user reviews and corrects it, confirms it, and the confirmed information persists.

### Minimum happy path

1. User opens the CV/profile area.
2. User uploads a supported CV file.
3. Backend stores/accepts the file and extracts its text.
4. AI converts the text into a defined structured schema.
5. Zeno shows the extracted information for review.
6. User can correct incorrect/missing fields.
7. User confirms the information.
8. Confirmed career evidence is persisted for the hard-coded demo `user_id`.
9. Refreshing/reopening the page loads the persisted confirmed data.

### Suggested extracted fields

Keep this schema deliberately small at first:

- basic profile: name, email, phone, location, summary (where available)
- work experience: employer, role, dates, description/bullets
- education: institution, qualification, dates
- skills
- projects: name, dates if present, description/bullets
- certifications if present

Do not invent missing fields.

### Slice 0 definition of done

Slice 0 is done only when the complete happy path works with a real CV and persisted data. A pretty upload screen alone is not completion.

Also verify at least:

- unsupported or invalid file is handled clearly
- extraction failure is recoverable
- user edits survive confirmation
- missing optional information does not break the flow
- model output is validated before persistence
- secrets/API keys are not exposed client-side

## 7. Planned vertical slices after Slice 0

### Slice 1 — Jobs

- Ingest vacancies from the chosen source(s).
- Normalize external vacancy data into Zeno's own job schema.
- Store jobs independently of the upstream API shape.
- Provide a manual developer/admin import fallback so the demo is not dependent on one external API.

Pipeline: `Fetch/import -> Normalize -> Persist`

### Slice 2 — Match, rank, explain

- Compare a job against verified career evidence and user preferences.
- Produce a useful match score/ranking.
- Show evidence-backed reasons for the match and meaningful gaps.
- Do not claim the user has a required skill unless verified evidence supports it.

Pipeline: `Verified evidence + preferences + normalized job -> Match -> Rank -> Explain`

### Slice 3 — Tailored CV

- Generate a job-specific CV using only verified evidence.
- Reorder/rephrase/select relevant evidence without fabricating achievements, employers, qualifications, dates, or skills.
- Give the user a usable output/download.

### Slice 4 — Application management

- Save a job to applications.
- Track application status and important dates.
- Provide the original apply link.
- Show active applications in one place.

### Slice 5 — Chat integration

- Connect the same backend to the first chat channel used for the demo (likely WhatsApp if feasible).
- Chat is a client/connector, not a separate Zeno database or separate agent brain.
- Start with a small command/action set, not unrestricted autonomous behavior.

### Slice 6 — Proactive alerts

Core flow:

`new jobs -> match engine -> threshold check -> alert-policy check -> notification`

Add a developer/demo action such as `Run Alert Check` so the demo is deterministic and does not depend on waiting for a scheduled job.

### Later / only if core MVP is stable

- career trend/skill recommendations
- LinkedIn post drafting and supporting imagery
- additional messaging channels
- richer personalization
- authentication/onboarding polish
- production-grade multi-user security/RLS
- deeper UI polish

These should not block the core job/CV/application product loop.

## 8. Architecture principles

Before changing architecture, inspect the existing repository and reuse what is sensible.

Preferred boundaries:

- UI/client: presentation and user interactions.
- Application/backend layer: workflow/orchestration and secure external API calls.
- Persistence: profiles/evidence, jobs, matches as needed, applications, connector state/settings.
- AI services: structured extraction, matching/explanation, tailoring. Keep prompts/models behind clear functions/services so model providers can change.
- External job sources: adapters normalize third-party data into Zeno's internal schema.
- Messaging connectors: call the same application/backend capabilities used by the website.

Do not make the database schema mirror one job API's response format.

Do not hard-wire business logic into UI components if it belongs in reusable backend/application logic.

If the repository already uses Supabase, prefer extending it rather than introducing another persistence stack without a strong reason. Authentication is still deferred, but database/storage/backend capabilities may be used.

## 9. Demo user and future multi-user design

During the prototype, use one explicit hard-coded demo user identifier in a centralized configuration/location.

Do not scatter magic user IDs throughout components and functions.

User-owned records should still carry `user_id` so we can later replace the demo identity with real authentication without redesigning the data model.

Do not pretend that hard-coded `user_id` is a security boundary. Production authentication, authorization, RLS/access controls, and connector ownership are a later hardening step.

## 10. External integrations

External APIs can change, become rate-limited, or disappear. Keep adapters and fallbacks.

### Job discovery

The internal flow should be:

`External source -> adapter/normalizer -> Zeno job model -> match/rank`

For the prototype, manual seed/imported job records are acceptable as a fallback. Zeno must still be demonstrable if a live vacancy source fails.

### WhatsApp / messaging

WhatsApp is a likely demo channel, not the definition of the product.

The website and all chat connectors should operate on the same user data and backend capabilities. Do not create a parallel WhatsApp-specific product architecture.

## 11. Model usage while DEVELOPING Zeno

These are coding-assistant choices, not Zeno runtime model requirements.

- GPT-5.6 Sol Medium: architecture, difficult backend/AI decisions, hard debugging, final reviews.
- GPT-5.6 Terra Medium: default implementation model; frontend, backend, and normal feature work.
- Kimi K3: design-heavy frontend iterations and screenshot/visual-driven UI work.
- Luna / fast coding model: small repetitive edits and straightforward refactors.

Suggested feature loop:

`Sol plan/review -> Terra implement -> Kimi/Terra UI iteration if needed -> Sol final review`

Do not switch models merely for ceremony. Escalate model strength when the task needs it.

## 12. Installed Matt Pocock engineering skills

The selected initial skill set is:

- `setup-matt-pocock-skills`
- `code-review`
- `codebase-design`
- `improve-codebase-architecture`
- `domain-modeling`
- `grill-me`
- `grill-with-docs`
- `implement`
- `prototype`
- `research`
- `tdd`
- `to-spec`
- `wayfinder`

Use skills deliberately; do not invoke every skill for every change.

Practical intent:

- `setup-matt-pocock-skills`: configure this repository once before relying on the other workflow skills.
- `grill-me` / `grill-with-docs`: challenge unclear requirements or important decisions.
- `codebase-design`: reason about architecture when a feature genuinely needs design work.
- `domain-modeling`: keep important Zeno concepts/terminology coherent as they become established.
- `to-spec`: convert a sufficiently understood feature into an implementable specification.
- `prototype`: use when quickly testing a risky idea is more valuable than productionizing it.
- `implement`: implement an agreed specification/plan.
- `tdd`: use where tests help drive or protect important logic.
- `code-review`: review completed implementation for correctness and maintainability.
- `wayfinder`: useful as the repo/ticket structure grows; it is not required for the first line of MVP code.
- `improve-codebase-architecture`: make targeted improvements when they unlock delivery; do not turn the MVP into a refactor project.
- `research`: use when an implementation decision genuinely requires external/technical research.

Do not install/use `diagnosing-bugs` for now; it was intentionally left out after the installer showed a High Snyk risk assessment.

## 13. Repository agent rules

When working in this repository:

1. Read this file before planning substantial work.
2. Inspect existing code before proposing a rewrite or new framework.
3. State assumptions when repository evidence is missing.
4. Work on the currently approved slice only.
5. Do not silently expand scope.
6. Do not add authentication until explicitly approved.
7. Do not invent career evidence.
8. Keep external integrations replaceable through adapters/boundaries.
9. Keep `user_id` in user-owned data even during the single-user prototype.
10. Never commit secrets or expose server/API secrets in client code.
11. Prefer working, testable end-to-end behavior over visual polish during the prototype phase.
12. Before a large refactor, explain the delivery benefit and get approval.
13. Update this context when a product/architecture decision is intentionally changed.

## 14. What NOT to build now

Unless explicitly approved for the current slice, do not implement:

- full authentication/onboarding
- complex multi-user authorization/RLS policy work
- every messaging platform
- autonomous job application submission
- a general-purpose AI agent framework
- elaborate career analytics
- LinkedIn automation
- broad social content generation
- major design-system rewrites
- speculative microservices
- infrastructure complexity that the prototype does not need

## 15. Immediate starting procedure

### Step A — Configure the installed engineering skills

Run `/setup-matt-pocock-skills` once in this repository and ensure its generated repo instructions are visible to Cursor. Keep the configuration simple. Do not let issue-tracker setup block Slice 0.

### Step B — Repository assessment (NO CODE YET)

Use a strong planning model and ask it to:

1. Read this file completely.
2. Inspect the repository.
3. Summarize the existing frontend/backend/data architecture.
4. Identify what is reusable and what is currently missing for Slice 0.
5. Propose the smallest architecture for Slice 0.
6. Propose the minimal database/storage schema for Slice 0, including `user_id`.
7. Define the structured CV extraction schema and validation boundary.
8. List files it would create/change.
9. Identify required secrets/services/packages and why each is needed.
10. Identify the major risks/unknowns.
11. Stop and wait for approval before coding.

### Step C — Review the plan

Reject unnecessary complexity. Confirm that the plan produces the complete Slice 0 happy path rather than disconnected frontend/backend pieces.

### Step D — Implement Slice 0

After approval, implement in small checkpoints and test with a real CV.

Do not move to job discovery until the persisted verified-evidence loop genuinely works.

## 16. Current success ladder

The order matters:

1. **Now:** CV upload -> extraction -> review/edit -> confirm -> persist.
2. Jobs can be ingested and normalized.
3. Zeno can rank/explain jobs against verified evidence.
4. Zeno can tailor a truthful CV for a chosen job.
5. User can track an application.
6. Same actions work through a chat connector.
7. Zeno proactively alerts the user to a strong new match.
8. Productization/polish follows once the loop is stable.

That is the MVP development path unless an explicit decision changes it.
