-- Slice 03: evidence-grounded CV tailoring variants and artifacts.

create table public.cv_tailoring_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  listing_id uuid not null,
  job_id text not null,
  job_analysis_id uuid not null references public.job_analyses(id) on delete restrict,
  evidence_set_id uuid not null references public.career_evidence_sets(id) on delete restrict,
  mode text not null check (mode in ('one_page', 'two_page')),
  status text not null check (
    status in (
      'planning',
      'generating',
      'validating',
      'ready_to_render',
      'rendering',
      'ready',
      'failed'
    )
  ),
  recommended_mode text not null check (recommended_mode in ('one_page', 'two_page')),
  recommendation_reason text not null,
  tailoring_context text,
  idempotency_key text not null,
  evidence_fingerprint text not null,
  analysis_fingerprint text not null,
  content_plan_fingerprint text not null,
  policy_version text not null,
  prompt_version text not null,
  model_id text,
  input_tokens integer,
  output_tokens integer,
  repair_count integer not null default 0,
  generation_duration_ms integer,
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  content_plan jsonb not null check (jsonb_typeof(content_plan) = 'object'),
  keyword_audit jsonb not null check (jsonb_typeof(keyword_audit) = 'array'),
  tailored_content jsonb,
  validation_issues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_issues) = 'array'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  artifact_storage_path text,
  artifact_checksum text,
  artifact_page_count integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index cv_tailoring_variants_user_listing_idx
  on public.cv_tailoring_variants (user_id, listing_id, updated_at desc);

create index cv_tailoring_variants_user_status_idx
  on public.cv_tailoring_variants (user_id, status, updated_at desc);
