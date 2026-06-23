import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GigTrotterMark } from "@/components/brand";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
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
          <FileText className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          The fine print
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          These terms set out the rules for using GigTrotter. They&apos;re written in
          plain English — we want you to actually read them.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Effective date: 23 June 2026 &middot; Last updated: 23 June 2026
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-4">
          <DetailSection title="1. Acceptance of terms">
            <p className="text-sm">
              By accessing or using GigTrotter — whether through the website, the
              iOS app, or any other interface we provide — you agree to be bound
              by these Terms of Service and our{" "}
              <Link href="/privacy" className="text-secondary hover:underline">
                Privacy Policy
              </Link>
              . If you do not agree, please do not use the service. These terms
              form a legally binding agreement between you and GigTrotter Ltd.
            </p>
          </DetailSection>

          <DetailSection title="2. Eligibility">
            <p className="text-sm">
              You must be at least 13 years old to use GigTrotter. By creating
              an account, you confirm that you meet this age requirement. If you
              are between 13 and 18, you confirm that a parent or guardian has
              reviewed and agreed to these terms on your behalf. We do not
              knowingly collect personal information from children under 13; if
              we discover this has occurred we will delete the account promptly.
            </p>
          </DetailSection>

          <DetailSection title="3. The service">
            <p className="text-sm leading-relaxed">
              GigTrotter is a capture-first ticket and travel wallet. You share
              tickets, booking confirmations, and event captures with us; we
              parse them, structure the data, and build a private, personalised
              map and wallet of your live-experience history.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              GigTrotter is <strong>not</strong> a ticket seller, primary-sale
              marketplace, or booking agent. We do not sell tickets to events.
              Any links to ticket providers are provided for convenience only
              (see section 8). We reserve the right to modify, suspend, or
              discontinue any part of the service at any time, with reasonable
              notice where practicable.
            </p>
          </DetailSection>

          <DetailSection title="4. Your account">
            <ul className="list-disc space-y-1 pl-6 text-sm">
              <li>
                You are responsible for all activity that takes place under your
                account, whether or not authorised by you.
              </li>
              <li>
                You must keep your login credentials secure and not share them
                with anyone. Notify us immediately at{" "}
                <a
                  href="mailto:hello@gigtrotter.app"
                  className="text-secondary hover:underline"
                >
                  hello@gigtrotter.app
                </a>{" "}
                if you suspect unauthorised access.
              </li>
              <li>
                Each account is for one individual person. You may not create
                accounts on behalf of others, share a single account between
                multiple people, or operate accounts for commercial bots without
                our prior written consent.
              </li>
            </ul>
          </DetailSection>

          <DetailSection title="5. Your content &amp; licence">
            <p className="text-sm leading-relaxed">
              You retain full ownership of any captures, images, text, and other
              content you upload or submit to GigTrotter (&quot;Your Content&quot;).
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              By uploading Your Content, you grant GigTrotter Ltd a limited,
              non-exclusive, royalty-free, worldwide licence to store, process,
              and display Your Content solely for the purpose of providing the
              service to you. This licence ends when you delete the content or
              close your account.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              You confirm that you have the right to upload Your Content and
              that it does not infringe any third-party intellectual property,
              privacy, or other rights.
            </p>
          </DetailSection>

          <DetailSection title="6. Acceptable use">
            <p className="mb-2 text-sm">You must not use GigTrotter to:</p>
            <ul className="list-disc space-y-1 pl-6 text-sm">
              <li>Upload, share, or process illegal content of any kind.</li>
              <li>
                Scrape, crawl, or otherwise extract data from GigTrotter by
                automated means without our prior written consent.
              </li>
              <li>
                Upload personal or identity documents belonging to other people
                (e.g. other people&apos;s passports, payment cards, or tickets you
                do not hold).
              </li>
              <li>
                Resell, sublicense, or provide access to the service to third
                parties.
              </li>
              <li>
                Attempt to circumvent, defeat, or exploit our security controls,
                row-level security policies, or access controls.
              </li>
              <li>
                Harass, threaten, or impersonate other users or GigTrotter
                staff.
              </li>
              <li>
                Use the service in any way that violates applicable law,
                including data protection and consumer protection legislation.
              </li>
            </ul>
          </DetailSection>

          <DetailSection title="7. Ticket parsing &amp; accuracy">
            <p className="text-sm leading-relaxed">
              GigTrotter uses automated processing, including AI-assisted
              parsing, to extract structured data from the captures you share
              with us. This parsing is provided <strong>&quot;as is&quot;</strong> and may
              be inaccurate, incomplete, or out of date.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              <strong>
                You are solely responsible for verifying all event details —
                including dates, times, venues, and ticket validity — directly
                with the relevant event organiser or ticket provider before
                travelling to or relying on any event.
              </strong>{" "}
              GigTrotter accepts no liability for losses arising from inaccurate
              parsing results.
            </p>
          </DetailSection>

          <DetailSection title="8. Third-party ticket providers">
            <p className="text-sm leading-relaxed">
              GigTrotter may display links to or information about third-party
              ticket sellers and event platforms (such as Ticketmaster, Skiddle,
              Eventbrite, and others). These links are provided for your
              convenience only. Any purchase you make through a third-party
              platform is governed entirely by that provider&apos;s own terms and
              conditions; GigTrotter is not a party to and accepts no
              responsibility for those transactions, including any issues with
              ticket delivery, refunds, or event cancellations.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              GigTrotter may receive an affiliate commission on purchases made
              through some links. This does not affect the price you pay.
            </p>
          </DetailSection>

          <DetailSection title="9. Subscriptions &amp; purchases">
            <p className="text-sm leading-relaxed">
              The core GigTrotter service is currently provided free of charge.
              During any testing or beta period, all features remain free and no
              payment is required.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              We may in the future offer an optional &quot;GigTrotter+&quot; subscription
              or other paid features. Before any paid feature is activated, we
              will clearly show you the price, billing frequency, and renewal
              terms. Subscriptions will auto-renew until cancelled and are
              managed through your Apple App Store or Google Play account
              settings. You may cancel at any time through your app store account.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              Refunds for in-app purchases are subject to the relevant app
              store&apos;s refund policy.
            </p>
          </DetailSection>

          <DetailSection title="10. Intellectual property">
            <p className="text-sm leading-relaxed">
              The GigTrotter name, logo, brand assets, and software (including
              all source code, design, and content created by us) are owned by
              or licensed to GigTrotter Ltd and are protected by intellectual
              property law. You may not use, reproduce, or distribute them
              without our prior written permission.
            </p>
          </DetailSection>

          <DetailSection title="11. Disclaimers">
            <p className="text-sm leading-relaxed">
              The GigTrotter service is provided <strong>&quot;as is&quot;</strong> and{" "}
              <strong>&quot;as available&quot;</strong>, without warranty of any kind,
              express or implied. We do not warrant that the service will be
              uninterrupted, error-free, secure, or free of viruses or other
              harmful components. We reserve the right to take the service
              offline for maintenance without notice, though we will endeavour
              to give advance warning where possible.
            </p>
          </DetailSection>

          <DetailSection title="12. Limitation of liability">
            <p className="text-sm leading-relaxed">
              To the fullest extent permitted by applicable law, GigTrotter Ltd
              shall not be liable for any indirect, incidental, special,
              consequential, or punitive losses — including loss of profits, data,
              goodwill, or other intangible losses — arising out of or in
              connection with your use of (or inability to use) the service.
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              Nothing in these terms excludes or limits liability that cannot be
              excluded or limited under applicable law, including liability for
              death or personal injury caused by negligence, fraud or fraudulent
              misrepresentation, and any rights you have as a consumer under the
              Consumer Rights Act 2015 or other applicable consumer protection
              legislation.
            </p>
          </DetailSection>

          <DetailSection title="13. Termination">
            <p className="text-sm leading-relaxed">
              You may delete your account at any time from within the app. On
              deletion, your personal data and content will be permanently
              removed within 30 days in accordance with our{" "}
              <Link href="/privacy" className="text-secondary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              GigTrotter Ltd reserves the right to suspend or terminate your
              account, with or without notice, if we reasonably believe you have
              breached these terms, engaged in fraudulent activity, or used the
              service in a way that may cause harm to us, other users, or third
              parties. Where we terminate an account without cause, we will give
              you reasonable notice.
            </p>
          </DetailSection>

          <DetailSection title="14. Changes to these terms">
            <p className="text-sm leading-relaxed">
              We may update these terms from time to time to reflect changes to
              our service, applicable law, or our business practices. We will
              communicate material changes via in-app notification or email at
              least 14 days before they take effect. Your continued use of
              GigTrotter after the effective date of any updated terms
              constitutes your acceptance of those changes. If you do not agree
              to the updated terms, you should stop using the service and may
              delete your account.
            </p>
          </DetailSection>

          <DetailSection title="15. Governing law">
            <p className="text-sm leading-relaxed">
              These terms are governed by and construed in accordance with the
              laws of England and Wales. Any disputes arising out of or in
              connection with these terms shall be subject to the exclusive
              jurisdiction of the courts of England and Wales, without prejudice
              to any mandatory consumer protection rights you may have under the
              law of your country of residence.
            </p>
          </DetailSection>

          <DetailSection title="16. Contact">
            <p className="text-sm">
              For questions about these terms, please email{" "}
              <a
                href="mailto:hello@gigtrotter.app"
                className="text-secondary hover:underline"
              >
                hello@gigtrotter.app
              </a>
              .
            </p>
          </DetailSection>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          Simple rules. Serious about live music.
        </h2>
        <p className="mt-3 text-muted-foreground">
          If you have any questions about these terms, we&apos;re always happy to
          chat — just drop us a line.
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
