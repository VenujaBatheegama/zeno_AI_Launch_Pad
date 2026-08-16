-- Telegram account linking, inbound idempotency, and notification delivery.

alter table public.notification_outbox
  drop constraint if exists notification_outbox_channel_check;
alter table public.notification_outbox
  add constraint notification_outbox_channel_check
  check (channel in ('in_app', 'whatsapp', 'telegram'));

create table public.telegram_user_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id text not null,
  username text,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    opted_out_at is null
    or opted_in_at is null
    or opted_out_at >= opted_in_at
  )
);

create unique index telegram_user_links_chat_id_uidx
  on public.telegram_user_links (chat_id);

drop trigger if exists telegram_user_links_set_updated_at
  on public.telegram_user_links;
create trigger telegram_user_links_set_updated_at
  before update on public.telegram_user_links
  for each row execute function public.set_updated_at();

create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);

create index telegram_link_codes_user_idx
  on public.telegram_link_codes (user_id, created_at desc);
create index telegram_link_codes_expiry_idx
  on public.telegram_link_codes (expires_at)
  where used_at is null;

create table public.telegram_inbound_messages (
  update_id text primary key,
  chat_id text not null,
  received_at timestamptz not null default now()
);

create index telegram_inbound_messages_received_idx
  on public.telegram_inbound_messages (received_at desc);

alter table public.telegram_user_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_inbound_messages enable row level security;

create policy telegram_user_links_select_own
  on public.telegram_user_links
  for select to authenticated using (user_id = auth.uid());
-- Link codes and inbound ids remain service-role only.

create or replace function public.claim_telegram_link_code(
  p_code_hash text,
  p_chat_id text,
  p_username text,
  p_claimed_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing_user_id uuid;
begin
  select user_id
    into v_user_id
    from public.telegram_link_codes
    where code_hash = p_code_hash
      and used_at is null
      and expires_at > p_claimed_at
    for update;

  if v_user_id is null then
    return null;
  end if;

  select user_id
    into v_existing_user_id
    from public.telegram_user_links
    where chat_id = p_chat_id;

  if v_existing_user_id is not null and v_existing_user_id <> v_user_id then
    return null;
  end if;

  insert into public.telegram_user_links (
    user_id,
    chat_id,
    username,
    opted_in_at,
    opted_out_at,
    created_at,
    updated_at
  ) values (
    v_user_id,
    p_chat_id,
    nullif(p_username, ''),
    p_claimed_at,
    null,
    p_claimed_at,
    p_claimed_at
  )
  on conflict (user_id) do update set
    chat_id = excluded.chat_id,
    username = excluded.username,
    opted_in_at = excluded.opted_in_at,
    opted_out_at = null,
    updated_at = excluded.updated_at;

  update public.telegram_link_codes
    set used_at = p_claimed_at
    where user_id = v_user_id
      and used_at is null;

  return v_user_id;
end;
$$;

revoke all on function public.claim_telegram_link_code(
  text,
  text,
  text,
  timestamptz
) from public;
grant execute on function public.claim_telegram_link_code(
  text,
  text,
  text,
  timestamptz
) to service_role;
