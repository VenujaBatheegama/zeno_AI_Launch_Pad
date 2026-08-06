create extension if not exists pgcrypto;

create table public.cv_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  extracted_text text,
  status text not null check (status in ('processing', 'processed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'processed' and extracted_text is not null and error_message is null)
    or (status = 'failed' and error_message is not null)
    or status = 'processing'
  )
);

create table public.career_evidence_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_document_id uuid not null references public.cv_documents(id) on delete restrict,
  schema_version integer not null default 1 check (schema_version = 1),
  status text not null check (status in ('draft', 'verified')),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  extraction_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  check (
    (status = 'verified' and verified_at is not null)
    or (status = 'draft' and verified_at is null)
  )
);

create index cv_documents_user_created_idx
  on public.cv_documents (user_id, created_at desc);

create index career_evidence_sets_user_status_updated_idx
  on public.career_evidence_sets (user_id, status, updated_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-sources',
  'cv-sources',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
