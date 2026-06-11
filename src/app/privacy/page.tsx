import Link from "next/link";

import { GigTrotterMark } from "@/components/brand";

/**
 * Plain-English data page (§11.2). Never ask for anything before the user has
 * seen the payoff — and tell them what we do and don't do, in their words.
 */
export default function PrivacyPage() {
  return (
    <main className="bg-aurora min-h-screen">
      <header className="container py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
      </header>
      <article className="container max-w-2xl space-y-6 pb-24">
        <h1 className="text-3xl font-bold tracking-tight">
          The privacy promise
        </h1>
        <p className="text-muted-foreground">
          Privacy here is architecture, not a settings page. This page tells
          you, in plain English, what we hold and what we never will.
        </p>

        <Section title="What we hold for you">
          <ul className="list-disc space-y-1 pl-6 text-sm">
            <li>The captures you share with us, encrypted at rest.</li>
            <li>
              The structured parse of each capture — event, date, place — so the
              wallet and map can render.
            </li>
            <li>
              Your profile, your friend graph, your anonymous handle and view
              count.
            </li>
          </ul>
        </Section>

        <Section title="What we drop on the way in">
          <ul className="list-disc space-y-1 pl-6 text-sm">
            <li>Passport numbers.</li>
            <li>Payment details and loyalty numbers.</li>
            <li>
              Anything that looks like an identity document. GigTrotter is
              deliberately not a document vault.
            </li>
          </ul>
        </Section>

        <Section title="What we never share or sell">
          <ul className="list-disc space-y-1 pl-6 text-sm">
            <li>Your location history. Ever.</li>
            <li>Your travel data. Ever.</li>
            <li>Your friend graph.</li>
          </ul>
        </Section>

        <Section title="The time-shift rule">
          <p className="text-sm">
            Future events are never visible beyond your Inner Circle. Past
            events follow whatever audience you set. This is enforced in the
            database, not in the UI — there is no setting that turns it off.
          </p>
        </Section>

        <Section title="The anonymous board">
          <p className="text-sm">
            Your public board (<code>/b/your-handle</code>) shows city-level
            pins only — exact venues are blurred to the city centroid and
            dates are blurred to month. You can revoke the link in one tap, and
            regenerating creates a new hash that breaks any link that was
            shared.
          </p>
        </Section>

        <Section title="Your data, your call">
          <p className="text-sm">
            Export everything in JSON, anytime. Delete the account, anytime.
            We&apos;ll cascade through every row that belongs to you.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
