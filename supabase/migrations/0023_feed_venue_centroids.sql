-- ─────────────────────────────────────────────────────────────────────────────
-- 0023 — feed venue city centroids
--
-- The events feed (upsert.ts, until 2026-09-05) copied each venue's exact
-- coordinates into city_lat/city_lng. Those two columns exist for the
-- anonymous public board, which shows a CITY pin rather than the building —
-- "I was in Manchester", never "I was at this address". Any wallet item at a
-- feed-created venue was therefore un-fuzzed on /b/<handle>. 629 of the 633
-- venue rows were affected. The code is fixed; this backfills them.
--
-- Rows are matched by "city columns equal the venue columns", which is the
-- signature of the bug (the capture path geocodes the city separately, so its
-- rows differ). Cities in the sweep list get the list's centroid; any other
-- city gets NULL — a missing pin is the safe failure, an exact one is not.
-- ─────────────────────────────────────────────────────────────────────────────

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
