-- Read-only hosted acceptance audit for API-Football Big Five season 2024.
-- The content checksum is intentionally produced by scripts/audit-api-football.mjs,
-- which sorts stable rows and excludes timestamps before hashing.
with
provider_players as (
  select *
  from public.players
  where provider_source = 'apiFootball'
),
active_provider_players as (
  select *
  from provider_players
  where is_active is true
),
target_facts as (
  select *
  from public.player_season_stats
  where provider_source = 'apiFootball'
    and season = '2024'
),
active_target_facts as (
  select facts.*
  from target_facts as facts
  join active_provider_players as players on players.id = facts.player_id
),
league_counts as (
  select
    coalesce(competition_provider_id, '<null>') as competition_provider_id,
    count(*)::bigint as fact_count,
    case coalesce(competition_provider_id, '<null>')
      when '39' then 1
      when '61' then 2
      when '78' then 3
      when '135' then 4
      when '140' then 5
      else 999
    end as sort_order
  from target_facts
  group by competition_provider_id
),
canonical_duplicate_groups as (
  select provider_source, provider_player_id
  from provider_players
  group by provider_source, provider_player_id
  having count(*) > 1
),
fact_duplicate_groups as (
  select player_id, provider_source, season, competition_provider_id
  from target_facts
  group by player_id, provider_source, season, competition_provider_id
  having count(*) > 1
),
same_name_collision_groups as (
  select normalized_name
  from public.players
  where is_active is true
  group by normalized_name
  having count(distinct (provider_source, provider_player_id)) > 1
),
metrics as (
  select
    (select count(*) from active_provider_players)::bigint as active_provider_identities,
    (select count(*) from active_target_facts)::bigint as active_target_facts,
    (select count(*) from canonical_duplicate_groups)::bigint as canonical_duplicate_groups,
    (select count(*) from fact_duplicate_groups)::bigint as fact_duplicate_groups,
    (
      select count(*)
      from target_facts as facts
      left join public.players as players on players.id = facts.player_id
      where players.id is null
    )::bigint as orphan_facts,
    (
      select count(*)
      from target_facts
      where competition_provider_id is null
        or competition_provider_id not in ('39', '61', '78', '135', '140')
    )::bigint as out_of_scope_facts,
    (
      select count(*)
      from provider_players as players
      where not exists (
        select 1
        from target_facts as facts
        where facts.player_id = players.id
      )
    )::bigint as players_without_target_fact,
    (
      select count(*)
      from active_target_facts
      where appearances > 0 and minutes > 0
    )::bigint as positive_appearance_minute_facts,
    (
      select round(
        100.0 * count(*) filter (where appearances > 0 and minutes > 0)
        / nullif(count(*), 0),
        2
      )
      from active_target_facts
    ) as positive_appearance_minute_pct,
    (
      select count(*)
      from active_provider_players as players
      where exists (
        select 1
        from active_target_facts as facts
        where facts.player_id = players.id and facts.minutes >= 900
      )
    )::bigint as candidates_at_least_900_minutes_no_budget,
    (
      select count(*)
      from active_provider_players
      where market_value_eur is null
    )::bigint as missing_market_value_players,
    (
      select count(*)
      from active_target_facts
      where expected_goals is null
    )::bigint as missing_expected_goals_facts,
    (
      select count(*)
      from active_target_facts
      where expected_assists is null
    )::bigint as missing_expected_assists_facts,
    (select count(*) from same_name_collision_groups)::bigint as same_name_collision_groups
)
select jsonb_build_object(
  'providerSource', 'apiFootball',
  'season', '2024',
  'leagueIds', coalesce((
    select jsonb_agg(competition_provider_id order by sort_order, competition_provider_id)
    from league_counts
  ), '[]'::jsonb),
  'perLeagueFacts', coalesce((
    select jsonb_object_agg(competition_provider_id, fact_count order by sort_order, competition_provider_id)
    from league_counts
  ), '{}'::jsonb),
  'counts', to_jsonb(metrics),
  'checks', jsonb_build_object(
    'exactLeagueSet', (
      select coalesce(array_agg(competition_provider_id order by sort_order, competition_provider_id), '{}')
      from league_counts
    ) = array['39', '61', '78', '135', '140'],
    'minimumProviderIdentities', metrics.active_provider_identities >= 1000,
    'minimumTargetFacts', metrics.active_target_facts >= 1000,
    'zeroCanonicalDuplicates', metrics.canonical_duplicate_groups = 0,
    'zeroFactDuplicates', metrics.fact_duplicate_groups = 0,
    'zeroOrphans', metrics.orphan_facts = 0,
    'zeroOutOfScopeFacts', metrics.out_of_scope_facts = 0,
    'everyProviderPlayerHasTargetFact', metrics.players_without_target_fact = 0,
    'positiveStatsCoverage', coalesce(metrics.positive_appearance_minute_pct >= 95, false),
    'usableCandidateVolume', metrics.candidates_at_least_900_minutes_no_budget >= 500
  )
)
from metrics;
