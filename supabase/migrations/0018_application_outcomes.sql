-- 0018_application_outcomes.sql
-- Partial index on non-terminal application statuses to keep follow-up and
-- active-pipeline lookups fast as the table scales.

create index if not exists job_applications_active_status_idx
  on public.job_applications (user_id, status, follow_up_due_at)
  where status in ('ready', 'applied', 'interview');
