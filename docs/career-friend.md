# Zeno Career Friend

## Product position

Zeno is not another resume editor. It is a bounded career operating loop:

1. Watch for relevant opportunities.
2. Explain why an opportunity is or is not worth attention.
3. Help the user prepare an evidence-grounded application.
4. Detect requirements repeated across strong matches.
5. Turn a repeated gap into a small Career Sprint.
6. Ask the user for real evidence and require review before profile use.

The market already has strong resume, tracking, and profile-optimization suites. Teal leads with resume analysis and job tracking, Huntr combines tracking with tailored resumes, cover letters, and autofill, Careerflow combines resume tooling, LinkedIn optimization, tracking, and coaching, and LinkedIn itself offers natural-language AI job search. Zeno should therefore compete on the closed loop between live opportunity evidence and career development—not on a longer checklist of document tools.

Primary market references checked in August 2026:

- https://www.tealhq.com/tools/resume-builder
- https://huntr.co/
- https://www.careerflow.ai/
- https://www.linkedin.com/help/linkedin/answer/a6889044

## Agent boundaries

The Career Friend can read a compact snapshot of verified profile evidence, campaign counts, repeated growth signals, and active sprint progress. It can answer career questions and suggest navigation actions.

It cannot:

- invent experience, projects, metrics, skills, or market statistics;
- automatically edit verified career evidence;
- pretend an external action was completed;
- prescribe an expensive qualification from a single job listing;
- make an application decision for the user.

Suggested actions are links that require the user to continue in the relevant workspace. Evidence submitted from a sprint remains separate from the verified career profile until the user reviews it.

## Career Sprint policy

A growth signal is created only when an unsupported requirement repeats across at least two strong job matches. Sprint creation is deterministic and makes no LLM request.

Gap types:

| Type | Meaning | Default response |
| --- | --- | --- |
| Skill | The capability is not supported | Build the smallest useful artifact |
| Evidence | The requirement asks for demonstrated or production experience | Turn an existing example into verifiable proof |
| Visibility | Existing proof needs a public surface | Publish one useful case study or professional post |
| Qualification | Degree, certification, licence, or experience threshold | Validate necessity, cost, and alternatives first |

Each sprint contains three milestones, an estimated effort, the underlying market signal, and an evidence submission step. A user must complete every milestone before evidence can be submitted.

## Token and provider policy

- Fresh LinkedIn checks do not invoke an LLM when zero cards are returned.
- Previously seen provider IDs are discarded before description fetching or analysis.
- Equivalent user watches share a canonical LinkedIn search.
- The broad hybrid campaign keeps its slower cadence; it does not run on every fresh tick.
- Starting or updating a sprint makes zero LLM calls.
- A coaching message makes at most one model call with a compact snapshot and six recent messages.
- Coaching uses plain text rather than structured tool output, avoiding another JSON-schema failure path.
- A shared Groq cooldown is respected across keys. During cooldown, coaching returns deterministic snapshot-based guidance instead of retrying larger models or rotating through keys.

## Scaling notes

The opportunity watcher scales by canonical search rather than by user. A popular `(role, location, work mode, recency)` tuple should be queried once and fanned out to its subscribers. Provider job IDs and canonical listing hashes provide two layers of deduplication. Analysis should remain capped per tick and per user.

Career Sprints and conversations are user-scoped rows protected by RLS. Conversation prompts use counts and short labels, not raw CV documents or complete job descriptions, so prompt size stays bounded as a user's history grows.

Apply `supabase/migrations/0013_career_friend.sql` before enabling the Growth workspace or Ask Zeno in production.
