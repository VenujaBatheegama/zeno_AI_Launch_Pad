-- WhatsApp account linking and inbound webhook idempotency.

create table public.whatsapp_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);

create index whatsapp_link_codes_user_idx
  on public.whatsapp_link_codes (user_id, created_at desc);
create index whatsapp_link_codes_expiry_idx
  on public.whatsapp_link_codes (expires_at)
  where used_at is null;

create table public.whatsapp_inbound_messages (
  message_id text primary key,
  wa_id text not null,
  received_at timestamptz not null default now()
);

create index whatsapp_inbound_messages_received_idx
  on public.whatsapp_inbound_messages (received_at desc);

alter table public.whatsapp_link_codes enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;
-- Both tables are service-role only. Authenticated users use server routes.

create or replace function public.claim_whatsapp_link_code(
  p_code_hash text,
  p_wa_id text,
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
    from public.whatsapp_link_codes
    where code_hash = p_code_hash
      and used_at is null
      and expires_at > p_claimed_at
    for update;

  if v_user_id is null then
    return null;
  end if;

  select user_id
    into v_existing_user_id
    from public.whatsapp_user_links
    where wa_id = p_wa_id;

  if v_existing_user_id is not null and v_existing_user_id <> v_user_id then
    return null;
  end if;

  insert into public.whatsapp_user_links (
    user_id,
    wa_id,
    phone_e164,
    opted_in_at,
    opted_out_at,
    created_at,
    updated_at
  ) values (
    v_user_id,
    p_wa_id,
    p_wa_id,
    p_claimed_at,
    null,
    p_claimed_at,
    p_claimed_at
  )
  on conflict (user_id) do update set
    wa_id = excluded.wa_id,
    phone_e164 = excluded.phone_e164,
    opted_in_at = excluded.opted_in_at,
    opted_out_at = null,
    updated_at = excluded.updated_at;

  update public.whatsapp_link_codes
    set used_at = p_claimed_at
    where user_id = v_user_id
      and used_at is null;

  return v_user_id;
end;
$$;

revoke all on function public.claim_whatsapp_link_code(text, text, timestamptz)
  from public;
grant execute on function public.claim_whatsapp_link_code(text, text, timestamptz)
  to service_role;
