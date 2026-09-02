-- Indexes for predicates the pages actually filter on
--
-- Cross-checking every page query against the existing indexes turned up four
-- lookups with no matching index. The worst is venue_attendance_stats
-- (migration 0014): it is SECURITY DEFINER, so it counts across ALL users'
-- experiences — `where venue_id = ? and ends_at < now()` — and the only
-- indexes on experiences lead with user_id or audience. Every venue page view
-- was a sequential scan of the whole table, and that table is the one that
-- grows with every confirmed ticket forever.
--
-- All additive; safe to apply any time.

-- venue_attendance_stats + any future venue-scoped read of experiences.
-- Partial: pins that never resolved a venue can't be counted anyway.
create index if not exists experiences_venue_idx
  on public.experiences (venue_id, ends_at)
  where venue_id is not null;

-- Venue page "what's on here" — events is an ingested feed that grows
-- without bound, and its eight existing indexes cover everything but this.
create index if not exists events_venue_starts_idx
  on public.events (venue_id, starts_at)
  where venue_id is not null;

-- Venue page merch rail.
create index if not exists merch_items_venue_idx
  on public.merch_items (venue_id)
  where venue_id is not null;

-- Item page "merch for this gig": the lookup is by wallet_item_id alone, but
-- the only existing index is unique (merch_item_id, wallet_item_id) — wrong
-- leading column, unusable for this query.
create index if not exists merch_gig_links_wallet_item_idx
  on public.merch_gig_links (wallet_item_id);
