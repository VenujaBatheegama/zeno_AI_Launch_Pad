-- Career Friend: turn market gaps into bounded sprints and retain coaching memory.

create table public.career_sprints (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  growth_action_id uuid references public.campaign_growth_actions(id) on delete set null,
  gap_key text not null,
  gap_label text not null,
  gap_type text not null
    check (gap_type in ('skill', 'evidence', 'visibility', 'qualification')),
  title text not null,
  objective text not null,
  why_now text not null,
  market_signal jsonb not null default '{}'::jsonb
    check (jsonb_typeof(market_signal) = 'object'),
  estimated_hours integer not null default 4
    check (estimated_hours between 1 and 80),
  status text not null default 'active'
    check (status in ('active', 'paused', 'evidence_submitted', 'completed', 'dismissed')),
  evidence_url text,
  evidence_note text
    check (evidence_note is null or char_length(evidence_note) <= 2000),
  evidence_submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index career_sprints_active_gap_uidx
  on public.career_sprints (user_id, gap_key)
  where status in ('active', 'paused', 'evidence_submitted');
create index career_sprints_user_status_idx
  on public.career_sprints (user_id, status, updated_at desc);

drop trigger if exists career_sprints_set_updated_at on public.career_sprints;
create trigger career_sprints_set_updated_at
  before update on public.career_sprints
  for each row execute function public.set_updated_at();

create table public.career_sprint_milestones (
  id uuid primary key,
  sprint_id uuid not null references public.career_sprints(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  position integer not null check (position between 0 and 20),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index career_sprint_milestones_position_uidx
  on public.career_sprint_milestones (sprint_id, position);
create index career_sprint_milestones_user_idx
  on public.career_sprint_milestones (user_id, sprint_id, position);

create table public.career_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Career conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists career_conversations_set_updated_at on public.career_conversations;
create trigger career_conversations_set_updated_at
  before update on public.career_conversations
  for each row execute function public.set_updated_at();

create index career_conversations_user_idx
  on public.career_conversations (user_id, updated_at desc);

create table public.career_messages (
  id uuid primary key,
  conversation_id uuid not null references public.career_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index career_messages_conversation_idx
  on public.career_messages (conversation_id, created_at asc);

alter table public.career_sprints enable row level security;
alter table public.career_sprint_milestones enable row level security;
alter table public.career_conversations enable row level security;
alter table public.career_messages enable row level security;

create policy career_sprints_select_own on public.career_sprints
  for select to authenticated using (user_id = auth.uid());
create policy career_sprints_insert_own on public.career_sprints
  for insert to authenticated with check (user_id = auth.uid());
create policy career_sprints_update_own on public.career_sprints
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy career_sprint_milestones_select_own on public.career_sprint_milestones
  for select to authenticated using (user_id = auth.uid());
create policy career_sprint_milestones_insert_own on public.career_sprint_milestones
  for insert to authenticated with check (user_id = auth.uid());
create policy career_sprint_milestones_update_own on public.career_sprint_milestones
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy career_conversations_select_own on public.career_conversations
  for select to authenticated using (user_id = auth.uid());
create policy career_conversations_insert_own on public.career_conversations
  for insert to authenticated with check (user_id = auth.uid());
create policy career_conversations_update_own on public.career_conversations
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy career_messages_select_own on public.career_messages
  for select to authenticated using (user_id = auth.uid());
create policy career_messages_insert_own on public.career_messages
  for insert to authenticated with check (user_id = auth.uid());
