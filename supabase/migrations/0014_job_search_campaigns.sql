-- Multi-campaign job search: Instant Search sessions + many named campaigns per user.
-- Migrates existing Fresh Job Watch rows into one equivalent campaign each.

create table public.job_search_campaigns (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  primary_role text not null,
  location text not null,
  work_mode text not null default 'any'
    check (work_mode in ('onsite', 'hybrid', 'remote', 'any')),
  employment_types text[] not null default '{}',
  experience_levels text[] not null default '{}',
  minimum_score numeric not null default 55
    check (minimum_score between 0 and 100),
  criteria_version integer not null default 1 check (criteria_version >= 1),
  canonical_search_id uuid not null references public.canonical_job_searches(id) on delete restrict,
  last_linkedin_search_at timestamptz,
  next_linkedin_search_at timestamptz,
  last_broad_search_at timestamptz,
  next_broad_search_at timestamptz,
  last_discovery_at timestamptz,
  last_error text,
  initial_alerts_remaining integer not null default 3
    check (initial_alerts_remaining >= 0),
  broad_lease_owner text,
  broad_lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index job_search_campaigns_user_status_idx
  on public.job_search_campaigns (user_id, status, updated_at desc);
create index job_search_campaigns_broad_due_idx
  on public.job_search_campaigns (status, next_broad_search_at, broad_lease_expires_at)
  where archived_at is null;
create index job_search_campaigns_canonical_idx
  on public.job_search_campaigns (canonical_search_id)
  where status = 'active' and archived_at is null;

drop trigger if exists job_search_campaigns_set_updated_at on public.job_search_campaigns;
create trigger job_search_campaigns_set_updated_at
  before update on public.job_search_campaigns
  for each row execute function public.set_updated_at();

insert into public.job_search_campaigns (
  id,
  user_id,
  name,
  status,
  primary_role,
  location,
  work_mode,
  employment_types,
  experience_levels,
  minimum_score,
  criteria_version,
  canonical_search_id,
  last_linkedin_search_at,
  next_linkedin_search_at,
  last_broad_search_at,
  next_broad_search_at,
  last_discovery_at,
  last_error,
  initial_alerts_remaining,
  broad_lease_owner,
  broad_lease_expires_at,
  created_at,
  updated_at,
  archived_at
)
select
  w.id,
  w.user_id,
  left(trim(w.primary_role) || ' — ' || trim(w.location), 80),
  w.status,
  w.primary_role,
  w.location,
  w.work_mode,
  '{}',
  '{}',
  coalesce(w.min_score, 55),
  1,
  w.canonical_search_id,
  s.last_succeeded_at,
  s.next_due_at,
  w.last_broad_search_at,
  w.next_broad_search_at,
  w.last_discovery_at,
  w.last_error,
  w.initial_alerts_remaining,
  w.broad_lease_owner,
  w.broad_lease_expires_at,
  w.created_at,
  w.updated_at,
  null
from public.fresh_job_watches w
join public.canonical_job_searches s on s.id = w.canonical_search_id
on conflict (id) do nothing;

create table public.job_search_campaign_criteria (
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  version integer not null check (version >= 1),
  primary_role text not null,
  location text not null,
  work_mode text not null,
  employment_types text[] not null default '{}',
  experience_levels text[] not null default '{}',
  minimum_score numeric not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, version)
);

insert into public.job_search_campaign_criteria (
  campaign_id, version, primary_role, location, work_mode,
  employment_types, experience_levels, minimum_score, created_at
)
select
  id, 1, primary_role, location, work_mode,
  employment_types, experience_levels, minimum_score, created_at
from public.job_search_campaigns;

