-- Replace Smart Skill Analyser / capability search with ESCO role resolution.

create table if not exists public.esco_role_resolutions (
  id uuid primary key default gen_random_uuid(),
  normalized_role text not null,
  language text not null default 'en',
  occupation_id text,
  preferred_title text,
  selected_search_titles jsonb not null check (jsonb_typeof(selected_search_titles) = 'array'),
  status text not null check (status in ('resolved', 'ambiguous', 'unresolved')),
  resolver_version text not null,
  selection_policy_version text not null,
  resolved_at timestamptz not null default now(),
  unique (normalized_role, language, resolver_version, selection_policy_version)
);

create index if not exists esco_role_resolutions_lookup_idx
  on public.esco_role_resolutions (
    normalized_role,
    language,
    resolver_version,
    selection_policy_version
  );

-- Remap legacy Smart / catalog sources before tightening the check.
update public.planned_job_queries
set source = case
  when source = 'explicit_preference' then 'exact_role'
  when source in ('deterministic_mapping', 'preferred_technology', 'demonstrated_capability', 'exploration', 'alternative_lane')
    then 'esco_alternative'
  else source
end
where source not in ('exact_role', 'esco_preferred', 'esco_alternative');

alter table public.planned_job_queries
  drop constraint if exists planned_job_queries_source_check;

alter table public.planned_job_queries
  add constraint planned_job_queries_source_check
  check (
    source in (
      'exact_role',
      'esco_preferred',
      'esco_alternative'
    )
  );

alter table public.job_search_plans
  drop column if exists smart_skill_analyser_enabled;

drop table if exists public.capability_evidence_signals;
drop table if exists public.candidate_capability_profiles;
