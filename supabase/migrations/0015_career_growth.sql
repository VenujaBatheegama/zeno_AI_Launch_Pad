-- Career Growth: campaign-triggered readiness assessment, inbox recommendations,
-- tracked projects, milestones, and contextual conversations.
-- Also adds optional career-development fields to job campaigns.

alter table public.job_search_campaigns
  add column if not exists preferred_technologies text[] not null default '{}',
  add column if not exists target_ready_date date,
  add column if not exists weekly_hours_available integer
    check (weekly_hours_available is null or weekly_hours_available in (2, 5, 8, 10));

alter table public.job_search_campaign_criteria
  add column if not exists preferred_technologies text[] not null default '{}',
  add column if not exists target_ready_date date,
  add column if not exists weekly_hours_available integer
    check (weekly_hours_available is null or weekly_hours_available in (2, 5, 8, 10));

create table public.growth_assessment_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  criteria_fingerprint text not null,
  evidence_version text not null,
  workload_version text not null,
  mode text not null check (mode in ('preliminary', 'market_refined')),
  status text not null check (status in (
    'pending', 'processing', 'completed', 'failed_retryable', 'failed_permanent'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  error_category text,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index growth_assessment_requests_user_campaign_idx
  on public.growth_assessment_requests (user_id, campaign_id, created_at desc);
create index growth_assessment_requests_due_idx
  on public.growth_assessment_requests (status, retry_after, lease_expires_at)
  where status in ('pending', 'processing', 'failed_retryable');

drop trigger if exists growth_assessment_requests_set_updated_at on public.growth_assessment_requests;
create trigger growth_assessment_requests_set_updated_at
  before update on public.growth_assessment_requests
  for each row execute function public.set_updated_at();

create table public.growth_assessments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  request_id uuid not null references public.growth_assessment_requests(id) on delete cascade,
  evidence_version text not null,
  mode text not null check (mode in ('preliminary', 'market_refined')),
  dimensions jsonb not null default '[]'::jsonb,
  highest_priority_gap_key text not null,
  market_sample_size integer not null default 0,
  market_evidence_summary text,
  input_fingerprint text not null,
  workload_snapshot jsonb not null default '{}'::jsonb,
  model text,
  provider text,
  used_model boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index growth_assessments_fingerprint_uidx
  on public.growth_assessments (user_id, input_fingerprint);
create index growth_assessments_campaign_idx
  on public.growth_assessments (user_id, campaign_id, created_at desc);

create table public.growth_recommendations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  assessment_id uuid not null references public.growth_assessments(id) on delete cascade,
  type text not null check (type in (
    'new_project', 'extend_existing_project', 'improve_portfolio',
    'document_existing_work', 'learning_artifact'
  )),
  gap_key text not null,
  title text not null,
  summary text not null,
  rationale text not null default '',
  evidence_gap text not null default '',
  expected_evidence text[] not null default '{}',
  estimated_weeks integer not null check (estimated_weeks between 1 and 12),
  estimated_hours_per_week integer not null check (estimated_hours_per_week between 1 and 20),
  proposed_milestones jsonb not null default '[]'::jsonb,
  supporting_campaign_ids uuid[] not null default '{}',
  market_evidence_summary text,
  status text not null check (status in (
    'pending', 'opened', 'accepted', 'dismissed', 'superseded', 'completed'
  )),
  fingerprint text not null,
  current_proposal jsonb,
  opened_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index growth_recommendations_pending_campaign_uidx
  on public.growth_recommendations (user_id, campaign_id)
  where status in ('pending', 'opened');
create index growth_recommendations_user_idx
  on public.growth_recommendations (user_id, created_at desc);

drop trigger if exists growth_recommendations_set_updated_at on public.growth_recommendations;
create trigger growth_recommendations_set_updated_at
  before update on public.growth_recommendations
  for each row execute function public.set_updated_at();

create table public.growth_suppressions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  gap_key text not null,
  fingerprint text not null,
  criteria_fingerprint text not null,
  evidence_version text not null,
  dismissal_category text,
  dismissed_at timestamptz not null default now()
);

create index growth_suppressions_campaign_idx
  on public.growth_suppressions (user_id, campaign_id, dismissed_at desc);

create table public.growth_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_recommendation_id uuid not null references public.growth_recommendations(id) on delete restrict,
  title text not null,
  objective text not null,
  status text not null check (status in (
    'planned', 'in_progress', 'paused', 'completed', 'abandoned'
  )),
  start_date date not null,
  target_date date not null,
  estimated_hours_per_week integer not null check (estimated_hours_per_week between 1 and 20),
  progress integer not null default 0 check (progress between 0 and 100),
  expected_evidence text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index growth_projects_source_uidx
  on public.growth_projects (source_recommendation_id);
create index growth_projects_user_idx
  on public.growth_projects (user_id, status, updated_at desc);

drop trigger if exists growth_projects_set_updated_at on public.growth_projects;
create trigger growth_projects_set_updated_at
  before update on public.growth_projects
  for each row execute function public.set_updated_at();

create table public.growth_project_campaigns (
  project_id uuid not null references public.growth_projects(id) on delete cascade,
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (project_id, campaign_id)
);

create index growth_project_campaigns_campaign_idx
  on public.growth_project_campaigns (campaign_id, user_id);

create table public.growth_milestones (
  id uuid primary key,
  project_id uuid not null references public.growth_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null,
  description text not null default '',
  estimated_hours integer not null check (estimated_hours between 1 and 80),
  target_date date,
  status text not null check (status in ('todo', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  unique (project_id, position)
);

create index growth_milestones_project_idx
  on public.growth_milestones (project_id, position);

create table public.growth_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.growth_recommendations(id) on delete cascade,
  project_id uuid references public.growth_projects(id) on delete set null,
  objective_snapshot text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index growth_conversations_recommendation_uidx
  on public.growth_conversations (recommendation_id);

drop trigger if exists growth_conversations_set_updated_at on public.growth_conversations;
create trigger growth_conversations_set_updated_at
  before update on public.growth_conversations
  for each row execute function public.set_updated_at();

create table public.growth_messages (
  id uuid primary key,
  conversation_id uuid not null references public.growth_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('assistant', 'user')),
  content text not null,
  created_at timestamptz not null default now()
);

create index growth_messages_conversation_idx
  on public.growth_messages (conversation_id, created_at);

create or replace function public.claim_due_growth_assessments(
  p_now timestamptz,
  p_owner text,
  p_lease_expires_at timestamptz,
  p_limit integer
) returns setof public.growth_assessment_requests
language plpgsql
as $$
begin
  return query
  with due as (
    select r.id
    from public.growth_assessment_requests r
    where (
        r.status in ('pending', 'failed_retryable')
        and (r.retry_after is null or r.retry_after <= p_now)
      )
      or (
        r.status = 'processing'
        and (r.lease_expires_at is null or r.lease_expires_at <= p_now)
      )
    order by r.created_at
    limit p_limit
    for update skip locked
  )
  update public.growth_assessment_requests r
    set status = 'processing',
        lease_owner = p_owner,
        lease_expires_at = p_lease_expires_at,
        attempt_count = r.attempt_count + 1,
        updated_at = p_now
    from due
    where r.id = due.id
    returning r.*;
end;
$$;

alter table public.growth_assessment_requests enable row level security;
alter table public.growth_assessments enable row level security;
alter table public.growth_recommendations enable row level security;
alter table public.growth_suppressions enable row level security;
alter table public.growth_projects enable row level security;
alter table public.growth_project_campaigns enable row level security;
alter table public.growth_milestones enable row level security;
alter table public.growth_conversations enable row level security;
alter table public.growth_messages enable row level security;

create policy growth_assessment_requests_select_own on public.growth_assessment_requests
  for select to authenticated using (user_id = auth.uid());
create policy growth_assessments_select_own on public.growth_assessments
  for select to authenticated using (user_id = auth.uid());
create policy growth_recommendations_select_own on public.growth_recommendations
  for select to authenticated using (user_id = auth.uid());
create policy growth_suppressions_select_own on public.growth_suppressions
  for select to authenticated using (user_id = auth.uid());
create policy growth_projects_select_own on public.growth_projects
  for select to authenticated using (user_id = auth.uid());
create policy growth_project_campaigns_select_own on public.growth_project_campaigns
  for select to authenticated using (user_id = auth.uid());
create policy growth_milestones_select_own on public.growth_milestones
  for select to authenticated using (user_id = auth.uid());
create policy growth_conversations_select_own on public.growth_conversations
  for select to authenticated using (user_id = auth.uid());
create policy growth_messages_select_own on public.growth_messages
  for select to authenticated using (user_id = auth.uid());
