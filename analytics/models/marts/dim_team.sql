with players as (
  select *
  from {{ ref('stg_players') }}
),

stats as (
  select *
  from {{ ref('stg_player_season_stats') }}
),

current_team_candidates as (
  select
    provider_source,
    {{ normalized_identity('team_provider_id', 'team_name') }} as team_identity,
    team_provider_id,
    team_name,
    normalized_team_name,
    'current_player'::text as candidate_source,
    2 as source_priority
  from players
),

stats_team_candidates as (
  select
    stats.provider_source,
    {{ stats_team_identity('stats', 'players') }} as team_identity,
    case
      when stats.team_provider_id is not null then stats.team_provider_id
      else players.team_provider_id
    end as team_provider_id,
    case
      when stats.team_provider_id is null then players.team_name
      when {{ normalize_text('stats.team_provider_id') }} = {{ normalize_text('players.team_provider_id') }}
        then players.team_name
      else null
    end as team_name,
    case
      when stats.team_provider_id is null then players.normalized_team_name
      when {{ normalize_text('stats.team_provider_id') }} = {{ normalize_text('players.team_provider_id') }}
        then players.normalized_team_name
      else null
    end as normalized_team_name,
    'season_stats'::text as candidate_source,
    1 as source_priority
  from stats
  left join players
    on stats.source_player_id = players.source_player_id
),

all_candidates as (
  select * from current_team_candidates
  union all
  select * from stats_team_candidates
),

keyed as (
  select
    {{ entity_key('team', 'provider_source', 'team_identity') }} as team_key,
    *
  from all_candidates
),

ranked as (
  select
    *,
    row_number() over (
      partition by team_key
      order by
        case when team_provider_id is not null then 0 else 1 end,
        case when team_name is not null then 0 else 1 end,
        source_priority,
        coalesce(normalized_team_name, ''),
        team_identity
    ) as candidate_rank
  from keyed
)

select
  team_key,
  provider_source,
  team_identity,
  team_provider_id,
  team_name,
  normalized_team_name,
  candidate_source,
  team_identity = 'unknown' as is_unknown
from ranked
where candidate_rank = 1
