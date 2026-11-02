-- ─────────────────────────────────────────────────────────────────────────────
-- 0026 — three policy gaps found by the November 2026 review
--
-- 1) event_interests was `for select using (true)`, and profiles is read-all,
--    so anyone holding the anon key (it ships in the bundle; no session
--    needed) could list "user X is GOING to event Y on date Z" for every
--    future event — exactly the disclosure the experiences time-shift rule
--    exists to prevent. Worse, Add-to-wallet auto-enrolled the user as going.
--    Rows are now visible to their owner and their accepted friends; the
--    public "N going" numbers come from an aggregate RPC instead.
--
-- 2) merch_items / merch_variants / merch_drops let any signed-in user publish
--    to the global store (`seller manages own` is `for all`), and published
--    rows render on LAUNCHED pages — venue, artist and event rails. There is
--    no seller UI, so client writes are revoked; seeding is service-role only.
--
-- 3) The avatars bucket had an INSERT policy but no UPDATE policy, so the
--    second avatar change (upsert: true) was denied.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) event_interests ───────────────────────────────────────────────────────

drop policy if exists "event_interests: public read" on public.event_interests;

create policy "event_interests: own and friends read" on public.event_interests
  for select using (
    auth.uid() = user_id
    or public.are_friends(user_id, auth.uid())
  );

create or replace function public.event_interest_counts(target_event uuid)
returns table (interested bigint, going bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where interest_type = 'interested') as interested,
    count(*) filter (where interest_type = 'going') as going
  from public.event_interests
  where event_id = target_event;
$$;

grant execute on function public.event_interest_counts(uuid) to authenticated, anon;

-- Batch variant for the events grid.
create or replace function public.event_interest_counts_for(target_events uuid[])
returns table (event_id uuid, interested bigint, going bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    event_id,
    count(*) filter (where interest_type = 'interested') as interested,
    count(*) filter (where interest_type = 'going') as going
  from public.event_interests
  where event_id = any(target_events)
  group by event_id;
$$;

grant execute on function public.event_interest_counts_for(uuid[]) to authenticated;

-- ── 2) merch: no client writes until there is a seller flow ──────────────────

revoke insert, update, delete on public.merch_items from authenticated, anon;
revoke insert, update, delete on public.merch_variants from authenticated, anon;
revoke insert, update, delete on public.merch_drops from authenticated, anon;

-- ── 3) avatars: allow replacing your own ─────────────────────────────────────

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Verify:
--   select policyname from pg_policies where tablename = 'event_interests';
--   select privilege_type from information_schema.role_table_grants
--     where table_name = 'merch_items' and grantee = 'authenticated';   -- SELECT only
--   select * from public.event_interest_counts('<any event id>');
