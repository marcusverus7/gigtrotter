# Migrations waiting to be applied

Five migrations are committed but **not yet applied to production**: 0014
through 0018. `APPLY-ME.sql` in this folder is all five concatenated in order —
paste it into the Supabase SQL editor and run it once.

Nothing here drops a table, a column or a row. 0016 rewrites three counter
columns that are currently wrong.

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
