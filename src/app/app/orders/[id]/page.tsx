import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-datetime";
import { TicketQr } from "@/features/ticketing/ticket-qr";
import { formatMoney } from "@/lib/tickets/pricing";
import { getStripe } from "@/lib/stripe/client";
import { createClient, createServiceClient, getSessionUser } from "@/lib/supabase/server";
import { fulfilOrder, issueForOrder } from "@/lib/tickets/fulfil";

export const metadata: Metadata = { title: "Your order" };

/**
 * Where Stripe sends the buyer back. The webhook usually lands first; if the
 * page gets here a second ahead of it, it says so and the tickets appear on
 * the next refresh rather than a scary "nothing here".
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const load = () =>
    supabase
      .from("orders")
      .select("*, events(id, title, starts_at, venue_name, venue_city)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
  let { data: order } = await load();
  if (!order) notFound();

  // The buyer is looking at their own order before the webhook landed (or
  // after it failed): nudge it along right now rather than making them
  // refresh and hope. Same steps as the reconciler, scoped to this order;
  // nothing moves unless Stripe says paid. Errors are swallowed here because
  // the reconciler will try again on its schedule.
  const nudge = order as unknown as { status: string; fulfilled_at?: string | null; stripe_checkout_session_id: string | null };
  if (nudge.status === "pending" || (nudge.status === "paid" && !nudge.fulfilled_at)) {
    try {
      const service = createServiceClient();
      if (nudge.status === "paid") await issueForOrder(id, { service });
      else if (nudge.stripe_checkout_session_id) {
        const stripe = getStripe();
        const s = stripe ? await stripe.checkout.sessions.retrieve(nudge.stripe_checkout_session_id) : null;
        if (s?.payment_status === "paid")
          await fulfilOrder(
            id,
            {
              sessionId: s.id,
              paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
              email: s.customer_details?.email ?? null,
            },
            { service },
          );
      }
      ({ data: order } = await load());
      if (!order) notFound();
    } catch (err) {
      console.error("[order page] nudge failed", id, err instanceof Error ? err.message : String(err));
    }
  }
  const o = order as unknown as {
    id: string; status: string; total_cents: number; face_cents: number; fee_cents: number; currency: string;
    events: { id: string; title: string; starts_at: string | null; venue_name: string | null; venue_city: string | null } | null;
  };
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, code, status, wallet_item_id, ticket_tiers(name)")
    .eq("order_id", id)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  const rows = (tickets ?? []) as unknown as Array<{ id: string; code: string; status: string; wallet_item_id: string | null; ticket_tiers: { name: string } | null }>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={o.events ? `/app/events/${o.events.id}` : "/app"}>
          <ArrowLeft /> Back
        </Link>
      </Button>

      <Card className={o.status === "paid" ? "border-secondary/40" : "border-border"}>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {o.status === "paid" ? <CheckCircle2 className="h-4 w-4 text-secondary" /> : <Clock className="h-4 w-4" />}
            {o.status === "paid" ? "Paid — you're going" : o.status === "pending" ? "Confirming your payment…" : `Order ${o.status}`}
          </div>
          <CardTitle className="text-2xl">{o.events?.title ?? "Your order"}</CardTitle>
          <CardDescription>
            {[o.events?.venue_name, o.events?.venue_city].filter(Boolean).join(" · ")}
            {o.events?.starts_at ? (
              <>
                {" · "}
                <LocalDateTime iso={o.events.starts_at} options={{ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {formatMoney(o.total_cents, o.currency)} paid
            {o.fee_cents > 0 ? ` (${formatMoney(o.face_cents, o.currency)} tickets + ${formatMoney(o.fee_cents, o.currency)} booking fees)` : ""}.
          </p>
          {o.status === "pending" ? (
            <p className="text-sm">
              Stripe is confirming the payment. This usually takes a few seconds — refresh and your tickets will be here, and in your wallet.
            </p>
          ) : null}
          {rows.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {rows.map((t, i) => (
                <div key={t.id} className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                  <p className="mb-3 text-sm font-medium">
                    {t.ticket_tiers?.name ?? "Ticket"} · {i + 1} of {rows.length}
                  </p>
                  <TicketQr code={t.code} size={180} />
                  {t.wallet_item_id ? (
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <Link href={`/app/item/${t.wallet_item_id}`}>Open in wallet</Link>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Each QR is one admission. They are in your wallet and in Night Mode on the day — no email needed, no printing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
