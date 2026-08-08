-- Slice 02: career intelligence, search plans, job analyses, and evidence matches.

create table public.career_stage_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  evidence_set_id uuid not null references public.career_evidence_sets(id) on delete restrict,
  evidence_fingerprint text not null,
  preferences_fingerprint text not null,
  inferred_stage text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  experience_summary jsonb not null check (jsonb_typeof(experience_summary) = 'object'),
  target_opportunity_bands jsonb not null check (jsonb_typeof(target_opportunity_bands) = 'array'),
  stretch_opportunity_bands jsonb not null check (jsonb_typeof(stretch_opportunity_bands) = 'array'),
  unsuitable_bands jsonb not null check (jsonb_typeof(unsuitable_bands) = 'array'),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  preference_overrides jsonb not null check (jsonb_typeof(preference_overrides) = 'array'),
  evidence_ids jsonb not null check (jsonb_typeof(evidence_ids) = 'array'),
  policy_version text not null,
  assessed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index career_stage_assessments_user_created_idx
  on public.career_stage_assessments (user_id, created_at desc);

create table public.job_search_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  career_stage_assessment_id uuid not null
    references public.career_stage_assessments(id) on delete restrict,
  preferences_fingerprint text not null,
  evidence_fingerprint text not null,
  query_budget integer not null check (query_budget >= 1 and query_budget <= 8),
  status text not null check (status in ('draft', 'executed', 'partial', 'failed')),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_search_plans_user_created_idx
  on public.job_search_plans (user_id, created_at desc);

create table public.planned_job_queries (
  id uuid primary key default gen_random_uuid(),
  search_plan_id uuid not null references public.job_search_plans(id) on delete cascade,
  role_family text not null,
  query_text text not null,
  opportunity_band text not null,
  priority integer not null check (priority >= 1),
  reason text not null,
  source text not null check (source in ('explicit_preference', 'deterministic_mapping')),
  execution_status text not null
    check (execution_status in ('pending', 'succeeded', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  unique (search_plan_id, query_text)
);

create index planned_job_queries_plan_priority_idx
  on public.planned_job_queries (search_plan_id, priority);

create table public.job_discovery_query_links (
  id uuid primary key default gen_random_uuid(),
  job_listing_id uuid not null references public.job_listings(id) on delete cascade,
  planned_query_id uuid not null references public.planned_job_queries(id) on delete cascade,
  discovered_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (job_listing_id, planned_query_id)
);

create index job_discovery_query_links_listing_idx
  on public.job_discovery_query_links (job_listing_id);

create table public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  description_fingerprint text not null,
  description_quality text not null
    check (description_quality in ('complete_or_good', 'partial', 'minimal', 'unusable')),
  opportunity_band text not null,
  opportunity_confidence text not null check (opportunity_confidence in ('high', 'medium', 'low')),
  opportunity_reasons jsonb not null check (jsonb_typeof(opportunity_reasons) = 'array'),
  extraction_policy_version text not null,
  status text not null check (status in ('ready', 'not_analysable', 'failed')),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index job_analyses_user_updated_idx
  on public.job_analyses (user_id, updated_at desc);

create table public.job_requirements (
  id uuid primary key,
  job_analysis_id uuid not null references public.job_analyses(id) on delete cascade,
  normalized_statement text not null,
  category text not null,
  importance text not null check (importance in ('required', 'preferred', 'unclear')),
  explicit boolean not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  source_quote text not null,
  quantitative_threshold text,
  created_at timestamptz not null default now()
);

create index job_requirements_analysis_idx
  on public.job_requirements (job_analysis_id);

create table public.job_match_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_analysis_id uuid not null references public.job_analyses(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  career_stage_assessment_id uuid not null
    references public.career_stage_assessments(id) on delete restrict,
  evidence_fingerprint text not null,
  preferences_fingerprint text not null,
  description_fingerprint text not null,
  evidence_fit_score integer not null check (evidence_fit_score >= 0 and evidence_fit_score <= 100),
  career_level text not null,
  hard_constraint_eligible boolean not null,
  hard_constraint_reasons jsonb not null check (jsonb_typeof(hard_constraint_reasons) = 'array'),
  analysis_confidence text not null check (analysis_confidence in ('high', 'medium', 'low')),
  scoring_policy_version text not null,
  matching_policy_version text not null,
  score_breakdown jsonb not null check (jsonb_typeof(score_breakdown) = 'object'),
  explanation text not null,
  status text not null check (status in ('current', 'stale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index job_match_analyses_user_score_idx
  on public.job_match_analyses (user_id, evidence_fit_score desc);

create table public.requirement_matches (
  id uuid primary key default gen_random_uuid(),
  job_match_analysis_id uuid not null references public.job_match_analyses(id) on delete cascade,
  requirement_id uuid not null references public.job_requirements(id) on delete cascade,
  status text not null
    check (status in ('matched', 'partial', 'gap', 'unknown', 'not_applicable')),
  supporting_evidence_ids jsonb not null check (jsonb_typeof(supporting_evidence_ids) = 'array'),
  reason text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  classifier_source text not null check (classifier_source in ('deterministic', 'ai_assisted')),
  created_at timestamptz not null default now(),
  unique (job_match_analysis_id, requirement_id)
);

create index requirement_matches_analysis_idx
  on public.requirement_matches (job_match_analysis_id);
