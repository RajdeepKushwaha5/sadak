-- SADAK: stop exposing auth.users through the leaderboard.
--
-- public.leaderboard read auth.users directly and was granted to every
-- signed-in user. Views run with their owner's rights, so any account could
-- query it through the API and get every registered user's id, first name
-- and signup order, including people who never played. Supabase's linter
-- reported it twice: "Exposed Auth Users" and "Security Definer View".
--
-- Ranking everyone does need to read everyone's progress, so some elevated
-- access is unavoidable. This keeps it out of the public API:
--
--   private.leaderboard          the ranking, in a schema the API does not expose
--   private.leaderboard_page()   reads it with elevated rights; returns no user ids
--   public.get_leaderboard()     the only callable entry point; runs as the caller
--
-- Only people who have played appear: the ranking now starts from
-- district_progress, not auth.users.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

drop view if exists public.leaderboard;

create or replace view private.leaderboard as
with per_district as (
  select
    dp.user_id,
    dp.xp,
    dp.cash,
    coalesce(array_length(dp.completed_task_ids, 1), 0) as errands_done,
    case
      when jsonb_array_length(d.task_pack -> 'tasks') > 0
        and coalesce(array_length(dp.completed_task_ids, 1), 0)
          >= jsonb_array_length(d.task_pack -> 'tasks')
      then 1
      else 0
    end as city_completed
  from public.district_progress dp
  join public.districts d on d.id = dp.district_id
),
aggregated as (
  select
    user_id,
    sum(xp)::integer as total_xp,
    sum(cash)::integer as total_cash,
    sum(errands_done)::integer as errands_completed,
    sum(city_completed)::integer as cities_completed
  from per_district
  group by user_id
)
select
  row_number() over (
    order by
      a.total_xp desc,
      a.total_cash desc,
      a.errands_completed desc,
      a.cities_completed desc,
      u.created_at asc
  )::integer as rank,
  a.user_id,
  coalesce(
    nullif(split_part(trim(u.raw_user_meta_data ->> 'full_name'), ' ', 1), ''),
    nullif(split_part(trim(u.raw_user_meta_data ->> 'name'), ' ', 1), ''),
    left(split_part(u.email, '@', 1), 3) || '***'
  ) as display_name,
  a.total_xp,
  a.total_cash,
  a.errands_completed,
  a.cities_completed
from aggregated a
join auth.users u on u.id = a.user_id;

revoke all on private.leaderboard from public, anon, authenticated;

-- One page of the ranking plus the total, as JSON so an empty page still
-- carries the count. `is_me` replaces the user id the client used to find
-- its own row, so no other player's id ever leaves the database.
create or replace function private.leaderboard_page(p_limit integer, p_offset integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from private.leaderboard),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.rank)
      from (
        select
          l.rank,
          l.display_name,
          l.total_xp,
          l.total_cash,
          l.errands_completed,
          l.cities_completed,
          (l.user_id = auth.uid()) as is_me
        from private.leaderboard l
        order by l.rank
        limit least(greatest(coalesce(p_limit, 10), 1), 50)
        offset greatest(coalesce(p_offset, 0), 0)
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.leaderboard_page(integer, integer) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.leaderboard_page(integer, integer) to authenticated;

-- The public entry point runs with the caller's own rights; the only
-- elevated step is the private function above.
create or replace function public.get_leaderboard(p_limit integer default 10, p_offset integer default 0)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.leaderboard_page(p_limit, p_offset);
$$;

revoke all on function public.get_leaderboard(integer, integer) from public, anon;
grant execute on function public.get_leaderboard(integer, integer) to authenticated;
