create table if not exists public.job_search_cache (
    query_hash text primary key,
    created_at timestamp with time zone not null default now(),
    expires_at timestamp with time zone not null,
    search_criteria jsonb not null,
    results jsonb not null
);

create index if not exists idx_job_search_cache_expires_at on public.job_search_cache(expires_at);

alter table public.job_search_cache enable row level security;
create policy "Authenticated users can read job search cache"
  on public.job_search_cache for select to authenticated using (true);
