with source as (
  select *
  from {{ source('quickscout', 'players') }}
),

normalized as (
  select
    id as source_player_id,
    nullif(trim(provider_player_id), '') as provider_player_id,
    nullif(trim(provider_source), '') as provider_source,
    nullif(trim(slug), '') as slug,
    nullif(trim(full_name), '') as full_name,
    nullif(trim(normalized_name), '') as source_normalized_name,
    {{ normalize_text('full_name') }} as normalized_full_name,
    nullif(trim(first_name), '') as first_name,
    nullif(trim(last_name), '') as last_name,
    birth_date,
    age,
    nullif(trim(nationality), '') as nationality,
    nullif(trim(primary_position), '') as primary_position,
    secondary_positions,
    nullif(trim(team_name), '') as team_name,
    {{ normalize_text('team_name') }} as normalized_team_name,
    nullif(trim(team_provider_id), '') as team_provider_id,
    nullif(trim(league_name), '') as league_name,
    {{ normalize_text('league_name') }} as normalized_league_name,
    nullif(trim(league_provider_id), '') as league_provider_id,
    market_value_eur,
    market_value_last_updated_at,
    is_active,
    metadata,
    created_at,
    updated_at
  from source
),

identified as (
  select
    *,
    {{ normalized_identity('provider_player_id', 'full_name') }} as player_identity
  from normalized
)

select
  *,
  {{ entity_key('player', 'provider_source', 'player_identity') }} as player_natural_key
from identified
