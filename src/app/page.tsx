import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Camera,
  Forward,
  Lock,
  MapPin,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GigTrotterMark } from "@/components/brand";

// The globe lives behind a client boundary — Three.js can't render in RSC.
// Ship it dynamically so the rest of the page streams immediately.
const Globe = dynamic(
  () => import("@/features/landing/globe").then((m) => m.Globe),
  { ssr: false, loading: () => <GlobePlaceholder /> },
);

const lifecycle = [
  { stage: "Wishlist", blurb: "Saved with one tap from anywhere." },
  { stage: "Going", blurb: "Ticket lands in the wallet automatically." },
  { stage: "Tonight", blurb: "Lock-screen ticket, doors time, meet spot." },
  { stage: "Attended", blurb: "One tap. Two photos suggested. Done." },
  { stage: "Memory", blurb: "The map, the stats, the throwbacks." },
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

const circles = [
  {
    icon: Lock,
    title: "Vault",
    desc: "Only you. End-to-end private; never appears in any feed.",
    variant: "vault" as const,
  },
  {
    icon: Ticket,
    title: "Inner Circle",
    desc: "Partner, best mates. The default for every new pin.",
    variant: "inner" as const,
  },
  {
    icon: MapPin,
    title: "Friends",
    desc: "Accepted bilateral. Only past events ever visible.",
    variant: "friends" as const,
  },
  {
    icon: ArrowRight,
    title: "Open",
    desc: "Public profile or anonymous board. Past, city-fuzzed.",
    variant: "open" as const,
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient aurora behind everything */}
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

      {/* HERO — full-bleed, globe behind, content over */}
      <section className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-6 pb-24 pt-12 md:grid-cols-[1fr_1.1fr] md:gap-12 md:pt-16">
        <div className="relative z-10 max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Capture-first · v3
          </div>
          <h1 className="text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            The wallet that{" "}
            <span className="bg-gradient-to-br from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              remembers
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-lg text-muted-foreground">
            Your tickets, flights and bookings live here — and every one
            quietly becomes a pin on a private map of your life. Share it on
            your terms.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="group">
              <Link href="/signup">
                Build my map
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="backdrop-blur">
              <Link href="/design">See the design</Link>
            </Button>
          </div>

          <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-secondary" />
              <span>Privacy-native</span>
            </div>
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-primary" />
              <span>Zero manual entry</span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <MapPin className="h-4 w-4 text-secondary" />
              <span>Map-as-identity</span>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 blur-3xl" />
          <Globe className="aspect-square w-full max-w-[640px] mx-auto cursor-grab active:cursor-grabbing" />
          <p className="mt-3 text-center font-mono text-xs text-muted-foreground/60">
            drag to spin · scroll to zoom
          </p>
        </div>
      </section>

      {/* LIFECYCLE — premium card row */}
      <section className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            The product
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            The lifecycle <span className="text-muted-foreground">is the product</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every captured item moves from intent to memory — zero typing.
          </p>
        </div>
        <ol className="grid gap-3 md:grid-cols-5">
          {lifecycle.map((s, i) => (
            <li key={s.stage} className="group">
              <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card/40 p-5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-card/70 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.4)]">
                <div className="absolute right-3 top-3 font-mono text-xs tnum text-muted-foreground/50">
                  0{i + 1}
                </div>
                <div className="mt-4 text-lg font-semibold">{s.stage}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.blurb}</p>
                <div className="mt-4 h-1 w-8 rounded-full bg-gradient-to-r from-primary to-secondary opacity-50 transition-opacity group-hover:opacity-100" />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* CAPTURE ROUTES — bigger cards */}
      <section className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 flex items-end justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
              How it gets in
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Five routes in.{" "}
              <span className="text-muted-foreground">Screenshots beat integrations.</span>
            </h2>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {captureRoutes.map((r, i) => (
            <div
              key={r.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/80 to-card/20 p-7 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.35)]"
            >
              <div className="absolute right-6 top-6 font-mono text-xs text-muted-foreground/40">
                / 0{i + 1}
              </div>
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <r.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">{r.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRIVACY — banner-style with cinematic gradient */}
      <section className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-secondary/10 p-1 backdrop-blur">
          <div className="grid gap-8 rounded-[calc(theme(borderRadius.3xl)_-_4px)] bg-card/60 p-10 md:grid-cols-[1.1fr_1fr] md:gap-16 md:p-14">
            <div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
                Privacy is architecture
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Your life, your map, your terms.
              </h2>
              <p className="mt-4 max-w-md text-muted-foreground">
                Per-pin audiences. An anonymous board that proves your taste
                without your identity. A redaction engine so a booking
                reference can never leak.
              </p>
              <p className="mt-4 max-w-md text-sm text-muted-foreground">
                Future events are never visible beyond your inner circle —
                enforced in the database, not the UI.
              </p>
            </div>
            <div className="grid gap-3">
              {circles.map((c) => (
                <CircleRow key={c.title} {...c} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-3xl px-6 py-32 text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          The map fills itself.{" "}
          <span className="text-muted-foreground">All you do is screenshot.</span>
        </h2>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">
              Build my map <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/privacy">The privacy promise</Link>
          </Button>
        </div>
      </section>

      <footer className="relative mx-auto max-w-7xl border-t border-border px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <GigTrotterMark />
          <p>The wallet that remembers · {new Date().getFullYear()}</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/design" className="hover:text-foreground">Design</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function CircleRow({
  icon: Icon,
  title,
  desc,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  variant: "vault" | "inner" | "friends" | "open";
}) {
  return (
    <div className="group flex items-start gap-4 rounded-xl border border-border bg-background/50 p-4 backdrop-blur transition-colors hover:border-primary/30">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-circle-${variant}/15 text-circle-${variant}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">{title}</p>
          <Badge variant={variant} className="text-[10px]">
            {variant === "inner"
              ? "default"
              : variant === "vault"
                ? "most private"
                : variant === "open"
                  ? "public"
                  : "bilateral"}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function GlobePlaceholder() {
  return (
    <div className="aspect-square w-full max-w-[640px] mx-auto">
      <div className="relative h-full w-full">
        <div className="absolute inset-[8%] animate-pulse rounded-full bg-gradient-to-br from-primary/20 to-secondary/10" />
        <div className="absolute inset-[12%] rounded-full border border-primary/20" />
      </div>
    </div>
  );
}
