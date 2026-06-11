import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Lock,
  MapPin,
  Server,
  ShieldCheck,
  Ticket,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GigTrotterMark } from "@/components/brand";

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

const principles = [
  {
    icon: ShieldCheck,
    title: "Privacy by architecture",
    body: "Per-pin audience controls. Future events are never visible beyond your inner circle — enforced in the database, not the UI.",
  },
  {
    icon: Eye,
    title: "Anonymous boards",
    body: "Prove your taste without your identity. Share a read-only board that shows where you've been without revealing who you are.",
  },
  {
    icon: Lock,
    title: "Encrypted captures",
    body: "Booking references, barcodes, and personal details are encrypted at rest. A redaction engine ensures sensitive data can never leak.",
  },
  {
    icon: Server,
    title: "Your data, your call",
    body: "Export everything in JSON, anytime. Delete the account, anytime. No dark patterns, no data hostage.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-15%] h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-secondary/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
      </div>

      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-12 pb-16">
        <Button asChild variant="ghost" size="sm" className="mb-8">
          <Link href="/">
            <ArrowLeft /> Back
          </Link>
        </Button>

        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          The privacy promise
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
          Your life, your map, your terms.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          GigTrotter is built for people who love live experiences — not for
          advertisers. Privacy isn&apos;t a feature we bolted on; it&apos;s baked into the
          architecture.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="mb-8 text-2xl font-semibold">How we think about your data</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {principles.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="mb-3 text-2xl font-semibold">Audience circles</h2>
        <p className="mb-6 max-w-2xl text-muted-foreground">
          Every pin on your map has an audience. You choose who sees what —
          from completely private to public. The default is your inner circle.
        </p>
        <div className="grid gap-3">
          {circles.map((c) => (
            <div
              key={c.title}
              className="flex items-start gap-4 rounded-xl border border-border bg-background/50 p-4 backdrop-blur"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-circle-${c.variant}/15 text-circle-${c.variant}`}
              >
                <c.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.title}</p>
                  <Badge variant={c.variant} className="text-[10px]">
                    {c.variant === "inner"
                      ? "default"
                      : c.variant === "vault"
                        ? "most private"
                        : c.variant === "open"
                          ? "public"
                          : "bilateral"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {c.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="mb-6 text-2xl font-semibold">The specifics</h2>
        <div className="space-y-4">
          <DetailSection title="What we hold for you">
            <ul className="list-disc space-y-1 pl-6 text-sm">
              <li>The captures you share with us, encrypted at rest.</li>
              <li>The structured parse of each capture — event, date, place — so the wallet and map can render.</li>
              <li>Your profile, your friend graph, your anonymous handle and view count.</li>
            </ul>
          </DetailSection>
          <DetailSection title="What we drop on the way in">
            <ul className="list-disc space-y-1 pl-6 text-sm">
              <li>Passport numbers.</li>
              <li>Payment details and loyalty numbers.</li>
              <li>Anything that looks like an identity document.</li>
            </ul>
          </DetailSection>
          <DetailSection title="What we never share or sell">
            <ul className="list-disc space-y-1 pl-6 text-sm">
              <li>Your location history. Ever.</li>
              <li>Your travel data. Ever.</li>
              <li>Your friend graph.</li>
            </ul>
          </DetailSection>
          <DetailSection title="The time-shift rule">
            <p className="text-sm">
              Future events are never visible beyond your Inner Circle. Past
              events follow whatever audience you set. This is enforced in the
              database — there is no setting that turns it off.
            </p>
          </DetailSection>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          Privacy-first, gig-obsessed.
        </h2>
        <p className="mt-3 text-muted-foreground">
          We built GigTrotter because we love live music — and we think you
          shouldn&apos;t have to give up your privacy to remember it.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild size="lg">
            <Link href="/signup">
              Get started <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl border-t border-border px-6 py-10">
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

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card/40 p-5 backdrop-blur">
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}
