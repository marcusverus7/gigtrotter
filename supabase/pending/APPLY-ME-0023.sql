-- ─────────────────────────────────────────────────────────────────────────────
-- 0023 — feed venue centroids + trip clustering window
--
-- 1) The events feed (upsert.ts, until 2026-09-05) copied each venue's exact
--    coordinates into city_lat/city_lng. Those two columns exist for the
--    anonymous public board, which shows a CITY pin rather than the building
--    — "I was in Manchester", never "I was at this address". Any wallet item
--    at a feed-created venue was therefore un-fuzzed on /b/<handle>. The
--    code is fixed; this backfills the rows it wrote.
--
--    Rows are matched by "city columns equal the venue columns", which is the
--    signature of the bug (the capture path geocodes the city separately, so
--    its rows differ). Cities in the sweep list get the list's centroid; any
--    other city gets NULL — a missing pin is the safe failure, an exact one
--    is not.
--
-- 2) trip_assemble's look-ahead window was asymmetric with its attach window:
--    a flight on day 0 could see a gig on day 5 and open a trip, but the gig
--    could only attach within 18h of the trip's end, so the flight sat in a
--    one-item trip and the gig in none. Both windows are now 7 days, a trip
--    must contain travel (a ticket alone does not open one), and wishlist
--    items never cluster.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) venue centroids ───────────────────────────────────────────────────────

update public.venues v
   set city_lat = c.lat,
       city_lng = c.lng
  from (values
    ('london', 51.5074, -0.1278),
    ('manchester', 53.4808, -2.2426),
    ('birmingham', 52.4862, -1.8904),
    ('leeds', 53.8008, -1.5491),
    ('glasgow', 55.8642, -4.2518),
    ('edinburgh', 55.9533, -3.1883),
    ('liverpool', 53.4084, -2.9916),
    ('bristol', 51.4545, -2.5879),
    ('newcastle', 54.9783, -1.6178),
    ('newcastleupontyne', 54.9783, -1.6178),
    ('sheffield', 53.3811, -1.4701),
    ('nottingham', 52.9548, -1.1581),
    ('cardiff', 51.4816, -3.1791),
    ('belfast', 54.5973, -5.9301),
    ('brighton', 50.8225, -0.1372),
    ('leicester', 52.6369, -1.1398),
    ('southampton', 50.9097, -1.4044),
    ('portsmouth', 50.8198, -1.088),
    ('oxford', 51.752, -1.2577),
    ('cambridge', 52.2053, 0.1218),
    ('norwich', 52.6309, 1.2974),
    ('hull', 53.7676, -0.3274),
    ('aberdeen', 57.1497, -2.0943),
    ('dundee', 56.462, -2.9707),
    ('inverness', 57.4778, -4.2247),
    ('swansea', 51.6214, -3.9436),
    ('exeter', 50.7184, -3.5339),
    ('plymouth', 50.3755, -4.1427),
    ('bath', 51.3811, -2.359),
    ('york', 53.9591, -1.0815),
    ('coventry', 52.4068, -1.5197),
    ('derby', 52.9225, -1.4746),
    ('stokeontrent', 53.0027, -2.1794),
    ('middlesbrough', 54.5742, -1.2349),
    ('sunderland', 54.9069, -1.3838),
    ('wolverhampton', 52.5862, -2.1288),
    ('reading', 51.4543, -0.9781),
    ('miltonkeynes', 52.0406, -0.7594),
    ('bournemouth', 50.7192, -1.8808),
    ('dublin', 53.3498, -6.2603),
    ('cork', 51.8985, -8.4756),
    ('galway', 53.2707, -9.0568),
    ('limerick', 52.6638, -8.6267),
    ('derry', 54.9966, -7.3086)
  ) as c(key, lat, lng)
 where v.lat is not null
   and v.city_lat is not distinct from v.lat
   and v.city_lng is not distinct from v.lng
   and lower(regexp_replace(coalesce(v.city, ''), '[^a-zA-Z0-9]', '', 'g')) = c.key;

-- Anything still carrying the venue point in the city columns: null it.
update public.venues
   set city_lat = null,
       city_lng = null
 where lat is not null
   and city_lat is not distinct from lat
   and city_lng is not distinct from lng;

-- ── 2) trip_assemble window ──────────────────────────────────────────────────

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
