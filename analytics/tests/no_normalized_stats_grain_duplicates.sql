select
  provider_source,
  source_player_id,
  normalized_season,
  competition_identity,
  count(*) as duplicate_count
from {{ ref('stg_player_season_stats') }}
group by
  provider_source,
  source_player_id,
  normalized_season,
  competition_identity
having count(*) > 1
