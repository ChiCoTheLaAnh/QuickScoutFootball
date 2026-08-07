{% macro deterministic_key(fields) -%}
md5(
  concat_ws(
    '|',
    {%- for field in fields %}
    coalesce(nullif(trim(cast({{ field }} as text)), ''), '__null__')
    {%- if not loop.last %}, {% endif -%}
    {%- endfor %}
  )
)
{%- endmacro %}

{% macro entity_key(entity_type, provider_source_expression, identity_expression) -%}
{{ deterministic_key(["'" ~ entity_type ~ "'", provider_source_expression, identity_expression]) }}
{%- endmacro %}
