-- Jobs refinement: preference-only plans + Smart Skill Analyser versioning.

alter table public.job_search_profiles
  add column if not exists preference_revision integer not null default 1;

alter table public.job_search_plans
  alter column career_stage_assessment_id drop not null;

alter table public.job_search_plans
  add column if not exists smart_skill_analyser_enabled boolean not null default false;

alter table public.job_search_plans
  add column if not exists preference_revision integer not null default 1;

alter table public.job_search_plans
  add column if not exists profile_revision integer not null default 0;

alter table public.job_search_plans
  add column if not exists plan_revision integer not null default 1;

alter table public.job_search_plans
  add column if not exists generation_status text not null default 'ready';

alter table public.job_search_plans
  drop constraint if exists job_search_plans_generation_status_check;

alter table public.job_search_plans
  add constraint job_search_plans_generation_status_check
  check (generation_status in ('pending', 'ready', 'failed'));
