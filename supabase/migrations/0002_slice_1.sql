create table public.job_search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  preferences jsonb not null check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  logo_url text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  title text not null,
  description text,
  location text,
  city text,
  region text,
  country text,
  employment_type text check (
    employment_type is null
    or employment_type in ('full_time', 'part_time', 'contract', 'internship', 'other')
  ),
  work_mode text check (
    work_mode is null or work_mode in ('onsite', 'hybrid', 'remote')
  ),
  experience_level text check (
    experience_level is null
    or experience_level in ('entry', 'mid', 'senior', 'lead', 'executive')
  ),
  salary_min numeric check (salary_min is null or salary_min >= 0),
  salary_max numeric check (salary_max is null or salary_max >= 0),
  salary_currency text,
  salary_period text,
  status text not null default 'active' check (status in ('active', 'closed')),
  closing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    salary_min is null
    or salary_max is null
    or salary_min <= salary_max
  )
);

create table public.job_listings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  job_source_id uuid not null references public.job_sources(id) on delete restrict,
  external_job_id text not null,
  publisher text,
  source_url text,
  application_url text,
  application_is_direct boolean,
  original_title text not null,
  published_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_source_id, external_job_id),
  check (last_seen_at >= first_seen_at)
);

create table public.user_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_listing_id uuid not null references public.job_listings(id) on delete cascade,
  state text not null default 'discovered'
    check (state in ('discovered', 'saved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_listing_id)
);

create or replace function public.upsert_discovered_job(
  p_user_id uuid,
  p_source_key text,
  p_source_name text,
  p_external_job_id text,
  p_organization_name text,
  p_organization_logo_url text,
  p_organization_website_url text,
  p_title text,
  p_description text,
  p_location text,
  p_city text,
  p_region text,
  p_country text,
  p_employment_type text,
  p_work_mode text,
  p_experience_level text,
  p_salary_min numeric,
  p_salary_max numeric,
  p_salary_currency text,
  p_salary_period text,
  p_closing_at timestamptz,
  p_publisher text,
  p_source_url text,
  p_application_url text,
  p_application_is_direct boolean,
  p_published_at timestamptz,
  p_raw_payload jsonb,
  p_seen_at timestamptz
) returns uuid
language plpgsql
as $$
declare
  v_source_id uuid;
  v_organization_id uuid;
  v_candidate_job_id uuid;
  v_job_id uuid;
  v_listing_id uuid;
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

  insert into public.jobs (
    organization_id, title, description, location, city, region, country,
    employment_type, work_mode, experience_level, salary_min, salary_max,
    salary_currency, salary_period, status, closing_at, updated_at
  )
  values (
    v_organization_id, p_title, p_description, p_location, p_city, p_region,
    p_country, p_employment_type, p_work_mode, p_experience_level, p_salary_min,
    p_salary_max, p_salary_currency, p_salary_period, 'active', p_closing_at,
    p_seen_at
  )
  returning id into v_candidate_job_id;

  insert into public.job_listings (
    job_id, job_source_id, external_job_id, publisher, source_url,
    application_url, application_is_direct, original_title, published_at,
    first_seen_at, last_seen_at, raw_payload, updated_at
  )
  values (
    v_candidate_job_id, v_source_id, p_external_job_id, p_publisher,
    p_source_url, p_application_url, p_application_is_direct, p_title,
    p_published_at, p_seen_at, p_seen_at, p_raw_payload, p_seen_at
  )
  on conflict (job_source_id, external_job_id) do nothing
  returning id into v_listing_id;

  if v_listing_id is null then
    delete from public.jobs where id = v_candidate_job_id;

    select id, job_id
      into v_listing_id, v_job_id
      from public.job_listings
      where job_source_id = v_source_id
        and external_job_id = p_external_job_id
      for update;

    update public.jobs set
      organization_id = v_organization_id,
      title = p_title,
      description = p_description,
      location = p_location,
      city = p_city,
      region = p_region,
      country = p_country,
      employment_type = p_employment_type,
      work_mode = p_work_mode,
      experience_level = p_experience_level,
      salary_min = p_salary_min,
      salary_max = p_salary_max,
      salary_currency = p_salary_currency,
      salary_period = p_salary_period,
      status = 'active',
      closing_at = p_closing_at,
      updated_at = p_seen_at
    where id = v_job_id;

    update public.job_listings set
      publisher = p_publisher,
      source_url = p_source_url,
      application_url = p_application_url,
      application_is_direct = p_application_is_direct,
      original_title = p_title,
      published_at = p_published_at,
      last_seen_at = p_seen_at,
      raw_payload = p_raw_payload,
      updated_at = p_seen_at
    where id = v_listing_id;
  end if;

  insert into public.user_jobs (
    user_id, job_listing_id, state, updated_at
  )
  values (p_user_id, v_listing_id, 'discovered', p_seen_at)
  on conflict (user_id, job_listing_id) do nothing;

  return v_listing_id;
end;
$$;

create index job_listings_published_idx
  on public.job_listings (published_at desc nulls last);

create index job_listings_last_seen_idx
  on public.job_listings (last_seen_at desc);

create index jobs_organization_idx
  on public.jobs (organization_id);

create index user_jobs_user_state_updated_idx
  on public.user_jobs (user_id, state, updated_at desc);
