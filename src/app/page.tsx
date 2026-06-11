import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Forward,
  Lock,
  MapPin,
  ScanLine,
  Ticket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GigTrotterMark } from "@/components/brand";

const lifecycle = [
  { stage: "Wishlist", blurb: "Saved with one tap from anywhere." },
  { stage: "Going", blurb: "Ticket lands in the wallet automatically." },
  { stage: "Tonight", blurb: "Lock-screen ticket, doors time, meet spot." },
  { stage: "Attended", blurb: "One tap. Two photos suggested. Done." },
  { stage: "Memory", blurb: "The map, the stats, the year-in-review." },
];

const captureRoutes = [
  {
    icon: ScanLine,
    title: "Smart screenshot import",
    body: "Share any ticket, boarding pass or booking screenshot. A multimodal AI pass extracts the details and drops a confirm card.",
  },
  {
    icon: Forward,
    title: "Forwarding address",
    body: "Forward any confirmation email to your personal capture address. Parsed the same way. Zero scary permissions.",
  },
  {
    icon: Camera,
    title: "Camera-roll backfill",
    body: "On-device detection finds the ticket screenshots already on your phone. Your map populates in the first ten minutes.",
  },
];

export default function LandingPage() {
  return (
    <main className="bg-aurora min-h-screen">
      {/* Nav */}
      <header className="container flex items-center justify-between py-6">
        <GigTrotterMark />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/design">Design</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="container flex flex-col items-center pt-16 text-center md:pt-24">
        <Badge variant="inner" className="mb-6">
          Capture-first · v3
        </Badge>
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight md:text-6xl">
          The wallet that{" "}
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            remembers
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          Your tickets, flights and bookings live here — and every one quietly
          becomes a pin on a beautiful, private map of your life. Share it on
          your terms: inner circle, friends, everyone, or anonymously.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">
              Build my map <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/design">See the design system</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No manual entry. Screenshot, share or forward — the app does the rest.
        </p>
      </section>

      {/* Lifecycle */}
      <section className="container py-24">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold md:text-3xl">
            The lifecycle is the product
          </h2>
          <p className="mt-2 text-muted-foreground">
            Every captured item moves from intent to memory — zero typing.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-5">
          {lifecycle.map((s, i) => (
            <li key={s.stage}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="pb-2">
                  <span className="font-mono text-xs text-muted-foreground tnum">
                    0{i + 1}
                  </span>
                  <CardTitle className="text-base">{s.stage}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{s.blurb}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Capture routes */}
      <section className="container py-12">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold md:text-3xl">Five routes in</h2>
          <p className="mt-2 text-muted-foreground">
            Screenshots beat integrations. Your existing behaviour is the
            integration.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {captureRoutes.map((r) => (
            <Card key={r.title} className="h-full">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <r.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{r.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{r.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section className="container py-24">
        <Card className="overflow-hidden border-primary/20">
          <div className="grid md:grid-cols-2">
            <CardHeader className="justify-center p-10">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <Lock className="h-5 w-5" />
              </div>
              <CardTitle className="text-2xl">
                Your life, your map, your terms
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                Privacy is architecture, not a settings page. Per-pin audiences
                (Circles), an anonymous board that proves your taste without your
                identity, and a redaction engine so a booking reference can
                never leak. Future events are never visible beyond your inner
                circle — enforced in the database, not the UI.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col justify-center gap-3 border-t border-border bg-muted/30 p-10 md:border-l md:border-t-0">
              {[
                { icon: Lock, label: "Vault", desc: "Only you. End-to-end private." },
                { icon: Ticket, label: "Inner Circle", desc: "Partner, best mates. The default." },
                { icon: MapPin, label: "Friends", desc: "Accepted bilateral friends." },
                { icon: ArrowRight, label: "Open", desc: "Public or anonymous board." },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-background">
                    <c.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <footer className="container flex flex-col items-center gap-2 border-t border-border py-10 text-center text-sm text-muted-foreground">
        <GigTrotterMark />
        <p>The wallet that remembers · Built capture-first · {new Date().getFullYear()}</p>
      </footer>
    </main>
  );
}
