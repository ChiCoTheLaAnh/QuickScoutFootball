create table if not exists public.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  invocation_key text not null,
  run_kind text not null check (run_kind in ('cron', 'manual')),
  target_key text not null,
  utc_date date not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  lock_token uuid not null,
  lease_expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_sync_runs_invocation_key_unique unique (invocation_key),
  constraint provider_sync_runs_invocation_key_not_blank check (btrim(invocation_key) <> ''),
  constraint provider_sync_runs_target_key_not_blank check (btrim(target_key) <> ''),
  constraint provider_sync_runs_completion_consistent check (
    (status = 'running' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  )
);

create index if not exists idx_provider_sync_runs_latest
  on public.provider_sync_runs (run_kind, started_at desc);
create index if not exists idx_provider_sync_runs_target
  on public.provider_sync_runs (target_key, started_at desc);
create index if not exists idx_provider_sync_runs_running_lease
  on public.provider_sync_runs (lease_expires_at)
  where status = 'running';

alter table public.provider_sync_runs enable row level security;
revoke all on table public.provider_sync_runs from public, anon, authenticated;
grant select, insert, update on table public.provider_sync_runs to service_role;

create or replace function public.claim_provider_sync_run(
  p_invocation_key text,
  p_run_kind text,
  p_target_key text,
  p_utc_date date,
  p_lock_token uuid
)
returns table (
  claimed boolean,
  id uuid,
  invocation_key text,
  run_kind text,
  target_key text,
  utc_date date,
  status text,
  lock_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  summary jsonb,
  error jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  insert into public.provider_sync_runs (
    invocation_key,
    run_kind,
    target_key,
    utc_date,
    status,
    lock_token,
    lease_expires_at
  ) values (
    p_invocation_key,
    p_run_kind,
    p_target_key,
    p_utc_date,
    'running',
    p_lock_token,
    now() + interval '10 minutes'
  )
  on conflict on constraint provider_sync_runs_invocation_key_unique do nothing
  returning provider_sync_runs.id into claimed_id;

  if claimed_id is not null then
    return query
    select
      true,
      run.id,
      run.invocation_key,
      run.run_kind,
      run.target_key,
      run.utc_date,
      run.status,
      run.lock_token,
      run.lease_expires_at,
      run.started_at,
      run.completed_at,
      run.summary,
      run.error,
      run.created_at,
      run.updated_at
    from public.provider_sync_runs as run
    where run.id = claimed_id;
  else
    return query
    select
      false,
      run.id,
      run.invocation_key,
      run.run_kind,
      run.target_key,
      run.utc_date,
      run.status,
      run.lock_token,
      run.lease_expires_at,
      run.started_at,
      run.completed_at,
      run.summary,
      run.error,
      run.created_at,
      run.updated_at
    from public.provider_sync_runs as run
    where run.invocation_key = p_invocation_key;
  end if;
end;
$$;

create or replace function public.finalize_provider_sync_run(
  p_invocation_key text,
  p_lock_token uuid,
  p_status text,
  p_summary jsonb default null,
  p_error jsonb default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  finalized_id uuid;
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'Provider sync final status must be completed or failed';
  end if;

  update public.provider_sync_runs as run
  set
    status = p_status,
    completed_at = now(),
    summary = p_summary,
    error = p_error,
    updated_at = now()
  where run.invocation_key = p_invocation_key
    and run.lock_token = p_lock_token
    and run.status = 'running'
  returning run.id into finalized_id;

  return finalized_id is not null;
end;
$$;

revoke execute on function public.claim_provider_sync_run(text, text, text, date, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_provider_sync_run(text, text, text, date, uuid)
  to service_role;
revoke execute on function public.finalize_provider_sync_run(text, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_provider_sync_run(text, uuid, text, jsonb, jsonb)
  to service_role;

drop trigger if exists trg_provider_sync_runs_updated_at on public.provider_sync_runs;
create trigger trg_provider_sync_runs_updated_at
before update on public.provider_sync_runs
for each row execute function public.set_updated_at();
