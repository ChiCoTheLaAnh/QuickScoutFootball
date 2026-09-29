-- Hosted dbt run evidence. Application clients only read a sanitized server endpoint.
create table if not exists public.analytics_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  github_run_id text not null,
  github_attempt integer not null check (github_attempt > 0),
  logical_date date not null,
  trigger_kind text not null check (trigger_kind in ('schedule', 'manual')),
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_read_at timestamptz not null,
  source_watermark timestamptz,
  source_counts jsonb not null default '{}'::jsonb,
  mart_counts jsonb,
  metrics jsonb,
  error_code text,
  acceptance_reason text,
  constraint analytics_pipeline_runs_completion_check check (
    (status = 'running' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  ),
  constraint analytics_pipeline_runs_attempt_unique unique (github_run_id, github_attempt)
);

create index if not exists idx_analytics_pipeline_runs_latest
  on public.analytics_pipeline_runs (started_at desc);
create index if not exists idx_analytics_pipeline_runs_accepted
  on public.analytics_pipeline_runs (completed_at desc)
  where status = 'completed';
create index if not exists idx_analytics_pipeline_runs_logical_date
  on public.analytics_pipeline_runs (logical_date, status);

alter table public.analytics_pipeline_runs enable row level security;
revoke all on table public.analytics_pipeline_runs from public, anon, authenticated, service_role;
grant select on table public.analytics_pipeline_runs to service_role;
