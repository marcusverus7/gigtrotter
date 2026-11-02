import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ScanLine, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompForm } from "@/features/ticketing/comp-form";
import { TierManager, type TierRow } from "@/features/ticketing/tier-manager";
import { stripeConfigured } from "@/lib/stripe/client";
import { DEFAULT_FEES, formatMoney } from "@/lib/tickets/pricing";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sell tickets" };

/**
 * The promoter's page for one event: ticket types, what has sold, what they
 * are owed, payouts status, guest list, and the door scanner. Reachable only
 * by the event's promoter.
 */
export default async function SellTicketsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: event } = await supabase.from("events").select("id, title, starts_at, promoter_id, currency").eq("id", id).maybeSingle();
  if (!event) notFound();
  if (event.promoter_id !== user.id) redirect(`/app/events/${id}`);

  const [{ data: tiers, error: tiersErr }, { data: account }, { data: orders }, { data: tickets }] = await Promise.all([
    supabase.from("ticket_tiers").select("id, name, description, price_cents, quantity, sold, reserved, max_per_order, status").eq("event_id", id).order("sort_order"),
    supabase.from("promoter_accounts").select("charges_enabled, payouts_enabled, details_submitted, fee_bps, fee_fixed_cents").eq("user_id", user.id).maybeSingle(),
    supabase.from("orders").select("face_cents, fee_cents, status").eq("event_id", id).eq("status", "paid"),
    supabase.from("tickets").select("status, issued_as").eq("event_id", id),
  ]);
  const notReady = !!tiersErr; // migration 0029 not applied
  const fees = account ? { bps: account.fee_bps, fixedCents: account.fee_fixed_cents } : DEFAULT_FEES;
  const revenue = (orders ?? []).reduce((n, o) => n + o.face_cents, 0);
  const paidOrders = orders?.length ?? 0;
  const sold = (tickets ?? []).filter((t) => t.issued_as === "purchase").length;
  const comps = (tickets ?? []).filter((t) => t.issued_as === "comp").length;
  const used = (tickets ?? []).filter((t) => t.status === "used").length;
  const paymentsOn = stripeConfigured();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/app/events/${id}`}>
          <ArrowLeft /> {event.title}
        </Link>
      </Button>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Sell tickets</h1>
        <p className="text-sm text-muted-foreground">You receive the full face value of every ticket. Buyers pay one small fee on top.</p>
      </header>

      {notReady ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Ticketing is not switched on yet</CardTitle>
            <CardDescription>Migration 0029 needs applying to the database first.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Sold" value={String(sold)} />
        <Stat label="Orders" value={String(paidOrders)} />
        <Stat label="Checked in" value={String(used)} />
        <Stat label="You're owed" value={formatMoney(revenue, event.currency ?? "GBP")} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-primary" /> Payouts</CardTitle>
              <CardDescription>Stripe pays you directly, usually within two working days of each sale.</CardDescription>
            </div>
            <Badge variant={account?.charges_enabled ? "verified" : "outline"}>
              {account?.charges_enabled ? "Ready" : account?.details_submitted ? "Under review" : "Not set up"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {paymentsOn ? (
            <Button asChild size="sm" variant={account?.charges_enabled ? "outline" : "default"}>
              <a href="/api/stripe/connect">{account?.charges_enabled ? "Payout settings" : "Set up payouts with Stripe"}</a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Payments are not switched on for this deployment yet.</p>
          )}
          {!account?.charges_enabled ? (
            <p className="mt-2 text-xs text-muted-foreground">Tickets cannot go on sale until payouts are set up — takes about five minutes with your bank details.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ticket types</CardTitle>
          <CardDescription>Early bird, general, VIP — each with its own price and capacity.</CardDescription>
        </CardHeader>
        <CardContent>
          <TierManager eventId={id} tiers={(tiers ?? []) as TierRow[]} fees={fees} />
        </CardContent>
      </Card>

      {(tiers ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guest list</CardTitle>
            <CardDescription>Give a ticket to anyone on GigTrotter — {comps} given so far.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompForm eventId={id} tiers={(tiers ?? []).map((t) => ({ id: t.id, name: t.name }))} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ScanLine className="h-4 w-4 text-primary" /> On the door</CardTitle>
          <CardDescription>Scan QR codes or type the code. Works on any phone that can open the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/app/events/${id}/scan`}>Open the scanner</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tnum">{value}</p>
    </div>
  );
}
