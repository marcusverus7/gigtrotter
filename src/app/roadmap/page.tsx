import type { Metadata } from "next";
import Link from "next/link";
import { Check, Circle, Clock, MapPin, ScanLine, Ticket, Users } from "lucide-react";

import { GigTrotterMark } from "@/components/brand";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Roadmap — GigTrotter",
  description:
    "What GigTrotter does today, what is coming next, and where it is going. An honest status board for a product in closed beta.",
};

type Status = "live" | "building" | "next" | "later";

const STATUS_META: Record<
  Status,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  live: { label: "Live", icon: Check, className: "text-emerald-400" },
  building: { label: "In progress", icon: Clock, className: "text-amber-300" },
  next: { label: "Next", icon: Circle, className: "text-secondary" },
  later: { label: "Later", icon: Circle, className: "text-muted-foreground" },
};

function Row({
  status,
  title,
  body,
}: {
  status: Status;
  title: string;
  body: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div className="flex gap-4 border-b border-border/40 py-4 last:border-0">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className}`} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{title}</p>
          <Badge variant="outline" className="text-[10px]">
            {meta.label}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{blurb}</p>
      </div>
      <div className="rounded-xl border border-border/60 bg-card/40 px-5">
        {children}
      </div>
    </section>
  );
}

const PRINCIPLES = [
  {
    icon: ScanLine,
    title: "Zero typing",
    body: "If you have to type it in, we have failed. Capture should cost one screenshot.",
  },
  {
    icon: MapPin,
    title: "Private by default",
    body: "Future plans never leave your inner circle. That rule lives in the database, not the interface.",
  },
  {
    icon: Users,
    title: "Nothing half-shipped",
    body: "Features stay switched off until they work. An empty room is worse than a closed door.",
  },
];

export default function RoadmapPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      </div>

      <header className="container flex items-center justify-between py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
        <Link
          href="/signup"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Get started
        </Link>
      </header>

      <div className="container max-w-3xl space-y-14 pb-24">
        <div className="space-y-4">
          <Badge variant="outline">Closed beta</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Where we are, and where we are going.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            GigTrotter turns a screenshot of a ticket into a wallet entry and a
            pin on your map — no typing. That core works today. This page is an
            honest account of what is finished, what is not, and what comes next.
          </p>
        </div>

        <Section
          eyebrow="Today"
          title="What works right now"
          blurb="Everything here is live in the beta, on web, iOS and Android."
        >
          <Row
            status="live"
            title="Screenshot capture"
            body="Drop a screenshot, photograph a paper ticket, or scan your camera roll in bulk. Reads tickets, boarding passes, hotel and restaurant confirmations — 97.9% field accuracy across a 42-image labelled test set."
          />
          <Row
            status="live"
            title="Confirm before it saves"
            body="Every parse lands as an editable card, never a silent write. Anything the parser is unsure of is flagged for review rather than guessed at."
          />
          <Row
            status="live"
            title="Your wallet"
            body="Tonight's ticket, upcoming gigs, and everything you have already been to — with seat, entrance and standing details lifted straight off the ticket."
          />
          <Row
            status="live"
            title="Your map"
            body="Every confirmed gig becomes a pin. Per-pin privacy: future plans are visible only to your inner circle, enforced in the database rather than the interface."
          />
          <Row
            status="live"
            title="Save a gig you have no ticket for"
            body="Add a gig to your wishlist before tickets are in your hand. It sits in the wallet as something you are watching, and becomes a real entry the moment you capture the ticket."
          />
          <Row
            status="live"
            title="Trips, memories and year in review"
            body="Flights, stays and gigs in the same window cluster into trips automatically. Every year with pins gets a shareable review."
          />
        </Section>

        <Section
          eyebrow="Next"
          title="What we are building now"
          blurb="All aimed at the same thing — making the app worth opening between gigs, not only on the night."
        >
          <Row
            status="building"
            title="Venue pages"
            body="Every venue gets a page: what is on there, your own history, and how many GigTrotter regulars have been. Useful to you, and the beginning of something useful to venues."
          />
          <Row
            status="building"
            title="Reminders that actually land"
            body="Doors tonight, on-sale alerts, and a nudge when something you are watching is announced nearby."
          />
          <Row
            status="next"
            title="Follow an artist or a venue"
            body="Hear when someone you follow announces a date or goes on sale, instead of finding out when it has sold out."
          />
          <Row
            status="next"
            title="Email forwarding"
            body="Forward a confirmation email to your own capture address and have it parsed automatically. The parser is ready; it needs a real inbound domain."
          />
        </Section>

        <Section
          eyebrow="Where this goes"
          title="The bigger idea"
          blurb="Built, but deliberately switched off until each one is genuinely ready. Better to ship five things that work than ten that half-work."
        >
          <Row
            status="later"
            title="Gig discovery"
            body="Find what is on near you and see which friends are going. Needs a live events feed before it is worth showing to anyone."
          />
          <Row
            status="later"
            title="Face-value resale"
            body="Sell a spare ticket at face value, never above. The price cap is a database constraint — but the declared face value still needs checking against the ticket itself before this can handle real money."
          />
          <Row
            status="later"
            title="Tickets direct from venues"
            body="The long game: independent venues selling through GigTrotter, keeping more of the door and owning their own audience. Everything above exists to earn that audience first."
          />
          <Row
            status="later"
            title="Apple Wallet passes"
            body="Your ticket on the lock screen, offline, where you actually need it at the door. Asked for by our own testers."
          />
        </Section>

        <section className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            How we build
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                className="rounded-xl border border-border/60 bg-card/40 p-5"
              >
                <p.icon className="h-5 w-5 text-primary" />
                <p className="mt-3 font-medium">{p.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
          <div className="flex items-start gap-3">
            <Ticket className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Run a venue, or promote gigs?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We are looking for a small number of independent venues to work
                with early. Get in touch through the{" "}
                <Link href="/support" className="underline">
                  support page
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
