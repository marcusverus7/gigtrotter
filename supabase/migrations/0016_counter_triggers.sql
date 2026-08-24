-- Denormalised counters that nothing ever incremented
--
-- Three columns are read as if they were maintained and were not:
--
--   discussion_posts.reply_count  — the app tried to write it from the client
--     after each reply, but discussion_posts UPDATE is `auth.uid() = author_id`,
--     so the write only landed when you replied to your own post. Every other
--     reply — the normal case — was denied silently and the count stayed put.
--
--   merch_variants.sold_count / merch_drops.total_sold — never written at all,
--     by anything. `placeMerchOrder` gates on `sold_count + qty > stock`, so
--     with the counter pinned at 0 a limited drop can be oversold without
--     limit, and the storefront cheerfully reports "10 of 10 remaining" after
--     the tenth sale.
--
-- Triggers rather than application code: they are atomic under concurrent
-- orders, they cannot be skipped by a future call site, and they are not
-- subject to the caller's RLS.

-- ── discussion reply counts ────────────────────────────────────────────────
create or replace function public.sync_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.discussion_posts p
     set reply_count = (
       select count(*) from public.discussion_replies r
        where r.post_id = p.id and r.is_hidden = false
     )
   where p.id = coalesce(new.post_id, old.post_id);
  return null;
end;
$$;

drop trigger if exists discussion_replies_count on public.discussion_replies;
create trigger discussion_replies_count
  after insert or delete or update of is_hidden on public.discussion_replies
  for each row execute function public.sync_reply_count();

-- Backfill: every count in the table is currently wrong.
update public.discussion_posts p
   set reply_count = (
     select count(*) from public.discussion_replies r
      where r.post_id = p.id and r.is_hidden = false
   );

-- ── merch stock counters ───────────────────────────────────────────────────
-- Counted from merch_order_items rather than incremented, so a cancelled or
-- deleted order releases its stock instead of stranding it.
create or replace function public.sync_merch_sold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant uuid := coalesce(new.variant_id, old.variant_id);
  v_drop    uuid := coalesce(new.drop_id, old.drop_id);
begin
  if v_variant is not null then
    update public.merch_variants v
       set sold_count = (
         select coalesce(sum(i.quantity), 0)
           from public.merch_order_items i
          where i.variant_id = v.id
       )
     where v.id = v_variant;
  end if;

  if v_drop is not null then
    update public.merch_drops d
       set total_sold = (
         select coalesce(sum(i.quantity), 0)
           from public.merch_order_items i
          where i.drop_id = d.id
       )
     where d.id = v_drop;
  end if;

  return null;
end;
$$;

drop trigger if exists merch_order_items_sold on public.merch_order_items;
create trigger merch_order_items_sold
  after insert or delete or update of quantity, variant_id, drop_id
  on public.merch_order_items
  for each row execute function public.sync_merch_sold();

update public.merch_variants v
   set sold_count = (
     select coalesce(sum(i.quantity), 0)
       from public.merch_order_items i
      where i.variant_id = v.id
   );

update public.merch_drops d
   set total_sold = (
     select coalesce(sum(i.quantity), 0)
       from public.merch_order_items i
      where i.drop_id = d.id
   );
