-- Slice 04: user profiles, onboarding state, and Row Level Security.

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in (
      'not_started',
      'in_progress',
      'awaiting_verification',
      'completed'
    )),
  onboarding_method text
    check (
      onboarding_method is null
      or onboarding_method in ('cv_import', 'conversation', 'manual')
    ),
  onboarding_current_step text,
  onboarding_progress integer not null default 0
    check (onboarding_progress >= 0 and onboarding_progress <= 100),
  onboarding_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(onboarding_state) = 'object'),
  career_profile_verified_at timestamptz,
  career_profile_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profiles_onboarding_status_idx
  on public.user_profiles (onboarding_status, updated_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- RLS: users can only access their own rows.
alter table public.user_profiles enable row level security;
alter table public.cv_documents enable row level security;
alter table public.career_evidence_sets enable row level security;
alter table public.job_search_profiles enable row level security;
alter table public.user_jobs enable row level security;
alter table public.career_stage_assessments enable row level security;
alter table public.job_search_plans enable row level security;
alter table public.candidate_capability_profiles enable row level security;
alter table public.cv_tailoring_variants enable row level security;
alter table public.job_match_analyses enable row level security;

create policy user_profiles_select_own on public.user_profiles
  for select to authenticated
  using (user_id = auth.uid());
create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated
  with check (user_id = auth.uid());
create policy user_profiles_update_own on public.user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy cv_documents_select_own on public.cv_documents
  for select to authenticated using (user_id = auth.uid());
create policy cv_documents_insert_own on public.cv_documents
  for insert to authenticated with check (user_id = auth.uid());
create policy cv_documents_update_own on public.cv_documents
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cv_documents_delete_own on public.cv_documents
  for delete to authenticated using (user_id = auth.uid());

create policy career_evidence_sets_select_own on public.career_evidence_sets
  for select to authenticated using (user_id = auth.uid());
create policy career_evidence_sets_insert_own on public.career_evidence_sets
  for insert to authenticated with check (user_id = auth.uid());
create policy career_evidence_sets_update_own on public.career_evidence_sets
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy career_evidence_sets_delete_own on public.career_evidence_sets
  for delete to authenticated using (user_id = auth.uid());

create policy job_search_profiles_select_own on public.job_search_profiles
  for select to authenticated using (user_id = auth.uid());
create policy job_search_profiles_insert_own on public.job_search_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy job_search_profiles_update_own on public.job_search_profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy job_search_profiles_delete_own on public.job_search_profiles
  for delete to authenticated using (user_id = auth.uid());

create policy user_jobs_select_own on public.user_jobs
  for select to authenticated using (user_id = auth.uid());
create policy user_jobs_insert_own on public.user_jobs
  for insert to authenticated with check (user_id = auth.uid());
create policy user_jobs_update_own on public.user_jobs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_jobs_delete_own on public.user_jobs
  for delete to authenticated using (user_id = auth.uid());

create policy career_stage_assessments_select_own on public.career_stage_assessments
  for select to authenticated using (user_id = auth.uid());
create policy career_stage_assessments_insert_own on public.career_stage_assessments
  for insert to authenticated with check (user_id = auth.uid());
create policy career_stage_assessments_update_own on public.career_stage_assessments
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy job_search_plans_select_own on public.job_search_plans
  for select to authenticated using (user_id = auth.uid());
create policy job_search_plans_insert_own on public.job_search_plans
  for insert to authenticated with check (user_id = auth.uid());
create policy job_search_plans_update_own on public.job_search_plans
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy candidate_capability_profiles_select_own
  on public.candidate_capability_profiles
  for select to authenticated using (user_id = auth.uid());
create policy candidate_capability_profiles_insert_own
  on public.candidate_capability_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy candidate_capability_profiles_update_own
  on public.candidate_capability_profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cv_tailoring_variants_select_own on public.cv_tailoring_variants
  for select to authenticated using (user_id = auth.uid());
create policy cv_tailoring_variants_insert_own on public.cv_tailoring_variants
  for insert to authenticated with check (user_id = auth.uid());
create policy cv_tailoring_variants_update_own on public.cv_tailoring_variants
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cv_tailoring_variants_delete_own on public.cv_tailoring_variants
  for delete to authenticated using (user_id = auth.uid());

create policy job_match_analyses_select_own on public.job_match_analyses
  for select to authenticated using (user_id = auth.uid());
create policy job_match_analyses_insert_own on public.job_match_analyses
  for insert to authenticated with check (user_id = auth.uid());
create policy job_match_analyses_update_own on public.job_match_analyses
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage: private CV objects under {user_id}/...
create policy cv_sources_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cv-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy cv_sources_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cv-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy cv_sources_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cv-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'cv-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy cv_sources_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cv-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
