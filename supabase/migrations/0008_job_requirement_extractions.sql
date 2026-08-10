-- Shared, description-hash keyed extraction cache for job requirements.
-- Invalid identity: description_hash + schema_version + extraction_policy_version.
-- Model id is stored for observability only and does not affect the unique key.

create table if not exists public.job_requirement_extractions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  description_hash text not null,
  schema_version text not null,
  extraction_policy_version text not null,
  status text not null
    check (status in ('ready', 'insufficient_description')),
  opportunity_band text not null default 'unknown',
  opportunity_confidence text not null default 'low'
    check (opportunity_confidence in ('high', 'medium', 'low')),
  opportunity_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(opportunity_reasons) = 'array'),
  requirements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(requirements) = 'array'),
  warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(warnings) = 'array'),
  model text,
  last_error_category text,
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (description_hash, schema_version, extraction_policy_version)
);

create index if not exists job_requirement_extractions_job_idx
  on public.job_requirement_extractions (job_id);

create index if not exists job_requirement_extractions_updated_idx
  on public.job_requirement_extractions (updated_at desc);
