"use client";

import { useState, useTransition } from "react";
import { RefreshCw, RotateCcw, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { opsReconcileNow, opsRefundOrder, opsRetryFulfilment, opsRetryRefund } from "./actions";

type Action = { kind: "retryFulfilment" | "retryRefund" | "refundOrder"; id: string };

/**
 * Buttons for the reconciliation page. With no `action` it renders the
 * global "Reconcile now" plus an order-refund form; with one it renders that
 * row's single next action. Everything confirms before money moves.
 */
export function OpsControls({ action }: { action?: Action }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [why, setWhy] = useState("");

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        const r = await fn();
        setMsg(JSON.stringify(r));
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Failed.");
      }
    });

  if (action) {
    const label = action.kind === "retryFulfilment" ? "Retry fulfilment" : action.kind === "retryRefund" ? "Retry refund" : "Refund order";
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (action.kind === "retryFulfilment") run(() => opsRetryFulfilment(action.id));
            else if (action.kind === "retryRefund") run(() => opsRetryRefund(action.id));
          }}
        >
          <RotateCcw /> {label}
        </Button>
        {msg ? <p className="max-w-xs break-all font-mono text-[10px] text-muted-foreground">{msg}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => opsReconcileNow())}>
          <RefreshCw /> Reconcile now
        </Button>
        <p className="text-xs text-muted-foreground">Runs the same steps as the scheduled job: replay, retry fulfilment, confirm pending orders with Stripe, perform requested refunds.</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!orderId.trim() || !why.trim()) return;
          if (!window.confirm(`Void every ticket on order ${orderId} and refund it in full? This cannot be undone.`)) return;
          run(async () => {
            const r = await opsRefundOrder(orderId.trim(), why.trim());
            setOrderId("");
            setWhy("");
            return r;
          });
        }}
      >
        <label className="text-xs">
          Order id
          <input className="mt-1 block h-10 w-72 rounded-md border border-border bg-background px-2 font-mono text-xs" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        </label>
        <label className="text-xs">
          Reason
          <input className="mt-1 block h-10 w-72 rounded-md border border-border bg-background px-2 text-sm" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="event cancelled" />
        </label>
        <Button type="submit" variant="destructive" disabled={pending || !orderId.trim() || !why.trim()}>
          <Undo2 /> Refund whole order
        </Button>
      </form>
      {msg ? <p className="break-all font-mono text-[10px] text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
