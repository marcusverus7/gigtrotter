"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/admin";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/server";
import {
  issueForOrder,
  processRefunds,
  reconcilePendingOrders,
  reconcileUnfulfilledPaid,
} from "@/lib/tickets/fulfil";

/**
 * Operator recovery (PAY-05). Every action is admin-only, idempotent (it
 * re-runs the same database/Stripe steps the automatic path uses, nothing
 * bespoke) and audited in ops_actions. Nothing here bypasses the ledger: a
 * refund is requested, then performed by processRefunds with its key.
 */

async function audit(action: string, target: string, detail: Record<string, unknown> = {}) {
  const admin = await requireAdmin();
  const service = createServiceClient();
  await service.from("ops_actions").insert({ actor: admin.id, action, target, detail } as never);
  return { admin, service };
}

export async function opsRetryFulfilment(orderId: string) {
  const { service } = await audit("retry_fulfilment", orderId);
  const r = await issueForOrder(orderId, { service });
  revalidatePath("/app/admin/orders");
  return r;
}

export async function opsRetryRefund(refundId: string) {
  const { service } = await audit("retry_refund", refundId);
  // Put the row back to 'requested' only if it is failed; pending rows are
  // re-examined (list first) by the processor on its own schedule.
  await service
    .from("refunds")
    .update({ status: "requested", updated_at: new Date().toISOString() } as never)
    .eq("id", refundId)
    .eq("status", "failed");
  const r = await processRefunds(getStripe(), { service });
  revalidatePath("/app/admin/orders");
  return r;
}

export async function opsReconcileNow() {
  const { service } = await audit("reconcile_now", "all");
  const stripe = getStripe();
  const unfulfilled = await reconcileUnfulfilledPaid({ service });
  const pending = await reconcilePendingOrders(stripe, { service });
  const refunds = await processRefunds(stripe, { service });
  revalidatePath("/app/admin/orders");
  return { unfulfilled, pending, refunds };
}

/** Void every valid ticket on a paid order and request its refund. */
export async function opsRefundOrder(orderId: string, why: string) {
  const { admin, service } = await audit("refund_order_requested", orderId, { why });
  const { data, error } = await service.rpc("request_order_refund_tx", {
    target_order: orderId,
    actor: admin.id,
    why: why.slice(0, 300),
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { error?: string; already?: boolean; refund_id?: string; voided?: number };
  if (r.error) throw new Error(`Refund refused: ${r.error}`);
  await processRefunds(getStripe(), { service });
  revalidatePath("/app/admin/orders");
  return r;
}
