-- Make (source, external_id) usable as an ON CONFLICT target
--
-- 0008 created events_source_external_idx as a PARTIAL unique index
-- (`where source is not null and external_id is not null`). Postgres only
-- lets ON CONFLICT use a partial index when the statement repeats the
-- predicate, and PostgREST's onConflict cannot express one -- so the feed's
-- first real run failed all 5,501 upserts with "no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- A full (non-partial) unique index does the same job: rows with a NULL
-- external_id (manual submissions) never collide because NULLs are distinct
-- in unique indexes, and the feed's rows always carry both columns.

drop index if exists events_source_external_idx;
create unique index if not exists events_source_external_key
  on public.events (source, external_id);
