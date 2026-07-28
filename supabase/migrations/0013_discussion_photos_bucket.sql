-- Discussion photos need their own bucket
--
-- `uploadDiscussionPhoto` wrote to the `captures` bucket at
-- `discussions/<userId>/<ts>.<ext>` and returned `getPublicUrl(...)`. Both halves
-- were broken:
--
-- 1. Upload denied. The captures policy requires the FIRST path segment to be
--    the caller's uid — `auth.uid()::text = (storage.foldername(name))[1]` — but
--    that segment was the literal "discussions", so the check could never pass
--    for a user-session client.
-- 2. Dead URL. `captures` is a private bucket (correctly — it holds the
--    encrypted source artefacts), so `getPublicUrl` returns an
--    /object/public/... link that answers 400. Verified against production.
--
-- Discussion photos are social content shown to other attendees, so they belong
-- in a public bucket alongside `avatars`, not in the encrypted-artefact bucket.
-- This mirrors the avatars setup exactly: public read, owner-scoped write, with
-- the uid as the first path segment.
--
-- Not yet user-visible: discussions ship behind SHOW_UNLAUNCHED, so nothing has
-- hit this path in production.

insert into storage.buckets (id, name, public)
values ('discussion-photos', 'discussion-photos', true)
on conflict (id) do nothing;

create policy "discussion photos: read all"
  on storage.objects for select
  using (bucket_id = 'discussion-photos');

create policy "discussion photos: owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'discussion-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "discussion photos: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'discussion-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
