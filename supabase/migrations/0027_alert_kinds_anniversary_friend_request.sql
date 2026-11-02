-- ─────────────────────────────────────────────────────────────────────────────
-- 0027 — two more alert kinds
--
-- anniversary     "One year ago tonight" — the On-this-day card promoted to a
--                 real alert, which is what Rail, GigLog and Concert Archives
--                 all lead with.
-- friend_request  A request or an acceptance used to be visible only if the
--                 other person happened to open the People page.
--
-- The generator inserts these in their own upsert, so until this is applied
-- the enum rejects them without touching the other kinds.
-- ─────────────────────────────────────────────────────────────────────────────

alter type alert_kind add value if not exists 'anniversary';
alter type alert_kind add value if not exists 'friend_request';

-- Verify: select unnest(enum_range(null::alert_kind));
