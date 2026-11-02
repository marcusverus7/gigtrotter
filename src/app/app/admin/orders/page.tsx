import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OpsControls } from "@/features/ops/ops-controls";
import { getAdminUser } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { reconciliationReport } from "@/lib/tickets/fulfil";
import { formatMoney } from "@/lib/tickets/pricing";

export const metadata: Metadata = { title: "Admin — Orders" };
export const dynamic = "force-dynamic";

/**
 * Reconciliation (PAY-05): every order or refund that is not in a settled
 * state, with a named next action. Ids and amounts only; no buyer details,
 * no ticket codes. Admin allowlist via getAdminUser.
 */
export default async function AdminOrdersPage() {
  const user = await getAdminUser();
  if (!user) redirect("/app");
  const service = createServiceClient();
  const report = await reconciliationReport({ service });

  const { data: recentOps } = await service
    .from("ops_actions")
    .select("id, action, target, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders and refunds</h1>
          <p className="text-sm text-muted-foreground">
            Reconciled {new Date(report.at).toLocaleString("en-GB")}. The reconcile job runs this same check and answers 500 while anything below needs a human.
          </p>
        </div>
        <Badge variant={report.critical === 0 ? "verified" : "outline"}>
          {report.critical === 0 ? (
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Clean</span>
          ) : (
            <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {report.critical} to act on</span>
          )}
        </Badge>
      </header>

      <OpsControls />

      <Section
        title="Paid but not fulfilled"
        hint="Stripe has the money, the buyer has no tickets. Next action: retry fulfilment; if it keeps failing, read fulfilment_error and fix the data, then retry."
        empty="None."
        rows={report.paidUnfulfilled.map((o) => ({
          id: o.id,
          meta: [`paid ${o.paid_at ? new Date(o.paid_at).toLocaleString("en-GB") : "?"}`, o.fulfilment_error ?? ""],
          action: { kind: "retryFulfilment" as const, id: o.id },
        }))}
      />

      <Section
        title="Pending past their window"
        hint="Checkout started but never confirmed. Next action: the reconciler asks Stripe and releases or fulfils; rows that stay here carry the reason in reconcile_note."
        empty="None."
        rows={report.pendingOverdue.map((o) => ({
          id: o.id,
          meta: [o.has_session ? "has Stripe session" : "no Stripe session", o.reconcile_note ?? "not yet reconciled"],
        }))}
      />

      <Section
        title="Refunds in flight"
        hint="Requested or pending at Stripe. Rows with three or more attempts count as critical. Next action: wait for the processor; retry only a failed row."
        empty="None."
        rows={report.refundsOpen.map((r) => ({
          id: r.id,
          meta: [`order ${r.order_id.slice(0, 8)}`, r.reason, formatMoney(r.amount_cents), `${r.status} · ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}`, r.last_error ?? ""],
        }))}
      />

      <Section
        title="Refunds failed"
        hint="Stripe refused or the processor gave up. Next action: read the error; fix at Stripe if needed (e.g. insufficient platform balance), then retry."
        empty="None."
        rows={report.refundsFailed.map((r) => ({
          id: r.id,
          meta: [`order ${r.order_id.slice(0, 8)}`, r.reason, formatMoney(r.amount_cents), r.last_error ?? ""],
          action: { kind: "retryRefund" as const, id: r.id },
        }))}
      />

      <Section
        title="Webhook events not finished"
        hint="Verified Stripe events whose handler failed. The reconciler replays them; after ten attempts they stay here for a human."
        empty="None."
        rows={report.unprocessedEvents.map((e) => ({
          id: e.id,
          meta: [e.type, `received ${new Date(e.received_at).toLocaleString("en-GB")}`, `${e.attempts} attempts`, e.last_error ?? ""],
        }))}
      />

      <Section
        title="Ticket count mismatch"
        hint="A fulfilled order whose ticket rows do not match its units. Should never happen with fulfil_order_tx; if it does, retry fulfilment (it only adds missing units) and report it."
        empty="None in the last 200 paid orders."
        rows={report.unitMismatch.map((m) => ({
          id: m.id,
          meta: [`expected ${m.expected}`, `present ${m.present}`],
          action: { kind: "retryFulfilment" as const, id: m.id },
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent operator actions</CardTitle>
          <CardDescription>Every recovery action is audited in ops_actions.</CardDescription>
        </CardHeader>
        <CardContent>
          {(recentOps ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(recentOps ?? []).map((a) => (
                <li key={a.id} className="flex justify-between py-1.5">
                  <span>{a.action} <span className="font-mono text-xs text-muted-foreground">{a.target}</span></span>
                  <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("en-GB")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  hint,
  empty,
  rows,
}: {
  title: string;
  hint: string;
  empty: string;
  rows: Array<{ id: string; meta: string[]; action?: { kind: "retryFulfilment" | "retryRefund" | "refundOrder"; id: string } }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title} <span className="text-muted-foreground">({rows.length})</span></CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs">{r.id}</span>
                  <p className="text-xs text-muted-foreground">{r.meta.filter(Boolean).join(" · ")}</p>
                </div>
                {r.action ? <OpsControls action={r.action} /> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
