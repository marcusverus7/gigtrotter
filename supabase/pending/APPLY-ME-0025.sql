-- ─────────────────────────────────────────────────────────────────────────────
-- 0025 — bound follows.name in the database
--
-- `FollowInput` in src/features/follows/actions.ts caps the name at 120
-- characters, but that check only runs in the server action. The Supabase anon
-- key ships inside the client bundle by design, and the row-owner policy on
-- `follows` grants a signed-in user full insert rights — so anyone can POST
-- straight to /rest/v1/follows and store a multi-kilobyte name, bypassing the
-- action entirely.
--
-- Those names are not inert. They are interpolated into a Bandsintown URL path
-- by the nightly sync (a huge path 414s, and the error text lands in
-- feed_sync_runs.notes), and they build the PostgREST array filters behind the
-- events "For you" rail and the tour/on-sale alerts. The sync also draws one
-- global 200-artist budget from a single 1,000-row select, so one account's
-- rows can crowd out everyone else's followed artists.
--
-- The code re-applies the bound as well (dedupeNames skips over-long names);
-- this is the half that holds regardless of which client wrote the row.
--
-- Existing rows are truncated first so the constraint can be added validated.
-- ─────────────────────────────────────────────────────────────────────────────

update public.follows
   set name = left(name, 120)
 where char_length(name) > 120;

alter table public.follows
  drop constraint if exists follows_name_len;

alter table public.follows
  add constraint follows_name_len
  check (char_length(name) between 1 and 120);

-- Same exposure, same shape: wishlist.name feeds the on-sale alert filters.
update public.wishlist
   set name = left(name, 120)
 where char_length(name) > 120;

alter table public.wishlist
  drop constraint if exists wishlist_name_len;

alter table public.wishlist
  add constraint wishlist_name_len
  check (char_length(name) between 1 and 120);
