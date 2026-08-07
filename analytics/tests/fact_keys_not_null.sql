select *
from {{ ref('fact_player_season') }}
where fact_player_season_key is null
   or player_key is null
   or team_key is null
   or league_key is null
