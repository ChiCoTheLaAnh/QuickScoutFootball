-- QuickScout Football MVP schema

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  provider_player_id text not null,
  provider_source text not null default 'seed',
  slug text,
  full_name text not null,
  normalized_name text not null,
  first_name text,
  last_name text,
  birth_date date,
  age integer,
  nationality text,
  primary_position text,
  secondary_positions text[] default '{}',
  team_name text,
  team_provider_id text,
  league_name text,
  league_provider_id text,
  market_value_eur numeric(14,2),
  market_value_last_updated_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_provider_unique unique (provider_source, provider_player_id),
  constraint players_slug_unique unique (slug)
);

create index if not exists idx_players_normalized_name on public.players (normalized_name);
create index if not exists idx_players_primary_position on public.players (primary_position);
create index if not exists idx_players_league_name on public.players (league_name);
create index if not exists idx_players_team on public.players (team_provider_id);
create index if not exists idx_players_market_value on public.players (market_value_eur desc nulls last);
create index if not exists idx_players_age on public.players (age);
create index if not exists idx_players_updated_at on public.players (updated_at desc);

create table if not exists public.player_season_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  provider_stat_id text,
  provider_source text not null default 'seed',
  season text not null,
  competition text,
  competition_provider_id text,
  team_provider_id text,
  appearances integer not null default 0,
  starts integer not null default 0,
  minutes integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  expected_goals numeric(10,3),
  expected_assists numeric(10,3),
  shots integer not null default 0,
  shots_on_target integer not null default 0,
  key_passes integer not null default 0,
  pass_accuracy numeric(5,2),
  dribbles_completed integer not null default 0,
  tackles integer not null default 0,
  interceptions integer not null default 0,
  aerial_duels_won integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  clean_sheets integer,
  goals_conceded integer,
  saves integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_season_stats_player_season_unique unique (player_id, provider_source, season, competition_provider_id)
);

create index if not exists idx_player_season_stats_player_id on public.player_season_stats (player_id);
create index if not exists idx_player_season_stats_season on public.player_season_stats (season);
create index if not exists idx_player_season_stats_competition on public.player_season_stats (competition_provider_id);
create index if not exists idx_player_season_stats_provider on public.player_season_stats (provider_source, provider_stat_id);

create table if not exists public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null,
  provider_source text not null default 'seed',
  requested_by text,
  request_payload jsonb not null default '{}'::jsonb,
  recommendation_count integer not null default 0,
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_runs_run_key_unique unique (run_key)
);

create index if not exists idx_recommendation_runs_status on public.recommendation_runs (status, started_at desc);
create index if not exists idx_recommendation_runs_provider on public.recommendation_runs (provider_source, created_at desc);

create table if not exists public.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  invocation_key text not null,
  run_kind text not null check (run_kind in ('cron', 'manual')),
  target_key text not null,
  lock_scope text not null,
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
  constraint provider_sync_runs_lock_scope_not_blank check (btrim(lock_scope) <> ''),
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
create unique index if not exists idx_provider_sync_runs_one_running_per_scope
  on public.provider_sync_runs (lock_scope)
  where status = 'running';

alter table public.provider_sync_runs enable row level security;
revoke all on table public.provider_sync_runs from public, anon, authenticated, service_role;
grant select, insert, update on table public.provider_sync_runs to service_role;

create or replace function public.claim_provider_sync_run(
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

revoke execute on function public.claim_provider_sync_run(text, text, text, text, date, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_provider_sync_run(text, text, text, text, date, uuid)
  to service_role;
revoke execute on function public.finalize_provider_sync_run(text, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_provider_sync_run(text, uuid, text, jsonb, jsonb)
  to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_players_updated_at on public.players;
create trigger trg_players_updated_at
before update on public.players
for each row execute function public.set_updated_at();

drop trigger if exists trg_player_season_stats_updated_at on public.player_season_stats;
create trigger trg_player_season_stats_updated_at
before update on public.player_season_stats
for each row execute function public.set_updated_at();

drop trigger if exists trg_recommendation_runs_updated_at on public.recommendation_runs;
create trigger trg_recommendation_runs_updated_at
before update on public.recommendation_runs
for each row execute function public.set_updated_at();

drop trigger if exists trg_provider_sync_runs_updated_at on public.provider_sync_runs;
create trigger trg_provider_sync_runs_updated_at
before update on public.provider_sync_runs
for each row execute function public.set_updated_at();
