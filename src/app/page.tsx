import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Forward,
  Heart,
  MapPin,
  MessageSquare,
  Music,
  ScanLine,
  ShoppingBag,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GigTrotterMark } from "@/components/brand";
import { GlobeLoader } from "@/features/landing/globe-loader";

const lifecycle = [
  {
    stage: "Discover",
    blurb: "Find gigs, see who's going, get hyped.",
    icon: Music,
  },
  {
    stage: "Get tickets",
    blurb: "Buy through us or add your own — it's your wallet.",
    icon: Ticket,
  },
  {
    stage: "Tonight",
    blurb: "Lock-screen ticket. Doors time. Meet your mates.",
    icon: Sparkles,
  },
  {
    stage: "Be there",
    blurb: "Share photos, join the discussion, grab merch.",
    icon: MessageSquare,
  },
  {
    stage: "Remember",
    blurb: "A pin on your map. A story to tell. A collection to flex.",
    icon: MapPin,
  },
];

const features = [
  {
    icon: Users,
    title: "See who's going",
    body: "Your friends, the headcount, the vibe check. Know if it's worth it before you commit.",
  },
  {
    icon: MessageSquare,
    title: "Gig discussions",
    body: "Got your ticket? You're in the chat. Share photos, react, and connect with fellow attendees.",
  },
  {
    icon: ShoppingBag,
    title: "Exclusive merch",
    body: "Limited drops, presales, and venue collection. The good stuff, direct from the artist.",
  },
  {
    icon: Heart,
    title: "The purple tick",
    body: "Buy through GigTrotter and unlock full discussion access, badges, and priority on drops.",
  },
  {
    icon: MapPin,
    title: "Your life map",
    body: "Every gig, festival, and night out becomes a pin. Watch your map fill up over the years.",
  },
  {
    icon: Camera,
    title: "Zero typing",
    body: "Screenshot your ticket. Forward your confirmation email. Your wallet fills itself.",
  },
];

const captureRoutes = [
  {
    icon: ScanLine,
    title: "Screenshot it",
    body: "Share any ticket or booking screenshot. AI extracts the details and drops it in your wallet.",
  },
  {
    icon: Forward,
    title: "Forward it",
    body: "Forward any confirmation email to your personal capture address. Parsed instantly.",
  },
  {
    icon: Camera,
    title: "Backfill it",
    body: "On-device detection finds ticket screenshots already on your phone. Your map fills in minutes.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient aurora */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-15%] h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute right-[-10%] top-[20%] h-[60vh] w-[60vh] rounded-full bg-secondary/10 blur-[120px]" />
        <div className="absolute left-[-10%] top-[60%] h-[50vh] w-[50vh] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
      </div>

      {/* Nav */}
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <GigTrotterMark />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
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

      {/* HERO */}
      <section className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-6 pb-24 pt-12 md:grid-cols-[1fr_1.1fr] md:gap-12 md:pt-16">
        <div className="relative z-10 max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary backdrop-blur">
            <Music className="h-3 w-3" />
            Gigs · Festivals · Nights out
          </div>
          <h1 className="text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            The gig{" "}
            <span className="bg-gradient-to-br from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              never
            </span>{" "}
            ends.
          </h1>
          <p className="mt-3 max-w-lg font-mono text-sm uppercase tracking-[0.18em] text-muted-foreground/80">
            Discover · Attend · Share · Remember
          </p>
          <p className="mt-6 max-w-lg text-pretty text-lg text-muted-foreground">
            Find gigs, grab tickets, join the discussion, share the moment,
            and build a map of every live experience you&apos;ve ever had. Your
            music life, all in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="group">
              <Link href="/signup">
                Start your collection
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="backdrop-blur">
              <Link href="/design">See the design</Link>
            </Button>
          </div>

          <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              <span>Your ticket wallet</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-secondary" />
              <span>Social by default</span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <MapPin className="h-4 w-4 text-primary" />
              <span>Map-as-identity</span>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 blur-3xl" />
          <GlobeLoader className="aspect-square w-full max-w-[640px] mx-auto cursor-grab active:cursor-grabbing" />
          <p className="mt-3 text-center font-mono text-xs text-muted-foreground/60">
            drag to spin · scroll to zoom
          </p>
        </div>
      </section>

      {/* LIFECYCLE */}
      <section className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            The loop
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            From discovery to{" "}
            <span className="text-muted-foreground">legendary night</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every gig is a story. GigTrotter follows the full arc.
          </p>
        </div>
        <ol className="grid gap-3 md:grid-cols-5">
          {lifecycle.map((s, i) => (
            <li key={s.stage} className="group">
              <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card/40 p-5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-card/70 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.4)]">
                <div className="absolute right-3 top-3 font-mono text-xs tnum text-muted-foreground/50">
                  0{i + 1}
                </div>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="text-lg font-semibold">{s.stage}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.blurb}</p>
                <div className="mt-4 h-1 w-8 rounded-full bg-gradient-to-r from-primary to-secondary opacity-50 transition-opacity group-hover:opacity-100" />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* FEATURES — what makes it social */}
      <section className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Why GigTrotter
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            More than a ticket app.{" "}
            <span className="text-muted-foreground">It&apos;s where gig lovers live.</span>
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/80 to-card/20 p-7 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.35)]"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT GETS IN — compact */}
      <section className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-secondary/10 p-1 backdrop-blur">
          <div className="rounded-[calc(theme(borderRadius.3xl)_-_4px)] bg-card/60 p-10 md:p-14">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              How it gets in
            </p>
            <h2 className="mt-2 mb-8 text-3xl font-semibold tracking-tight md:text-4xl">
              Your wallet fills itself.
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {captureRoutes.map((r) => (
                <div key={r.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <r.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{r.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-3xl px-6 py-32 text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Every gig you&apos;ve been to.{" "}
          <span className="text-muted-foreground">Every one you&apos;re going to.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
          Start building your collection. Find your next gig. Join the conversation.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">
              Get started <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/privacy">Privacy promise</Link>
          </Button>
        </div>
      </section>

      <footer className="relative mx-auto max-w-7xl border-t border-border px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <GigTrotterMark />
          <p>The gig never ends · {new Date().getFullYear()}</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/design" className="hover:text-foreground">Design</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
