select
  fact.fact_player_season_key,
  case when players.player_key is null then 'player' end as missing_player,
  case when teams.team_key is null then 'team' end as missing_team,
  case when leagues.league_key is null then 'league' end as missing_league
from {{ ref('fact_player_season') }} as fact
left join {{ ref('dim_player') }} as players
  on fact.player_key = players.player_key
left join {{ ref('dim_team') }} as teams
  on fact.team_key = teams.team_key
left join {{ ref('dim_league') }} as leagues
  on fact.league_key = leagues.league_key
where players.player_key is null
   or teams.team_key is null
   or leagues.league_key is null
