import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, QrCode, Ticket, Users, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GigTrotterMark } from "@/components/brand";
import { stripeConfigured } from "@/lib/stripe/client";
import { DEFAULT_FEES, eventbriteFeeCents, formatMoney, buyerFeeCents } from "@/lib/tickets/pricing";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = { title: "Sell tickets" };

/**
 * The promoter entry path. A limited pilot, described as one: the fee is
 * the configured default, the comparison is Eventbrite's published UK
 * organiser-pays rate, and nothing promises a result. The submit flow is
 * the existing /app/events/submit page, reached through sign-in with the
 * destination preserved.
 */
export default function SellPage() {
  const face = 1500;
  const fee = buyerFeeCents(face, DEFAULT_FEES);
  const payments = stripeConfigured();
  const email = supportEmail();
  const next = encodeURIComponent("/app/events/submit");

  const steps = [
    { icon: Ticket, title: "List the gig", body: "Submit the event with date, venue and ticket types. It goes live once we have checked it." },
    { icon: Wallet, title: "Connect payouts", body: "A Stripe Express account, set up in a few minutes. Face value is paid to you by Stripe." },
    { icon: QrCode, title: "Scan at the door", body: "Each ticket is a signed QR code. Scan it from your phone, or type the short code if the camera is unavailable." },
    { icon: Users, title: "See who came", body: "Buyers keep the ticket in their wallet, and their friends on GigTrotter see they are going." },
  ];

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/login?next=${next}`}>Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/signup?next=${next}`}>Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">For promoters · limited pilot</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">Sell your gig&apos;s tickets here. Keep the whole face value.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          We are onboarding a small number of Belfast promoters for the first paid gigs. You set the price; the buyer
          pays a small booking fee on top; Stripe pays you the full face value of every ticket.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/40 p-6">
            <p className="text-sm text-muted-foreground">On a {formatMoney(face)} ticket</p>
            <p className="mt-1 text-3xl font-bold tnum">{formatMoney(face)}</p>
            <p className="text-sm text-muted-foreground">paid to you</p>
            <ul className="mt-4 space-y-1 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Buyer pays {formatMoney(face + fee)} ({formatMoney(fee)} booking fee)</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Nothing charged to you</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Fee is {DEFAULT_FEES.bps / 100}% + {formatMoney(DEFAULT_FEES.fixedCents)} per ticket</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card/40 p-6">
            <p className="text-sm text-muted-foreground">For comparison</p>
            <p className="mt-1 text-3xl font-bold tnum">{formatMoney(face + eventbriteFeeCents(face))}</p>
            <p className="text-sm text-muted-foreground">what the same ticket costs a buyer on Eventbrite&apos;s published UK rate (6.95% + 59p)</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Published rates, November 2026. Other sellers negotiate per event; we cannot compare what we cannot see.
            </p>
          </div>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-border bg-card/40 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-4 w-4" />
                </div>
                <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
              </div>
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <p className="font-semibold">What the pilot is, honestly</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>A handful of gigs with a real person on hand on the night.</li>
            <li>Keep your other sellers running; GigTrotter is an extra door, not a replacement.</li>
            <li>Refunds for a cancelled gig are issued to buyers by you through GigTrotter.</li>
            <li>
              {payments
                ? "Card payments are live through Stripe."
                : "Card payments switch on once our Stripe account is connected; you can list the gig and set up tiers now."}
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={`/signup?next=${next}`}>
                List a gig <ArrowRight />
              </Link>
            </Button>
            {email ? (
              <Button asChild size="lg" variant="outline">
                <a href={`mailto:${email}?subject=GigTrotter%20promoter%20pilot`}>Talk to us first</a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
