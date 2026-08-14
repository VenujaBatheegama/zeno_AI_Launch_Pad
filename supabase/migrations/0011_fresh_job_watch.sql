-- Fresh Job Watch: canonical LinkedIn searches, watches, sightings, provider health.

alter table public.campaign_runs drop constraint if exists campaign_runs_trigger_check;
alter table public.campaign_runs
  add constraint campaign_runs_trigger_check
  check (trigger in ('manual', 'cron', 'fresh_linkedin', 'broad_watch'));

create table public.canonical_job_searches (
  id uuid primary key,
  canonical_key text not null unique,
  provider text not null default 'linkedin-guest',
  primary_role text not null,
  location text not null,
  work_mode text not null default 'any'
    check (work_mode in ('onsite', 'hybrid', 'remote', 'any')),
  employment_type text,
  recency_strategy text not null default 'fresh-1h',
  next_due_at timestamptz not null,
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  last_result_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(last_result_summary) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index canonical_job_searches_due_idx
  on public.canonical_job_searches (next_due_at, lease_expires_at);

drop trigger if exists canonical_job_searches_set_updated_at on public.canonical_job_searches;
create trigger canonical_job_searches_set_updated_at
  before update on public.canonical_job_searches
  for each row execute function public.set_updated_at();

create table public.fresh_job_watches (
  id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused')),
  primary_role text not null,
  location text not null,
  work_mode text not null default 'any'
    check (work_mode in ('onsite', 'hybrid', 'remote', 'any')),
  min_score numeric,
  canonical_search_id uuid not null references public.canonical_job_searches(id) on delete restrict,
  last_broad_search_at timestamptz,
  next_broad_search_at timestamptz,
  last_discovery_at timestamptz,
  last_error text,
  initial_alerts_remaining integer not null default 3
    check (initial_alerts_remaining >= 0),
  broad_lease_owner text,
  broad_lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fresh_job_watches_broad_due_idx
  on public.fresh_job_watches (status, next_broad_search_at, broad_lease_expires_at);

drop trigger if exists fresh_job_watches_set_updated_at on public.fresh_job_watches;
create trigger fresh_job_watches_set_updated_at
  before update on public.fresh_job_watches
  for each row execute function public.set_updated_at();

create table public.canonical_search_members (
  canonical_search_id uuid not null references public.canonical_job_searches(id) on delete cascade,
  watch_id uuid not null unique references public.fresh_job_watches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attached_at timestamptz not null default now(),
  primary key (canonical_search_id, user_id)
);

create table public.provider_job_sightings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_job_id text not null,
  listing_id uuid references public.job_listings(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null,
  company text,
  location text,
  public_url text,
  published_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  fingerprint text not null,
  unique (provider, provider_job_id),
  check (last_seen_at >= first_seen_at)
);

create index provider_job_sightings_fingerprint_idx
  on public.provider_job_sightings (fingerprint);
create index provider_job_sightings_listing_idx
  on public.provider_job_sightings (listing_id);

create table public.provider_health (
  provider text primary key,
  status text not null default 'ok'
    check (status in ('ok', 'cooldown', 'suspended', 'disabled')),
  cooldown_until timestamptz,
  last_status_code integer,
  last_error text,
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.observe_provider_job(
  p_source_key text,
  p_source_name text,
  p_external_job_id text,
  p_organization_name text,
  p_organization_logo_url text,
  p_organization_website_url text,
  p_title text,
  p_location text,
  p_city text,
  p_region text,
  p_country text,
  p_work_mode text,
  p_publisher text,
  p_source_url text,
  p_application_url text,
  p_published_at timestamptz,
  p_raw_payload jsonb,
  p_fingerprint text,
  p_seen_at timestamptz
) returns table (
  listing_id uuid,
  job_id uuid,
  is_new boolean,
  first_seen_at timestamptz,
  published_at timestamptz
)
language plpgsql
as $$
declare
  v_source_id uuid;
  v_organization_id uuid;
  v_listing_id uuid;
  v_job_id uuid;
  v_is_new boolean := false;
  v_first_seen timestamptz;
  v_published timestamptz;
begin
  insert into public.job_sources (source_key, name, updated_at)
  values (p_source_key, p_source_name, p_seen_at)
  on conflict (source_key) do update
    set name = excluded.name, updated_at = excluded.updated_at
  returning id into v_source_id;

  if p_organization_name is not null then
    insert into public.organizations (
      name, normalized_name, logo_url, website_url, updated_at
    )
    values (
      p_organization_name,
      lower(regexp_replace(trim(p_organization_name), '\s+', ' ', 'g')),
      p_organization_logo_url,
      p_organization_website_url,
      p_seen_at
    )
    on conflict (normalized_name) do update set
      name = excluded.name,
      logo_url = coalesce(excluded.logo_url, organizations.logo_url),
      website_url = coalesce(excluded.website_url, organizations.website_url),
      updated_at = excluded.updated_at
    returning id into v_organization_id;
  end if;

  select jl.id, jl.job_id, jl.first_seen_at, jl.published_at
    into v_listing_id, v_job_id, v_first_seen, v_published
    from public.job_listings jl
    where jl.job_source_id = v_source_id
      and jl.external_job_id = p_external_job_id
    for update;

  if v_listing_id is null then
    insert into public.jobs (
      organization_id, title, location, city, region, country, work_mode, status, updated_at
    )
    values (
      v_organization_id, p_title, p_location, p_city, p_region, p_country,
      p_work_mode, 'active', p_seen_at
    )
    returning id into v_job_id;

    insert into public.job_listings (
      job_id, job_source_id, external_job_id, publisher, source_url,
      application_url, original_title, published_at, first_seen_at, last_seen_at,
      raw_payload, updated_at
    )
    values (
      v_job_id, v_source_id, p_external_job_id, p_publisher, p_source_url,
      p_application_url, p_title, p_published_at, p_seen_at, p_seen_at,
      coalesce(p_raw_payload, '{}'::jsonb), p_seen_at
    )
    returning job_listings.id, job_listings.first_seen_at, job_listings.published_at
      into v_listing_id, v_first_seen, v_published;
    v_is_new := true;
  else
    update public.job_listings
      set last_seen_at = p_seen_at, updated_at = p_seen_at
      where id = v_listing_id;
  end if;

  insert into public.provider_job_sightings (
    provider, provider_job_id, listing_id, job_id, title, company, location,
    public_url, published_at, first_seen_at, last_seen_at, fingerprint
  )
  values (
    p_source_key, p_external_job_id, v_listing_id, v_job_id, p_title,
    p_organization_name, p_location, p_application_url, p_published_at,
    v_first_seen, p_seen_at, p_fingerprint
  )
  on conflict (provider, provider_job_id) do update set
    last_seen_at = excluded.last_seen_at,
    listing_id = coalesce(provider_job_sightings.listing_id, excluded.listing_id),
    job_id = coalesce(provider_job_sightings.job_id, excluded.job_id);

  listing_id := v_listing_id;
  job_id := v_job_id;
  is_new := v_is_new;
  first_seen_at := v_first_seen;
  published_at := v_published;
  return next;
end;
$$;

create or replace function public.attach_user_job(
  p_user_id uuid,
  p_listing_id uuid,
  p_seen_at timestamptz
) returns void
language plpgsql
as $$
begin
  insert into public.user_jobs (user_id, job_listing_id, state, updated_at)
  values (p_user_id, p_listing_id, 'discovered', p_seen_at)
  on conflict (user_id, job_listing_id) do nothing;
end;
$$;

create or replace function public.set_job_description_if_empty(
  p_listing_id uuid,
  p_description text
) returns void
language plpgsql
as $$
begin
  update public.jobs j
    set description = p_description, updated_at = now()
    from public.job_listings jl
    where jl.id = p_listing_id
      and jl.job_id = j.id
      and (j.description is null or char_length(trim(j.description)) < 80);
end;
$$;

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
        join public.fresh_job_watches w on w.id = m.watch_id
        where m.canonical_search_id = s.id
          and w.status = 'active'
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

create or replace function public.claim_due_broad_watches(
  p_now timestamptz,
  p_lease_owner text,
  p_lease_expires_at timestamptz,
  p_limit integer
) returns setof public.fresh_job_watches
language plpgsql
as $$
begin
  return query
  with due as (
    select w.id
    from public.fresh_job_watches w
    where w.status = 'active'
      and w.next_broad_search_at is not null
      and w.next_broad_search_at <= p_now
      and (w.broad_lease_expires_at is null or w.broad_lease_expires_at <= p_now)
    order by w.next_broad_search_at
    limit p_limit
    for update skip locked
  )
  update public.fresh_job_watches w
    set broad_lease_owner = p_lease_owner,
        broad_lease_expires_at = p_lease_expires_at
    from due
    where w.id = due.id
    returning w.*;
end;
$$;

alter table public.canonical_job_searches enable row level security;
alter table public.fresh_job_watches enable row level security;
alter table public.canonical_search_members enable row level security;
alter table public.provider_job_sightings enable row level security;
alter table public.provider_health enable row level security;

create policy fresh_job_watches_select_own on public.fresh_job_watches
  for select to authenticated using (user_id = auth.uid());
create policy fresh_job_watches_insert_own on public.fresh_job_watches
  for insert to authenticated with check (user_id = auth.uid());
create policy fresh_job_watches_update_own on public.fresh_job_watches
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy canonical_search_members_select_own on public.canonical_search_members
  for select to authenticated using (user_id = auth.uid());
