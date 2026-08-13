-- Proactive career campaign: recommendations, packets, applications, runs, notifications.

-- 1. Recommendations
create table public.job_recommendations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  job_match_analysis_id uuid not null references public.job_match_analyses(id) on delete cascade,
  campaign_run_id uuid,
  status text not null default 'pending_review'
    check (status in (
      'pending_review',
      'saved',
      'accepted',
      'rejected',
      'expired'
    )),
  score_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(score_snapshot) = 'object'),
  fit_summary_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fit_summary_snapshot) = 'object'),
  scoring_policy_version text not null default 'v2',
  decision_reason text
    check (
      decision_reason is null
      or decision_reason in (
        'wrong_technology',
        'wrong_role',
        'wrong_seniority',
        'location',
        'work_mode',
        'salary',
        'company',
        'poor_match',
        'not_interested',
        'other'
      )
    ),
  decision_note text
    check (decision_note is null or char_length(decision_note) <= 500),
  recommended_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_recommendations_user_status_idx
  on public.job_recommendations (user_id, status, recommended_at desc);
create index job_recommendations_listing_idx
  on public.job_recommendations (user_id, listing_id);
create unique index job_recommendations_active_listing_uidx
  on public.job_recommendations (user_id, listing_id)
  where status in ('pending_review', 'saved', 'accepted');
create unique index job_recommendations_analysis_uidx
  on public.job_recommendations (user_id, job_match_analysis_id);

drop trigger if exists job_recommendations_set_updated_at on public.job_recommendations;
create trigger job_recommendations_set_updated_at
  before update on public.job_recommendations
  for each row execute function public.set_updated_at();

-- 2. Application packets
create table public.application_packets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.job_recommendations(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'preparing', 'ready', 'failed')),
  evidence_set_id uuid references public.career_evidence_sets(id) on delete set null,
  evidence_version integer,
  job_match_analysis_id uuid references public.job_match_analyses(id) on delete set null,
  cv_variant_id uuid references public.cv_tailoring_variants(id) on delete set null,
  cover_letter_draft text,
  cover_letter_meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cover_letter_meta) = 'object'),
  application_url text,
  failure_code text,
  failure_message text,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index application_packets_recommendation_uidx
  on public.application_packets (recommendation_id);
create index application_packets_user_status_idx
  on public.application_packets (user_id, status, updated_at desc);

drop trigger if exists application_packets_set_updated_at on public.application_packets;
create trigger application_packets_set_updated_at
  before update on public.application_packets
  for each row execute function public.set_updated_at();

