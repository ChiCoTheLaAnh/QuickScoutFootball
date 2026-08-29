with players as (
  select *
  from {{ ref('stg_players') }}
),

stats as (
  select *
  from {{ ref('stg_player_season_stats') }}
),

current_league_candidates as (
  select
    provider_source,
    {{ normalized_identity('league_provider_id', 'league_name') }} as league_identity,
    league_provider_id,
    league_name,
    normalized_league_name,
    'current_player'::text as candidate_source,
    2 as source_priority
  from players
),

stats_league_candidates as (
  select
    provider_source,
    competition_identity as league_identity,
    competition_provider_id as league_provider_id,
    competition as league_name,
    normalized_competition_name as normalized_league_name,
    'season_stats'::text as candidate_source,
    1 as source_priority
  from stats
),

all_candidates as (
  select * from current_league_candidates
  union all
  select * from stats_league_candidates
),

keyed as (
  select
    {{ entity_key('league', 'provider_source', 'league_identity') }} as league_key,
    *
  from all_candidates
),

ranked as (
  select
    *,
    row_number() over (
      partition by league_key
      order by
        case when league_provider_id is not null then 0 else 1 end,
        case when league_name is not null then 0 else 1 end,
        source_priority,
        coalesce(normalized_league_name, ''),
        league_identity
    ) as candidate_rank
  from keyed
)

select
  league_key,
  provider_source,
  league_identity,
  league_provider_id,
  league_name,
  normalized_league_name,
  candidate_source,
  league_identity = 'unknown' as is_unknown
from ranked
where candidate_rank = 1
