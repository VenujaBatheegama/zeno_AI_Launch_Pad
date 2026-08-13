-- RETURNS TABLE exposes first_seen_at / published_at as PL/pgSQL variables.
-- Unqualified INSERT...RETURNING first_seen_at then fails with 42702.

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
