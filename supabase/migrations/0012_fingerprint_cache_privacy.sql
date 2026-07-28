-- Fingerprint cache privacy fix
--
-- `vendor_fingerprints` was designed to cache a vendor's LAYOUT ("field_map" =
-- where the fields sit on a known template) so a second sighting could skip the
-- vision call. The implementation instead stores the whole ParsedCapture — the
-- extracted VALUES: title, starts_at, destination (venue/city) and details[],
-- which the parser schema documents as carrying things like "seat 12A, gate B27".
--
-- Combined with `for select using (true)`, that made every user's capture data
-- readable by anyone holding the public anon key — which ships in the client
-- bundle, so effectively the whole internet. There was also a replay path: two
-- users uploading byte-identical images (a promoter's PDF mailed to every buyer,
-- a screenshot forwarded in a group chat) share a template_hash, so the second
-- user's capture was populated from the first user's parse.
--
-- Fix: scope the cache per user and make it owner-readable only. The cost
-- optimisation still works where it actually applies — the same user
-- re-uploading the same artefact — and templateHash is a SHA-256 of the exact
-- bytes, so cross-user hits were only ever possible on identical files anyway.
--
-- Safe to apply: the table is empty (verified against production 2026-07-27),
-- so there are no rows to migrate and nothing to back-fill.

alter table public.vendor_fingerprints
  add column if not exists user_id uuid references auth.users on delete cascade;

-- Any pre-existing rows predate user scoping and are unattributable; they are
-- also exactly the leaked data. The table is a regenerable cache, so drop them
-- rather than orphan them with a null owner.
delete from public.vendor_fingerprints where user_id is null;

alter table public.vendor_fingerprints
  alter column user_id set not null;

-- The cache key is now (owner, template) rather than the template alone.
alter table public.vendor_fingerprints
  drop constraint if exists vendor_fingerprints_template_hash_key;
create unique index if not exists vendor_fingerprints_user_template_idx
  on public.vendor_fingerprints (user_id, template_hash);

-- Owner-only reads. Writes remain service-role only (the pipeline runs there).
drop policy if exists "vendor_fingerprints: read all" on public.vendor_fingerprints;
create policy "vendor_fingerprints: owner reads own" on public.vendor_fingerprints
  for select using (auth.uid() = user_id);
