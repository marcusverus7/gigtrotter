# ADR-0001: how the iOS and Android apps are built for the pilot

Status: proposed, 2 November 2026. Decision owner: Mark Loughran.

## Context

The web app is a server-rendered Next.js 15 application on Vercel with
Supabase auth, server actions and Mapbox. It cannot be statically exported.
The current iOS and Android apps are Capacitor 8 shells whose configuration
(`capacitor.config.ts`) sets `server.url` to `https://gigtrotter.vercel.app`:
the native binary carries a minimal `ios-shell/www` splash and then loads the
live site in a web view. One web deploy therefore updates all three
platforms at once, which is the repository's parity rule (CLAUDE.md).

That arrangement has consequences that the earlier review flagged and that
the ticketing pilot makes concrete:

- **No independent offline start.** With no network the shell shows whatever
  WKWebView shows for a failed load, not a GigTrotter screen, and no ticket.
  A buyer whose phone drops signal at the door has nothing to show.
- **No offline ticket.** The issued QR code is rendered by the server page.
  README and the item page used to describe an "offline ticket" and "shown
  live in the native app only"; neither is true today. The copy has been
  corrected to say so.
- **Apple review risk.** Guideline 4.2 (minimum functionality) treats an app
  that is only a wrapped website as rejectable. The shell has no native
  capability of its own today (no push, no camera plugin, no offline data).
- **Camera scanning.** The door scanner uses the browser `BarcodeDetector`,
  which iOS WebKit does not provide, so on iPhone the scanner falls back to
  typing the short code. That works but is slower on a busy door.
- **Sign-in and return links.** OAuth and Stripe Checkout both leave the web
  view and return by URL. Inside a Capacitor shell that return must be
  routed back into the app, which has not been tested on a device.

None of this was verified on a physical device during this work. The shells
were last exercised by TestFlight testers before ticketing existed.

## Options

### A. Web-first pilot; keep the remote-URL shell for existing testers

Nothing changes in the native projects. The pilot runs on the web app in any
phone browser; TestFlight testers keep using the shell, which loads the same
site.

Needs: nothing new. Honest copy (done): the web app is the product, the apps
are in closed testing, there is no offline ticket.

Gives: every ticketing fix ships with a web deploy; the door scanner works on
Android Chrome with the camera and on iPhone by typed code; buyers without
the app still have their ticket in the browser.

Does not give: offline start, offline ticket, push, native camera on iPhone,
a store listing that would pass 4.2.

Estimate: 0 engineering days. Risk is confined to the web app, which is the
thing being tested anyway.

### B. Capacitor shell with bundled fallback, native camera plugin and push

Keep `server.url` (the app cannot be exported), but add what a store review
and a door need:

1. A bundled offline page in `ios-shell/www` that the shell shows when the
   remote site fails to load, with the last-known upcoming ticket codes
   cached on device (Capacitor Preferences or SQLite) and rendered as QR
   locally. The web app writes the cache through a small Capacitor bridge
   when a ticket is viewed.
2. `@capacitor-community/barcode-scanner` or `@capacitor/camera` so the
   iPhone scanner reads QR codes natively, selected at runtime when the
   bridge is present.
3. `@capacitor/push-notifications` for alerts while the app is closed.
4. Universal links / App Links so Stripe and OAuth return into the app.

Needs: a new native build for every bridge change (not a web deploy), the
Apple and Google push setup, device testing on at least one iPhone and one
Android phone, the App Store screenshots and review notes.

Gives: a defensible 4.2 answer (offline tickets, camera, push are native),
an offline ticket for buyers, a faster iPhone door.

Estimate: roughly 2 to 3 weeks of evenings plus one review cycle per store.
The offline ticket cache is the only piece with data-safety implications: it
must store only the holder's own codes, encrypted at rest by the OS, and be
cleared on sign-out.

### C. Full native client (Expo or Swift/Kotlin)

Rebuild the product's screens natively against the same Supabase backend.

Needs: a second codebase, duplicate work for every feature, a new release
process. Breaks the one-codebase parity rule unless every feature is built
twice in the same change.

Estimate: months. Not justified by anything the pilot needs.

## Decision

**A for the pilot. B is the next gate, started only once the first paid gig
has run on the web.**

The pilot's job is to prove that a promoter can sell, a buyer can pay and a
door can scan. All three are web capabilities and all three are unverified
with real money. Spending native engineering before that is proven buys
nothing the pilot needs, and the copy now says plainly that the apps are in
closed testing without an offline ticket.

B is sequenced after the pilot because it is the smallest change that makes
the shells honest to a store reviewer and useful at a door without signal,
and because each of its parts is reversible (the web app must keep working
when the bridge is absent, which is how the pilot runs anyway).

## Consequences

- `capacitor.config.ts` is unchanged by this ADR.
- README and the public pages no longer claim an offline ticket or public
  store availability. The wallet item page's "shown live in the native app
  only" barcode placeholder is a leftover that should be removed with the
  entry-panel work (ENTRY-01).
- Device and store readiness remain **unverified**: cold start, expired
  sessions, Google and Apple sign-in, return from Stripe, camera and typed
  scanning, connectivity loss, safe areas. The native acceptance list in the
  brief (section 10) is the checklist for the B gate and must be run on real
  devices before any public listing.
- Payments inside the shells: the shells load the web checkout, which opens
  Stripe Checkout in the web view. Tickets to real-world events are outside
  Apple's in-app-purchase requirement, but anti-steering and external-link
  rules still apply and have not been reviewed against the current shell.
  Record that review in the B gate.