create table public.campaign_listing_sightings (
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  discovery_source text not null
    check (discovery_source in ('linkedin_fresh', 'broad_hybrid', 'manual')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  originating_run_id uuid,
  qualification text not null default 'pending'
    check (qualification in ('pending', 'qualifying', 'below_threshold', 'ineligible')),
  primary key (campaign_id, listing_id),
  check (last_seen_at >= first_seen_at)
);

create index campaign_listing_sightings_listing_idx
  on public.campaign_listing_sightings (listing_id);
create index campaign_listing_sightings_new_idx
  on public.campaign_listing_sightings (campaign_id, first_seen_at desc);

create table public.job_search_campaign_runs (
  id uuid primary key,
  campaign_id uuid not null references public.job_search_campaigns(id) on delete cascade,
  origin text not null
    check (origin in ('linkedin_fresh', 'broad_hybrid', 'manual')),
  status text not null
    check (status in ('running', 'completed', 'failed')),
  discovered integer not null default 0,
  analysed integer not null default 0,
  qualifying integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz,
  error text
);

create index job_search_campaign_runs_campaign_idx
  on public.job_search_campaign_runs (campaign_id, started_at desc);

create table public.job_search_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  jobs_found integer not null default 0,
  analysed_count integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index job_search_sessions_user_idx
  on public.job_search_sessions (user_id, started_at desc);

create table public.job_search_session_listings (
  session_id uuid not null references public.job_search_sessions(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  primary key (session_id, listing_id)
);

alter table public.canonical_search_members
  add column if not exists campaign_id uuid references public.job_search_campaigns(id) on delete cascade;

update public.canonical_search_members m
  set campaign_id = m.watch_id
  where m.campaign_id is null
    and exists (select 1 from public.job_search_campaigns c where c.id = m.watch_id);

delete from public.canonical_search_members where campaign_id is null;

alter table public.canonical_search_members
  alter column campaign_id set not null;

alter table public.canonical_search_members
  drop constraint if exists canonical_search_members_pkey;
alter table public.canonical_search_members
  drop constraint if exists canonical_search_members_watch_id_key;

alter table public.canonical_search_members
  add primary key (canonical_search_id, campaign_id);

alter table public.canonical_search_members
  add constraint canonical_search_members_campaign_uidx unique (campaign_id);

alter table public.canonical_search_members
  alter column watch_id drop not null;

alter table public.job_recommendations
  add column if not exists job_search_campaign_id uuid
    references public.job_search_campaigns(id) on delete set null;

create index if not exists job_recommendations_campaign_idx
  on public.job_recommendations (job_search_campaign_id)
  where job_search_campaign_id is not null;

create or replace function public.claim_due_canonical_searches(
  p_now timestamptz,
  p_lease_owner text,
  p_lease_expires_at timestamptz,
  p_limit integer
) returns setof public.canonical_job_searches
language plpgsql
as $$
begin
  return query
  with due as (
    select s.id
    from public.canonical_job_searches s
    where s.next_due_at <= p_now
      and (s.lease_expires_at is null or s.lease_expires_at <= p_now)
      and exists (
        select 1
        from public.canonical_search_members m
        join public.job_search_campaigns c on c.id = m.campaign_id
        where m.canonical_search_id = s.id
          and c.status = 'active'
          and c.archived_at is null
      )
    order by s.next_due_at
    limit p_limit
    for update skip locked
  )
  update public.canonical_job_searches s
    set lease_owner = p_lease_owner,
        lease_expires_at = p_lease_expires_at,
        last_attempted_at = p_now
    from due
    where s.id = due.id
    returning s.*;
end;
$$;

create or replace function public.claim_due_broad_campaigns(
  p_now timestamptz,
  p_lease_owner text,
  p_lease_expires_at timestamptz,
  p_limit integer
) returns setof public.job_search_campaigns
language plpgsql
as $$
begin
  return query
  with due as (
    select c.id
    from public.job_search_campaigns c
    where c.status = 'active'
      and c.archived_at is null
      and c.next_broad_search_at is not null
      and c.next_broad_search_at <= p_now
      and (c.broad_lease_expires_at is null or c.broad_lease_expires_at <= p_now)
    order by c.next_broad_search_at
    limit p_limit
    for update skip locked
  )
  update public.job_search_campaigns c
    set broad_lease_owner = p_lease_owner,
        broad_lease_expires_at = p_lease_expires_at
    from due
    where c.id = due.id
    returning c.*;
end;
$$;

create or replace function public.try_claim_campaign_run_lease(
  p_campaign_id uuid,
  p_now timestamptz,
  p_lease_owner text,
  p_lease_expires_at timestamptz
) returns boolean
language plpgsql
as $$
declare
  v_updated integer;
begin
  update public.job_search_campaigns
    set broad_lease_owner = p_lease_owner,
        broad_lease_expires_at = p_lease_expires_at
    where id = p_campaign_id
      and status = 'active'
      and archived_at is null
      and (broad_lease_expires_at is null or broad_lease_expires_at <= p_now);
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

alter table public.job_search_campaigns enable row level security;
alter table public.job_search_campaign_criteria enable row level security;
alter table public.campaign_listing_sightings enable row level security;
alter table public.job_search_campaign_runs enable row level security;
alter table public.job_search_sessions enable row level security;
alter table public.job_search_session_listings enable row level security;

create policy job_search_campaigns_select_own on public.job_search_campaigns
  for select to authenticated using (user_id = auth.uid());
create policy job_search_campaigns_insert_own on public.job_search_campaigns
  for insert to authenticated with check (user_id = auth.uid());
create policy job_search_campaigns_update_own on public.job_search_campaigns
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy job_search_campaign_criteria_select_own on public.job_search_campaign_criteria
  for select to authenticated using (
    exists (
      select 1 from public.job_search_campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

create policy campaign_listing_sightings_select_own on public.campaign_listing_sightings
  for select to authenticated using (
    exists (
      select 1 from public.job_search_campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

create policy job_search_campaign_runs_select_own on public.job_search_campaign_runs
  for select to authenticated using (
    exists (
      select 1 from public.job_search_campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

create policy job_search_sessions_select_own on public.job_search_sessions
  for select to authenticated using (user_id = auth.uid());
create policy job_search_sessions_insert_own on public.job_search_sessions
  for insert to authenticated with check (user_id = auth.uid());
create policy job_search_sessions_update_own on public.job_search_sessions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy job_search_session_listings_select_own on public.job_search_session_listings
  for select to authenticated using (
    exists (
      select 1 from public.job_search_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