-- 3. Applications
create table public.job_applications (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  recommendation_id uuid not null references public.job_recommendations(id) on delete cascade,
  application_packet_id uuid not null references public.application_packets(id) on delete cascade,
  cv_variant_id uuid references public.cv_tailoring_variants(id) on delete set null,
  status text not null default 'ready'
    check (status in (
      'ready',
      'applied',
      'interview',
      'rejected',
      'offer',
      'withdrawn'
    )),
  applied_at timestamptz,
  follow_up_due_at timestamptz,
  interview_at timestamptz,
  outcome_at timestamptz,
  user_note text
    check (user_note is null or char_length(user_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index job_applications_user_listing_uidx
  on public.job_applications (user_id, listing_id);
create index job_applications_user_status_idx
  on public.job_applications (user_id, status, follow_up_due_at);
create index job_applications_follow_up_due_idx
  on public.job_applications (status, follow_up_due_at)
  where status = 'applied' and follow_up_due_at is not null;

drop trigger if exists job_applications_set_updated_at on public.job_applications;
create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

-- 4. Application events (append-only)
create table public.job_application_events (
  id uuid primary key,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  event_type text not null,
  source text not null
    check (source in ('web', 'whatsapp', 'system')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index job_application_events_idempotency_uidx
  on public.job_application_events (idempotency_key);
create index job_application_events_application_idx
  on public.job_application_events (application_id, occurred_at);

-- 5. Campaign runs
create table public.campaign_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  search_profile_id uuid references public.job_search_profiles(id) on delete set null,
  trigger text not null
    check (trigger in ('manual', 'cron')),
  status text not null default 'queued'
    check (status in (
      'queued',
      'running',
      'completed',
      'partially_failed',
      'failed'
    )),
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  discovered_count integer not null default 0,
  deduplicated_count integer not null default 0,
  analysed_count integer not null default 0,
  recommended_count integer not null default 0,
  failed_count integer not null default 0,
  error_summary text,
  checkpoint jsonb not null default '{}'::jsonb
    check (jsonb_typeof(checkpoint) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index campaign_runs_idempotency_uidx
  on public.campaign_runs (idempotency_key);
create index campaign_runs_user_started_idx
  on public.campaign_runs (user_id, created_at desc);

drop trigger if exists campaign_runs_set_updated_at on public.campaign_runs;
create trigger campaign_runs_set_updated_at
  before update on public.campaign_runs
  for each row execute function public.set_updated_at();

alter table public.job_recommendations
  add constraint job_recommendations_campaign_run_fk
  foreign key (campaign_run_id) references public.campaign_runs(id) on delete set null;

-- 6. Notification outbox
create table public.notification_outbox (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  channel text not null
    check (channel in ('in_app', 'whatsapp')),
  related_entity_type text not null,
  related_entity_id uuid not null,
  status text not null default 'pending'
    check (status in (
      'pending',
      'processing',
      'sent',
      'failed',
      'suppressed'
    )),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index notification_outbox_idempotency_uidx
  on public.notification_outbox (idempotency_key);
create index notification_outbox_pending_idx
  on public.notification_outbox (status, scheduled_at)
  where status in ('pending', 'failed');
create index notification_outbox_user_idx
  on public.notification_outbox (user_id, created_at desc);

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();

-- 7. WhatsApp opt-in mapping (minimal identity)
create table public.whatsapp_user_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wa_id text not null,
  phone_e164 text,
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

create unique index whatsapp_user_links_wa_id_uidx
  on public.whatsapp_user_links (wa_id);

drop trigger if exists whatsapp_user_links_set_updated_at on public.whatsapp_user_links;
create trigger whatsapp_user_links_set_updated_at
  before update on public.whatsapp_user_links
  for each row execute function public.set_updated_at();

-- 8. Campaign feedback signals (explicit rejection → ranking adjustment)
create table public.campaign_feedback_signals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid references public.job_recommendations(id) on delete set null,
  signal_type text not null,
  signal_value text not null,
  weight integer not null default 1,
  created_at timestamptz not null default now()
);

create index campaign_feedback_signals_user_idx
  on public.campaign_feedback_signals (user_id, signal_type, created_at desc);

-- 9. Growth actions from repeated gaps
create table public.campaign_growth_actions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gap_key text not null,
  gap_label text not null,
  frequency integer not null default 0,
  affected_listing_ids uuid[] not null default '{}',
  why_it_matters text not null,
  suggested_action text not null,
  evidence_artifact text not null,
  coverage_impact text not null,
  status text not null default 'active'
    check (status in ('active', 'dismissed', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index campaign_growth_actions_user_gap_uidx
  on public.campaign_growth_actions (user_id, gap_key)
  where status = 'active';
create index campaign_growth_actions_user_idx
  on public.campaign_growth_actions (user_id, created_at desc);

drop trigger if exists campaign_growth_actions_set_updated_at on public.campaign_growth_actions;
create trigger campaign_growth_actions_set_updated_at
  before update on public.campaign_growth_actions
  for each row execute function public.set_updated_at();

-- 10. Cron cursor for batched user enumeration
create table public.campaign_cron_checkpoints (
  id text primary key default 'default',
  cursor_user_id uuid,
  bucket_key text not null,
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.job_recommendations enable row level security;
alter table public.application_packets enable row level security;
alter table public.job_applications enable row level security;
alter table public.job_application_events enable row level security;
alter table public.campaign_runs enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.whatsapp_user_links enable row level security;
alter table public.campaign_feedback_signals enable row level security;
alter table public.campaign_growth_actions enable row level security;
-- campaign_cron_checkpoints is service-role only (no user policies)

create policy job_recommendations_select_own on public.job_recommendations
  for select to authenticated using (user_id = auth.uid());
create policy job_recommendations_insert_own on public.job_recommendations
  for insert to authenticated with check (user_id = auth.uid());
create policy job_recommendations_update_own on public.job_recommendations
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy application_packets_select_own on public.application_packets
  for select to authenticated using (user_id = auth.uid());
create policy application_packets_insert_own on public.application_packets
  for insert to authenticated with check (user_id = auth.uid());
create policy application_packets_update_own on public.application_packets
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy job_applications_select_own on public.job_applications
  for select to authenticated using (user_id = auth.uid());
create policy job_applications_insert_own on public.job_applications
  for insert to authenticated with check (user_id = auth.uid());
create policy job_applications_update_own on public.job_applications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy job_application_events_select_own on public.job_application_events
  for select to authenticated using (user_id = auth.uid());
create policy job_application_events_insert_own on public.job_application_events
  for insert to authenticated with check (user_id = auth.uid());

create policy campaign_runs_select_own on public.campaign_runs
  for select to authenticated using (user_id = auth.uid());
create policy campaign_runs_insert_own on public.campaign_runs
  for insert to authenticated with check (user_id = auth.uid());
create policy campaign_runs_update_own on public.campaign_runs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_outbox_select_own on public.notification_outbox
  for select to authenticated using (user_id = auth.uid());

create policy whatsapp_user_links_select_own on public.whatsapp_user_links
  for select to authenticated using (user_id = auth.uid());
create policy whatsapp_user_links_update_own on public.whatsapp_user_links
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy campaign_feedback_signals_select_own on public.campaign_feedback_signals
  for select to authenticated using (user_id = auth.uid());

create policy campaign_growth_actions_select_own on public.campaign_growth_actions
  for select to authenticated using (user_id = auth.uid());
create policy campaign_growth_actions_update_own on public.campaign_growth_actions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
