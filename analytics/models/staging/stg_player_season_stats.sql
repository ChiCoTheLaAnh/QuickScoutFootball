with source as (
  select *
  from {{ source('quickscout', 'player_season_stats') }}
),

normalized as (
  select
    id as source_stats_id,
    player_id as source_player_id,
    nullif(trim(provider_stat_id), '') as provider_stat_id,
    nullif(trim(provider_source), '') as provider_source,
    nullif(trim(season), '') as season,
    {{ normalize_text('season') }} as normalized_season,
    nullif(trim(competition), '') as competition,
    {{ normalize_text('competition') }} as normalized_competition_name,
    nullif(trim(competition_provider_id), '') as competition_provider_id,
    nullif(trim(team_provider_id), '') as team_provider_id,
    appearances,
    starts,
    minutes,
    goals,
    assists,
    expected_goals,
    expected_assists,
    shots,
    shots_on_target,
    key_passes,
    pass_accuracy,
    dribbles_completed,
    tackles,
    interceptions,
    aerial_duels_won,
    yellow_cards,
    red_cards,
    clean_sheets,
    goals_conceded,
    saves,
    metadata,
    created_at,
    updated_at
  from source
),

identified as (
  select
    *,
    {{ normalized_identity('competition_provider_id', 'competition') }} as competition_identity
  from normalized
)

select
  *,
  {{ deterministic_key([
    'provider_source',
    'source_player_id',
    'normalized_season',
    'competition_identity'
  ]) }} as stats_grain_key
from identified
