create table public.app_debug_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  data jsonb not null default '{}'::jsonb
);

create index app_debug_logs_created_at_idx on public.app_debug_logs (created_at desc);

alter table public.app_debug_logs enable row level security;

create policy app_debug_logs_select_auth on public.app_debug_logs
  for select to authenticated using (true);
