-- depends_on: {{ ref('stg_players') }}
-- depends_on: {{ ref('stg_player_season_stats') }}
-- depends_on: {{ ref('dim_player') }}
-- depends_on: {{ ref('dim_team') }}
-- depends_on: {{ ref('dim_league') }}
-- depends_on: {{ ref('fact_player_season') }}

with expected(table_schema, table_name, expected_type) as (
  values
    ('analytics_staging', 'stg_players', 'VIEW'),
    ('analytics_staging', 'stg_player_season_stats', 'VIEW'),
    ('analytics_marts', 'dim_player', 'BASE TABLE'),
    ('analytics_marts', 'dim_team', 'BASE TABLE'),
    ('analytics_marts', 'dim_league', 'BASE TABLE'),
    ('analytics_marts', 'fact_player_season', 'BASE TABLE')
),

actual as (
  select table_schema, table_name, table_type
  from information_schema.tables
  where table_schema in ('analytics_staging', 'analytics_marts')
)

select
  expected.table_schema,
  expected.table_name,
  expected.expected_type,
  actual.table_type as actual_type
from expected
left join actual
  on expected.table_schema = actual.table_schema
 and expected.table_name = actual.table_name
where actual.table_name is null
   or actual.table_type <> expected.expected_type
