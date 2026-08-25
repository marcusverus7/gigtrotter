-- Alerts that actually get created
--
-- The alerts table has existed since migration 0004, the nav shows a bell to
-- every user, and the page promises tour announcements, on-sale dates and
-- price drops. Nothing has ever written a row. Three of the four alert kinds
-- need an external events feed we do not have, so that page could only ever be
-- empty — a worse outcome than not having it.
--
-- Two kinds need nothing external, only data the app already holds: the gig in
-- your own wallet that is on tonight, and the friend who has the same gig in
-- theirs. This migration is what those need.

-- ── doors_tonight ──────────────────────────────────────────────────────────
-- Postgres allows ALTER TYPE ... ADD VALUE inside a transaction as long as the
-- new value is not USED in the same transaction. Nothing below inserts an
-- alert, so applying this file in one go is safe.
alter type alert_kind add value if not exists 'doors_tonight';

-- ── idempotent generation ──────────────────────────────────────────────────
-- Alert generation runs whenever the user opens the app, so it has to be safe
-- to run repeatedly: the same gig must not produce a new alert on every
-- navigation. dedupe_key identifies the *thing being alerted about* rather
-- than the alert, and the unique index makes a second attempt a no-op at the
-- database rather than a race in application code.
--
-- Nullable, and the index is partial, so the pre-existing rows and any future
-- alert that genuinely should repeat are unaffected.
alter table public.alerts
  add column if not exists dedupe_key text;

create unique index if not exists alerts_user_dedupe_idx
  on public.alerts (user_id, dedupe_key)
  where dedupe_key is not null;

-- ── generation throttle ────────────────────────────────────────────────────
-- Without this the scan would run on every page navigation. The owner updates
-- their own row through the existing "profiles: update self" policy, so this
-- needs no new grant. (`plan` remains revoked — see migration 0015.)
alter table public.profiles
  add column if not exists last_alert_scan_at timestamptz;
