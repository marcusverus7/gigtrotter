-- ─────────────────────────────────────────────────────────────────────────────
-- 0024 — trip clustering window
--
-- trip_assemble's look-ahead window was asymmetric with its attach window: a
-- flight on day 0 could see a gig on day 5 and open a trip, but the gig could
-- only attach within 18h of the trip's end — so the flight sat in a one-item
-- trip and the gig in none, which is exactly the "solo flights don't deserve
-- a trip" case the original comment said it avoided.
--
-- Both windows are 7 days now, a trip must contain travel (two gigs a week
-- apart at home are not a trip), wishlist items never cluster, and trips left
-- empty by a deletion or a date edit are dropped. The app now calls this RPC
-- after every wallet insert, date edit and delete rather than only when the
-- Re-cluster button is pressed.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.trip_assemble(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slack interval := interval '18 hours';
  reach interval := interval '7 days';
  item record;
  matched_trip_id uuid;
  cluster_starts timestamptz;
  cluster_ends timestamptz;
begin
  if target_user <> auth.uid() then
    raise exception 'forbidden';
  end if;

  for item in
    select w.id, w.starts_at, w.ends_at, w.kind, w.title
      from wallet_items w
     where w.user_id = target_user
       and w.trip_id is null
       and w.starts_at is not null
       and w.status <> 'wishlist'
       and w.kind in ('flight', 'stay', 'ticket')
     order by w.starts_at asc
  loop
    matched_trip_id := null;

    -- Attach to an existing trip within reach of its end, or overlapping it.
    select t.id, t.starts_at, t.ends_at
      into matched_trip_id, cluster_starts, cluster_ends
      from trips t
     where t.user_id = target_user
       and t.auto_assembled = true
       and item.starts_at <= (t.ends_at + reach)
       and coalesce(item.ends_at, item.starts_at) >= (t.starts_at - slack)
     order by t.starts_at desc
     limit 1;

    if matched_trip_id is not null then
      update trips
         set starts_at = least(starts_at, item.starts_at),
             ends_at = greatest(ends_at, coalesce(item.ends_at, item.starts_at + interval '4 hours'))
       where id = matched_trip_id;

      update wallet_items set trip_id = matched_trip_id where id = item.id;
    else
      -- Open a trip only when there is travel in it: a ticket needs a flight
      -- or stay within reach; a flight or stay needs any other clusterable
      -- item. Two gigs a week apart at home are not a trip.
      if exists (
        select 1 from wallet_items o
         where o.user_id = target_user
           and o.id <> item.id
           and o.starts_at is not null
           and o.status <> 'wishlist'
           and (
             (item.kind = 'ticket' and o.kind in ('flight', 'stay'))
             or (item.kind in ('flight', 'stay') and o.kind in ('flight', 'stay', 'ticket'))
           )
           and o.starts_at between (item.starts_at - reach)
                              and (coalesce(item.ends_at, item.starts_at) + reach)
      ) then
        insert into trips (user_id, title, starts_at, ends_at, auto_assembled)
          values (
            target_user,
            'Trip · ' || to_char(item.starts_at, 'Mon YYYY'),
            item.starts_at,
            coalesce(item.ends_at, item.starts_at + interval '1 day'),
            true
          )
          returning id into matched_trip_id;
        update wallet_items set trip_id = matched_trip_id where id = item.id;
      end if;
    end if;
  end loop;

  -- Trips emptied by deletions or date edits: drop them.
  delete from trips t
   where t.user_id = target_user
     and t.auto_assembled = true
     and not exists (select 1 from wallet_items w where w.trip_id = t.id);
end;
$$;
