-- Slice 02.1: candidate capability intelligence + preference intent support.

alter table public.planned_job_queries
  drop constraint if exists planned_job_queries_source_check;

alter table public.planned_job_queries
  add constraint planned_job_queries_source_check
  check (
    source in (
      'explicit_preference',
      'deterministic_mapping',
      'preferred_technology',
      'demonstrated_capability',
      'exploration',
      'alternative_lane'
    )
  );

create table public.candidate_capability_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  evidence_set_id uuid not null references public.career_evidence_sets(id) on delete restrict,
  evidence_fingerprint text not null,
  extraction_policy_version text not null,
  aggregation_policy_version text not null,
  status text not null check (status in ('ready', 'stale', 'failed')),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  aggregates jsonb not null check (jsonb_typeof(aggregates) = 'array'),
  directions jsonb not null check (jsonb_typeof(directions) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index candidate_capability_profiles_user_updated_idx
  on public.candidate_capability_profiles (user_id, updated_at desc);

create table public.capability_evidence_signals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_capability_profiles(id) on delete cascade,
  capability_key text not null,
  display_label text not null,
  capability_type text not null check (capability_type in ('technology', 'domain', 'work_type')),
  evidence_ids jsonb not null check (jsonb_typeof(evidence_ids) = 'array'),
  evidence_context text not null,
  depth text not null,
  ownership_signal boolean not null,
  source_quote text,
  rationale text not null,
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  created_at timestamptz not null default now()
);

create index capability_evidence_signals_profile_idx
  on public.capability_evidence_signals (profile_id, capability_key);
