with staging as (
  select count(*) as row_count
  from {{ ref('stg_player_season_stats') }}
),

fact as (
  select count(*) as row_count
  from {{ ref('fact_player_season') }}
)

select
  staging.row_count as staging_row_count,
  fact.row_count as fact_row_count
from staging
cross join fact
where staging.row_count <> fact.row_count
