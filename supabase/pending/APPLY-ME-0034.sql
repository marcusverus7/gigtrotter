-- ─────────────────────────────────────────────────────────────────────────────
-- 0034 — Supabase Security Advisor triage (SEC-04), run on the staging copy
-- of the schema on 2026-11-03 (2 errors, 38 warnings, 4 info).
--
-- Fixed here:
--   * touch_updated_at() had a mutable search_path (trigger function).
--   * offers "parties update" had WITH CHECK (true): a party could re-point an
--     offer at another listing or buyer. The check now mirrors the USING clause.
--   * Trigger functions (handle_new_user, sync_merch_sold, sync_reply_count,
--     touch_updated_at) were executable by anon/authenticated. Triggers run as
--     the table owner, so nothing legitimate calls them through the API.
--
-- Deliberately left, with reasons (recorded in docs/BUILD_COMPLETION_STATUS.md):
--   * spatial_ref_sys without RLS, postgis in schema public, st_estimatedextent:
--     PostGIS-owned objects; the extension cannot move without recreating the
--     geography columns, and the table is read-only reference data.
--   * anon_board, event_interest_counts(_for), event_waitlist_count,
--     tier_availability: public by design (the anonymous board and the public
--     counts); they return aggregates or deliberately public fields only.
--   * are_friends / in_inner_circle: must stay executable by every role because
--     RLS policies evaluate them for anon reads; 0033 made them answer false to
--     anyone who is not a participant.
--   * Public buckets avatars / discussion-photos allow listing: object paths
--     only (user-id prefixes); the files are public by design. Tightening the
--     SELECT policy needs the app's storage.list() call sites checked first.
-- ─────────────────────────────────────────────────────────────────────────────

alter function public.touch_updated_at() set search_path = public;

drop policy if exists "offers: parties update" on public.offers;
create policy "offers: parties update" on public.offers
  for update using (
    buyer_id = auth.uid()
    or exists (select 1 from public.listings l where l.id = offers.listing_id and l.seller_id = auth.uid())
  )
  with check (
    buyer_id = auth.uid()
    or exists (select 1 from public.listings l where l.id = offers.listing_id and l.seller_id = auth.uid())
  );

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_merch_sold() from public, anon, authenticated;
revoke all on function public.sync_reply_count() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- Verify: select proname, proconfig from pg_proc where proname = 'touch_updated_at';  -- {search_path=public}
--         select policyname, with_check from pg_policies where tablename = 'offers' and policyname = 'offers: parties update';
