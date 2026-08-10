with stats as (
  select *
  from {{ ref('stg_player_season_stats') }}
),

players as (
  select *
  from {{ ref('stg_players') }}
),

fact_rows as (
  select
    {{ deterministic_key([
      "'player-season-competition'",
      'stats.provider_source',
      'stats.source_player_id',
      'stats.normalized_season',
      'stats.competition_identity'
    ]) }} as fact_player_season_key,
    {{ entity_key(
      'player',
      'coalesce(players.provider_source, stats.provider_source)',
      normalized_identity('players.provider_player_id', 'null')
    ) }} as player_key,
    {{ entity_key(
      'team',
      'stats.provider_source',
      stats_team_identity('stats', 'players')
    ) }} as team_key,
    {{ entity_key('league', 'stats.provider_source', 'stats.competition_identity') }} as league_key,
    stats.source_stats_id,
    stats.source_player_id,
    stats.provider_stat_id,
    stats.provider_source,
    stats.season,
    stats.normalized_season,
    stats.competition,
    stats.normalized_competition_name,
    stats.competition_provider_id,
    stats.competition_identity,
    stats.team_provider_id as stats_team_provider_id,
    players.team_provider_id as current_team_provider_id,
    players.team_name as current_team_name,
    stats.appearances,
    stats.starts,
    stats.minutes,
    stats.goals,
    stats.assists,
    stats.expected_goals,
    stats.expected_assists,
    stats.shots,
    stats.shots_on_target,
    stats.key_passes,
    stats.pass_accuracy,
    stats.dribbles_completed,
    stats.tackles,
    stats.interceptions,
    stats.aerial_duels_won,
    stats.yellow_cards,
    stats.red_cards,
    stats.clean_sheets,
    stats.goals_conceded,
    stats.saves,
    stats.metadata,
    stats.created_at,
    stats.updated_at
  from stats
  left join players
    on stats.source_player_id = players.source_player_id
)

select
  fact_rows.*,
  fact_player_season_key as player_season_id
from fact_rows
