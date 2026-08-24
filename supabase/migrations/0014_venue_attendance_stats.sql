-- Venue attendance stats
--
-- A venue page today can only show the viewer their OWN history there, because
-- experiences RLS (correctly) hides other people's pins. But the number a venue
-- manager actually wants — "how many regulars have been here" — is exactly the
-- artefact that turns a consumer app into a conversation with a venue.
--
-- This returns AGGREGATES ONLY: two integers, never rows. Nothing identifies a
-- person, so it leaks nothing the pin-level policies protect.
--
-- Past events only (`ends_at < now()`), which keeps it consistent with the
-- time-shift rule in migration 0002: future attendance is never disclosed
-- beyond a user's inner circle, not even in aggregate. That also matches what
-- a venue cares about — who has actually turned up.
--
-- security definer so it can read across users; `set search_path = public`
-- prevents search-path hijacking, and it is granted to authenticated callers
-- only (not anon).

create or replace function public.venue_attendance_stats(target_venue uuid)
returns table (
  attendees integer,
  gigs_logged integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(distinct e.user_id)::int as attendees,
    count(*)::int                  as gigs_logged
  from public.experiences e
  where e.venue_id = target_venue
    and e.ends_at < now();
$$;

revoke all on function public.venue_attendance_stats(uuid) from public, anon;
grant execute on function public.venue_attendance_stats(uuid) to authenticated;
