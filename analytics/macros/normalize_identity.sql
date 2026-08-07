{% macro normalize_text(value_expression) -%}
nullif(
  regexp_replace(
    lower(trim(cast({{ value_expression }} as text))),
    '[[:space:]]+',
    ' ',
    'g'
  ),
  ''
)
{%- endmacro %}

{% macro normalized_identity(provider_id_expression, name_expression) -%}
case
  when nullif(trim(cast({{ provider_id_expression }} as text)), '') is not null
    then 'id:' || {{ normalize_text(provider_id_expression) }}
  when {{ normalize_text(name_expression) }} is not null
    then 'name:' || {{ normalize_text(name_expression) }}
  else 'unknown'
end
{%- endmacro %}

{% macro stats_team_identity(stats_alias, player_alias) -%}
case
  when nullif(trim(cast({{ stats_alias }}.team_provider_id as text)), '') is not null
    then {{ normalized_identity(stats_alias ~ '.team_provider_id', 'null') }}
  else {{ normalized_identity(player_alias ~ '.team_provider_id', player_alias ~ '.team_name') }}
end
{%- endmacro %}
