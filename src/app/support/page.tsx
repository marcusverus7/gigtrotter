import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GigTrotterMark } from "@/components/brand";

export const metadata: Metadata = {
  title: "Support",
};

export default function SupportPage() {
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
          <LifeBuoy className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          Help &amp; support
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
          How can we help?
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Answers to the most common questions are below. If you can&apos;t find
          what you need, drop us a line at{" "}
          <a
            href="mailto:hello@gigtrotter.app"
            className="text-secondary hover:underline"
          >
            hello@gigtrotter.app
          </a>{" "}
          — we usually reply within a couple of days.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-4">
          <DetailSection title="How does GigTrotter work?">
            <p className="text-sm leading-relaxed">
              Scan a ticket or booking-confirmation screenshot (or take a photo
              of a physical ticket). GigTrotter parses the image automatically,
              extracts the event details, and adds it to your wallet as a
              private pin on your map. You can also add events manually if you
              prefer.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              Every pin has an audience — Vault, Inner Circle, Friends, or Open
              — so you decide who, if anyone, can see it. Future events are
              never visible beyond your Inner Circle, enforced at the database
              level.
            </p>
          </DetailSection>

          <DetailSection title="Is my data private?">
            <p className="text-sm leading-relaxed">
              Yes. Every pin has an audience you control. The default is{" "}
              <strong>Inner Circle</strong> (your closest connections). Future
              events are never visible beyond your Inner Circle — this rule is
              enforced in the database, not just the UI, so there is no setting
              that can accidentally expose an upcoming event.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              We do not sell your data or serve behavioural advertising. For the
              full picture, see our{" "}
              <Link href="/privacy" className="text-secondary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </DetailSection>

          <DetailSection title="Why didn't my ticket scan correctly?">
            <p className="text-sm leading-relaxed">
              Parsing is automated and can occasionally misread a ticket — for
              example if the image is dark, blurry, or uses an unusual layout.
              Every capture is shown to you for review before you save it, so
              you can correct any field on the spot.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              If a scan fails entirely, try re-cropping the image to focus on
              the key details, or retake the photo in better light. You can
              also edit dates and event details at any time from the item page
              after saving.
            </p>
          </DetailSection>

          <DetailSection title="How do I add friends?">
            <p className="text-sm leading-relaxed">
              Open the <strong>Friends</strong> panel in the sidebar and use
              the add-by-username field. Once both users have accepted, you
              become bilateral friends and can see each other&apos;s
              Friends-audience pins.
            </p>
          </DetailSection>

          <DetailSection title="How do I export or delete my data?">
            <p className="text-sm leading-relaxed">
              Go to <strong>Settings → Your data</strong>. From there you can:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>
                <strong>Export data (JSON)</strong> — downloads everything you
                own in a machine-readable file.
              </li>
              <li>
                <strong>Delete account</strong> — permanently and irreversibly
                erases all your data within 30 days.
              </li>
            </ul>
          </DetailSection>

          <DetailSection title="What does GigTrotter cost?">
            <p className="text-sm leading-relaxed">
              GigTrotter is free. An optional <strong>GigTrotter+</strong>{" "}
              perks membership may come later, but the core capture-and-map
              experience stays free. We&apos;re currently in testing — no payment
              is required.
            </p>
          </DetailSection>

          <DetailSection title="Which platforms are supported?">
            <p className="text-sm leading-relaxed">
              The web app is available now. Native iOS and Android apps are on
              the way — sign up to hear when they launch.
            </p>
          </DetailSection>

          <DetailSection title="Still stuck?">
            <p className="text-sm">
              Email us at{" "}
              <a
                href="mailto:hello@gigtrotter.app"
                className="text-secondary hover:underline"
              >
                hello@gigtrotter.app
              </a>{" "}
              and we&apos;ll get back to you within a couple of days.
            </p>
          </DetailSection>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          Still have questions?
        </h2>
        <p className="mt-3 text-muted-foreground">
          We&apos;re a small team and we actually read every email. Don&apos;t be a
          stranger.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild variant="outline" size="lg">
            <a href="mailto:hello@gigtrotter.app">Email us</a>
          </Button>
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
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/support" className="hover:text-foreground">Support</Link>
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
