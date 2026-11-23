-- Input views are bound to exactly one release by transfermarkt_inventory.py.
create temp table matches as
select distinct game_id, competition_id, cast(date as date) as match_date, home_club_id, away_club_id
from games
where season = '2024' and competition_id in ('GB1','ES1','IT1','L1','FR1')
  and cast(date as date) <= date '2025-06-30';

create temp table match_players as
with records as (
  select distinct a.game_id, a.player_id, a.player_club_id as club_id,
         cast(minutes_played as integer) as minutes, cast(goals as integer) as goals,
         cast(assists as integer) as assists
  from appearances a join matches m using (game_id)
)
select game_id, player_id, min(club_id) as club_id, count(*) > 1 as conflict,
       case when count(*) = 1 and min(minutes) >= 0 then min(minutes) end as minutes,
       case when count(*) = 1 and min(goals) >= 0 then min(goals) end as goals,
       case when count(*) = 1 and min(assists) >= 0 then min(assists) end as assists
from records group by game_id, player_id;

create temp table team_games as
with sides as (
  select game_id, competition_id, home_club_id as club_id from matches
  union all select game_id, competition_id, away_club_id from matches
)
select s.*, count(a.player_id) filter (where a.minutes > 0) as positive_appearances,
       count(a.player_id) filter (where a.minutes is null) as uncertain_appearances
from sides s left join match_players a using (game_id,club_id)
group by all;

create temp table player_snapshot as
with rw_games as (
  select distinct a.player_id, a.game_id from game_lineups l join match_players a
    on a.player_id=l.player_id and a.game_id=l.game_id and a.club_id=l.club_id
  where lower(trim(l.position))='right winger' and a.minutes>0 and not a.conflict
), totals as (
  select a.player_id, count(*) filter (where minutes>0) as appearances_observed,
    sum(minutes) as observed_minutes,
    count(*) filter (where minutes is null) as unknown_minute_rows,
    case when count(goals)=count(*) then sum(goals) end as observed_goals,
    case when count(assists)=count(*) then sum(assists) end as observed_assists,
    count(r.game_id) as observed_rw_games
  from match_players a left join rw_games r using (player_id,game_id) group by a.player_id
), dated as (
  select player_id, cast(date as date) as value_date, cast(market_value_in_eur as bigint) as eur
  from player_valuations where cast(date as date)<=date '2025-06-30'
), prices as (
  select player_id,value_date,
    case when count(eur)=count(*) and min(eur)=max(eur) and min(eur)>0 then min(eur) end as value_eur
  from dated group by player_id,value_date
  qualify row_number() over(partition by player_id order by value_date desc)=1
), profiles as (
  select t.*, p.name,p.sub_position,p.position,cast(p.date_of_birth as date) as birth_date,
    date_part('year',age(date '2025-06-30',cast(p.date_of_birth as date))) as age_years,
    case when observed_rw_games>0 then 'lineup_and_appearance'
      when (select strict from settings) and lower(trim(sub_position))='right winger' then 'historical_profile'
      when (select strict from settings) and lower(trim(sub_position))='left winger' then 'lw_only_observed'
      else 'unresolved' end as rw_evidence,
    v.value_date,v.value_eur, date '2025-06-30'-v.value_date as valuation_age_days
  from totals t left join players p using(player_id) left join prices v using(player_id)
)
select *, case when player_id='148455' then 'target'
  when rw_evidence='lw_only_observed' then 'outside_primary_rw'
  when age_years>25 then 'over_age'
  when rw_evidence='unresolved' then 'unresolved_position'
  when age_years is null or age_years<0 then 'unresolved_age'
  when coalesce(observed_minutes,0)<1200 then 'below_threshold_observed'
  when value_eur is null then 'unverified_price'
  when value_eur>45000000 then 'over_budget'
  else 'eligible' end as status
from profiles;
