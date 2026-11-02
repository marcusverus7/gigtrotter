-- ─────────────────────────────────────────────────────────────────────────────
-- 0028 — setlists on pins, a want-a-ticket waitlist, and CSV import
--
-- 1) experiences.setlist — the songs played, fetched from setlist.fm the
--    morning after (or when the pin is opened), with the id and the public
--    URL the API's terms ask us to credit. setlist_checked_at stops a pin
--    with no setlist being looked up on every open.
--
-- 2) event_waitlist — "Want one" on a sold-out feed event. Owner-only rows;
--    the public count comes from an aggregate RPC, same pattern as 0026.
--
-- 3) import_source gains 'csv' so a pasted spreadsheet gets an import_jobs
--    row like every other source.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.experiences
  add column if not exists setlist jsonb,
  add column if not exists setlistfm_id text,
  add column if not exists setlist_checked_at timestamptz;

create table if not exists public.event_waitlist (
  user_id    uuid not null references auth.users on delete cascade,
  event_id   uuid not null references public.events on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.event_waitlist enable row level security;

drop policy if exists "event_waitlist: owner only" on public.event_waitlist;
create policy "event_waitlist: owner only" on public.event_waitlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists event_waitlist_event_idx on public.event_waitlist (event_id);

create or replace function public.event_waitlist_count(target_event uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.event_waitlist where event_id = target_event;
$$;

grant execute on function public.event_waitlist_count(uuid) to authenticated, anon;

alter type import_source add value if not exists 'csv';

-- Verify:
--   select column_name from information_schema.columns
--     where table_name = 'experiences' and column_name like 'setlist%';
--   select * from public.event_waitlist_count('<any event id>');
