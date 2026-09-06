# Migration pack

## Pending: 0024 (added 2026-09-05)

`APPLY-ME-0024.sql` is `0024_trip_clustering_window.sql` verbatim — a
`create or replace function` for `trip_assemble`, so it needs the SQL editor.

The attach and look-ahead windows were asymmetric (18h vs 7 days), so a flight
and a gig five days later never shared a trip: the flight sat in a one-item
trip and the gig in none. Both are 7 days now, a trip must contain travel,
wishlist items never cluster, and trips emptied by a deletion or a date edit
are dropped. The app calls this RPC after every wallet insert, date edit and
delete as of 2026-09-05 — the OLD function is safe to keep calling meanwhile
(it still has its 0015 auth guard), it just clusters less well and leaves
empty trips behind.

Verify after running: with a flight and a gig in the same week in one wallet,
press Re-cluster on /app/trips — both should land in one trip.

## Applied 2026-09-05: 0023 (feed venue centroids)

Applied through PostgREST rather than the SQL editor — it is two UPDATEs, no
DDL. 629 of 633 venue rows carried the venue's exact coordinates in
`city_lat`/`city_lng`, the columns the anonymous public board reads for its
city-fuzzed pins, so a wallet item at any feed venue was pinned to the
building on `/b/<handle>`. Sweep-list cities took the list centroid (every
London venue now shares one point); 109 rows whose city is not in the list
were nulled, since a missing pin is the safe failure and an exact one is not.

Verified: `select count(*) from venues where lat is not null and city_lat is
not distinct from lat` returns 0.

## Applied 2026-09-02: 0014 through 0022

Migrations **0014 through 0022 are applied to production** and verified
against the catalogue. This folder is kept as the record of what was run and
how it was checked; `APPLY-ME.sql` is the exact text that was executed
(0020 was run separately afterwards — see below).

**0020 exists because 0015's column revokes did nothing.** Supabase grants
`authenticated`/`anon` table-level UPDATE on every public table, and PostgreSQL
does not let a column-level REVOKE carve an exception out of a table-wide
grant — the statement succeeds and changes nothing. 0020 revokes the table
grant and re-grants every column except the protected one. Check grants by
reading `information_schema.column_privileges`; a migration "succeeding" is not
evidence.

For any future pack: add new files here, and verify with a catalogue query,
not with "Success. No rows returned."
## Do 0015 first

`0015_rpc_auth_guards.sql` closes authorisation holes that are open right now:

- **`on_this_day(target_user)`** is `SECURITY DEFINER` and returns
  `setof experiences` without ever comparing `target_user` to `auth.uid()`.
  RLS does not apply inside a definer function, so any signed-in user can pass
  someone else's id and read their whole pin history — `audience = 'vault'`
  rows, future rows, ratings, reviews and photos included. `profiles` is
  world-readable, so the ids are trivially obtained. This one call defeats the
  time-shift rule the entire privacy model rests on.
- **`who_else_going(target_user)`** has the same shape and returns another
  user's future plans joined to their friends' names.
- **`events: promoter manages own`** is `for all`, so a promoter can set their
  own submission to `status = 'approved'` and skip review entirely.
- **`profiles: update self`** covers the `plan` column, so a user can grant
  themselves Plus.

## What each one does

| Migration | Purpose | Risk |
| --- | --- | --- |
| `0014_venue_attendance_stats` | Adds an aggregate-only RPC so a venue page can show how many regulars have been. Returns two integers, past events only. | None. Purely additive. The venue page already degrades gracefully without it. |
| `0015_rpc_auth_guards` | The four fixes above. | Replaces the `events` promoter policy with four narrower ones. If event submission misbehaves afterwards, that is where to look. |
| `0016_counter_triggers` | Triggers for `discussion_posts.reply_count` and the merch `sold_count` / `total_sold` columns, which nothing has ever written. Backfills all three. | Low. Recomputes counters from their source tables. |
| `0017_alert_generation` | Adds the `doors_tonight` alert kind, a `dedupe_key` so alert generation is idempotent, and a scan timestamp on `profiles`. Until this is applied the Alerts page stays empty — the generator skips quietly rather than erroring. | None. Purely additive. |
| `0018_listing_face_value_provenance` | Records whether a listing's face value was checked against the seller's own ticket or simply declared, so the listing card can say which. | None. Purely additive; existing rows become `declared`, which is what they are. The marketplace is behind `SHOW_UNLAUNCHED` either way. |
| `0019_missing_indexes` | Four indexes for queries the pages actually run — the venue-stats RPC was a sequential scan of the whole experiences table per venue-page view. | None. Purely additive. |

## Checking it worked

After running, these should hold:

```sql
-- Should raise 'forbidden' rather than return rows.
select * from public.on_this_day('00000000-0000-0000-0000-000000000000');

-- Should be denied.
update public.profiles set plan = 'plus' where id = auth.uid();

-- Should return two integers (0, 0 for a venue nobody has been to).
select * from public.venue_attendance_stats('<any venue id>');
```

Run them as an authenticated user, not with the service key — the service role
bypasses everything being tested here.
