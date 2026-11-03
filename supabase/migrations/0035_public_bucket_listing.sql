-- ─────────────────────────────────────────────────────────────────────────────
-- 0035 — public buckets no longer listable (Security Advisor, SEC-04 follow-up)
--
-- avatars and discussion-photos are PUBLIC buckets: their files are served
-- from the public object URL (getPublicUrl) without any RLS check, which is
-- how the app reads them. The broad SELECT policies only ever enabled the
-- Storage API's list/metadata reads, i.e. enumerating every object path
-- (user-id folder names) with the anon key. The app has no storage.list()
-- call on either bucket (checked 2026-11-03), so SELECT is narrowed to the
-- owner's own folder. Public URLs keep working unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "avatars storage: read all" on storage.objects;
create policy "avatars storage: owner read" on storage.objects
  for select using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "discussion photos: read all" on storage.objects;
create policy "discussion photos: owner read" on storage.objects
  for select using (
    bucket_id = 'discussion-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Verify: select policyname from pg_policies where tablename = 'objects' and policyname like '%read%';
--         anon POST /storage/v1/object/list/avatars {"prefix":""} -> []
