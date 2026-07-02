-- Event moderation
--
-- User-submitted events must be reviewed before they appear publicly. External
-- feed syncs (songkick / bandsintown / eventbrite / ra) are trusted and default
-- to 'approved'; the manual submit path (submitEvent server action) explicitly
-- sets 'pending', so a random user can no longer publish an event — nor claim
-- promoter powers over one — without review.
--
-- NOTE: this NARROWS the public read policy (not purely additive). Apply and
-- verify this before un-hiding the Events surface (SHOW_UNLAUNCHED in
-- src/components/app-nav.tsx). The events table is currently empty, so applying
-- it has no effect on existing rows.

alter table public.events
  add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));

-- Public read now excludes unapproved events. Promoters still see (and manage)
-- their own submissions — including pending ones — via the existing
-- "events: promoter manages own" policy, so no separate self-visibility clause
-- is needed here.
drop policy if exists "events: public read" on public.events;
create policy "events: public read" on public.events
  for select using (status = 'approved');

create index if not exists events_status_idx on public.events (status);
