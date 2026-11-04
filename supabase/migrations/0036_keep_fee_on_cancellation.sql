-- 0036: booking fee is kept on promoter cancellation (owner decision 2026-11-04)
--
-- 1. request_order_refund_tx refunds the order's FACE value, not the total:
--    the buyer gets every penny the promoter received; the booking fee paid
--    for the platform service and stays with GigTrotter (terms, section 9).
-- 2. refunds.stripe_reversal_id records the explicit transfer reversal the
--    processor now makes for exactly the refunded amount. Stripe's
--    reverse_transfer flag reverses PROPORTIONALLY on a partial refund, which
--    would have left the promoter holding part of a refunded face value.
--
-- Additive: one nullable column, one function replaced with the same signature.

alter table public.refunds add column if not exists stripe_reversal_id text unique;

create or replace function public.request_order_refund_tx(target_order uuid, actor uuid, why text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  voided integer;
  existing uuid;
begin
  select * into o from public.orders where id = target_order for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if o.status <> 'paid' then return jsonb_build_object('error', 'not_paid', 'status', o.status::text); end if;
  if o.stripe_payment_intent_id is null then return jsonb_build_object('error', 'no_payment_intent'); end if;
  if coalesce(o.face_cents, 0) <= 0 then return jsonb_build_object('error', 'nothing_to_refund'); end if;
  select id into existing from public.refunds
   where order_id = o.id and reason in ('promoter_refund', 'operator') and status <> 'failed' limit 1;
  if existing is not null then return jsonb_build_object('already', true, 'refund_id', existing); end if;

  update public.tickets set status = 'refunded' where order_id = o.id and status = 'valid';
  get diagnostics voided = row_count;
  update public.wallet_items w set status = 'archived'
   from public.tickets t where t.wallet_item_id = w.id and t.order_id = o.id and t.status = 'refunded';

  -- Face only: the booking fee (o.fee_cents) is not refunded on cancellation.
  insert into public.refunds (order_id, reason, payment_intent_id, amount_cents, currency, reverse_transfer, requested_by)
  values (o.id, 'operator', o.stripe_payment_intent_id, o.face_cents, o.currency, true, actor)
  returning id into existing;

  insert into public.ops_actions (actor, action, target, detail)
  values (actor, 'refund_order', o.id::text,
          jsonb_build_object('reason', why, 'voided_tickets', voided, 'refund_id', existing,
                             'refunded_cents', o.face_cents, 'fee_kept_cents', o.fee_cents));

  return jsonb_build_object('already', false, 'refund_id', existing, 'voided', voided,
                            'refunded_cents', o.face_cents, 'fee_kept_cents', o.fee_cents);
end;
$$;
revoke all on function public.request_order_refund_tx(uuid, uuid, text) from public, anon, authenticated;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'refunds' and column_name = 'stripe_reversal_id';
--   select prosrc like '%o.face_cents%' from pg_proc where proname = 'request_order_refund_tx';
