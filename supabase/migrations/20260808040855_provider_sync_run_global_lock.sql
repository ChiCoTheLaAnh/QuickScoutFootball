-- Serialize all API-Football season runs against their shared quota pool.
alter table public.provider_sync_runs
  add column if not exists lock_scope text;

update public.provider_sync_runs
set lock_scope = case
  when target_key like 'apiFootball:2024:%' then 'apiFootball:2024'
  else target_key
end
where lock_scope is null;

do $$
begin
  if exists (
    select 1
    from public.provider_sync_runs
    where status = 'running'
    group by lock_scope
    having count(*) > 1
  ) then
    raise exception 'Cannot add provider sync global lock: multiple running rows share a lock scope';
  end if;
end;
$$;

alter table public.provider_sync_runs
  alter column lock_scope set not null,
  add constraint provider_sync_runs_lock_scope_not_blank
    check (btrim(lock_scope) <> '');

create unique index idx_provider_sync_runs_one_running_per_scope
  on public.provider_sync_runs (lock_scope)
  where status = 'running';

drop function if exists public.claim_provider_sync_run(text, text, text, date, uuid);

create function public.claim_provider_sync_run(
  p_invocation_key text,
  p_run_kind text,
  p_target_key text,
  p_lock_scope text,
  p_utc_date date,
  p_lock_token uuid
)
returns table (
  claimed boolean,
  id uuid,
  invocation_key text,
  run_kind text,
  target_key text,
  lock_scope text,
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
  insert into public.provider_sync_runs as run (
    invocation_key,
    run_kind,
    target_key,
    lock_scope,
    utc_date,
    status,
    lock_token,
    lease_expires_at
  ) values (
    p_invocation_key,
    p_run_kind,
    p_target_key,
    p_lock_scope,
    p_utc_date,
    'running',
    p_lock_token,
    now() + interval '10 minutes'
  )
  on conflict do nothing
  returning run.id into claimed_id;

  if claimed_id is not null then
    return query
    select
      true,
      run.id,
      run.invocation_key,
      run.run_kind,
      run.target_key,
      run.lock_scope,
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
      run.lock_scope,
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
    where run.invocation_key = p_invocation_key
       or (run.lock_scope = p_lock_scope and run.status = 'running')
    order by (run.invocation_key = p_invocation_key) desc, run.started_at desc
    limit 1;
  end if;
end;
$$;

revoke execute on function public.claim_provider_sync_run(text, text, text, text, date, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_provider_sync_run(text, text, text, text, date, uuid)
  to service_role;
