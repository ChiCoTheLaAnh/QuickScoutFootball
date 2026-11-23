-- Inventory only. Run against a frozen export or restored snapshot.
-- Counts identify available evidence; they do not establish eligibility.
begin transaction isolation level repeatable read read only;

select provider_source, count(*) as player_identities
from public.players
group by provider_source
order by provider_source;

select s.provider_source, s.season, s.competition_provider_id,
       count(*) as season_rows,
       count(distinct p.provider_player_id) as player_identities,
       count(distinct p.provider_player_id) filter
         (where p.market_value_eur > 0 and p.market_value_last_updated_at is not null)
         as identities_with_positive_dated_value
from public.player_season_stats s
join public.players p on p.id = s.player_id and p.provider_source = s.provider_source
where s.provider_source <> 'seed'
group by s.provider_source, s.season, s.competition_provider_id
order by s.provider_source, s.season, s.competition_provider_id;

commit;
