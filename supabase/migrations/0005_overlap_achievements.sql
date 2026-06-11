-- ─────────────────────────────────────────────────────────────────────────────
-- GigTrotter — Who's-going overlap + achievements
--
-- "Who's going" cross-references wallet + wishlist across an accepted friend
-- graph. Bound by the time-shift rule: it only ever returns matches when the
-- viewer is permitted to see the friend's future plans (i.e. they're in the
-- friend's Inner Circle, or the event is past). RLS on experiences handles
-- the past-event case automatically; the wallet path is gated explicitly
-- inside the RPC.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.who_else_going(target_user uuid)
returns table (
  wallet_item_id uuid,
  title text,
  starts_at timestamptz,
  friend_id uuid,
  friend_username text,
  friend_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  -- My future wallet items (going / tonight) — joined against any accepted
  -- friend's wallet items whose normalized title overlaps AND whose owner
  -- has me in their Inner Circle (mutual visibility for unreleased plans).
  with my_items as (
    select w.id, lower(w.title) as ntitle, w.title, w.starts_at, w.venue_id
      from wallet_items w
     where w.user_id = target_user
       and w.status in ('going', 'tonight', 'wishlist')
       and w.starts_at is not null
  ),
  friends_of_me as (
    select case when f.user_a = target_user then f.user_b else f.user_a end as fid
      from friendships f
     where f.state = 'accepted'
       and target_user in (f.user_a, f.user_b)
  ),
  visible_friend_items as (
    select fw.id   as fwid,
           fw.user_id as fuid,
           lower(fw.title) as ntitle,
           fw.title,
           fw.starts_at,
           fw.venue_id
      from wallet_items fw
      join friends_of_me fm on fm.fid = fw.user_id
     where fw.status in ('going', 'tonight', 'wishlist')
       -- Future plans only visible if I'm in friend's Inner Circle.
       and (
         coalesce(fw.ends_at, fw.starts_at) < now()
         or public.in_inner_circle(fw.user_id, target_user)
       )
  )
  select my.id as wallet_item_id,
         my.title,
         my.starts_at,
         vf.fuid as friend_id,
         p.username as friend_username,
         p.display_name as friend_display_name
    from my_items my
    join visible_friend_items vf
      on vf.ntitle = my.ntitle
     and abs(extract(epoch from (vf.starts_at - my.starts_at))) < 86400  -- within a day
    join profiles p on p.id = vf.fuid;
$$;

grant execute on function public.who_else_going(uuid) to authenticated;

-- ── Achievements ───────────────────────────────────────────────────────────
-- Definitional view rather than a table — recomputed on every read. The
-- meaningfulness comes from "earned only via verified pins" (§8.3), so we
-- guard on experiences.verified_by != 'none'.
create or replace view public.achievements as
  with verified as (
    select e.*
      from experiences e
     where e.verified_by <> 'none'
  ),
  gigs as (
    select user_id, count(*)::int as n
      from verified
     where kind = 'ticket'
     group by user_id
  ),
  flights as (
    select user_id, count(*)::int as n
      from verified
     where kind = 'flight'
     group by user_id
  ),
  countries as (
    select v.user_id, count(distinct ven.country)::int as n
      from verified v
      join venues ven on ven.id = v.venue_id
     where ven.country is not null
     group by v.user_id
  )
  select coalesce(g.user_id, f.user_id, c.user_id) as user_id,
         coalesce(g.n, 0) as gig_count,
         coalesce(f.n, 0) as flight_count,
         coalesce(c.n, 0) as country_count
    from gigs g
    full outer join flights f on f.user_id = g.user_id
    full outer join countries c on c.user_id = coalesce(g.user_id, f.user_id);

grant select on public.achievements to authenticated;
