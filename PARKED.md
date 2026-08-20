# Parked — needs Mark's input

Things I can't decide or do without you. Ranked by what blocks the most downstream work.

> **Repo:** https://github.com/marcusverus7/gigtrotter (private). CI green on `main`.

## 🔴 BLOCKING THE CORE FEATURE — Vercel `ANTHROPIC_API_KEY` is invalid

Verified end-to-end against production on **2026-07-27**. Every capture a tester
uploads is being rejected:

```
model_error: 401 {"type":"authentication_error","message":"invalid x-api-key"}
request_id: req_011CdU7ETyKdPoDMrTYKLXqB
```

The capture row is written with `status='rejected'`, `confidence=0` and the
placeholder title *"Couldn't read this one"* — so the app degrades gracefully,
but **screenshot → wallet does not work in production at all.**

The key in `.env.local` is valid (it just completed 72 live vision calls at 94.9%
field accuracy). Only Vercel's copy is stale.

**Fix:** Vercel → gigtrotter → Environment Variables → edit `ANTHROPIC_API_KEY`
(currently scoped *Production and Preview*, added Jun 23) → paste the working key
→ **redeploy**. Then re-run the E2E below to confirm.

**How to re-verify** (no login needed — server-to-server via the inbound webhook):

1. `POST https://gigtrotter.vercel.app/api/inbound` with header
   `x-webhook-secret: $INBOUND_WEBHOOK_SECRET` and body
   `{"to":"<anon_handle>@capture.gigtrotter.example","attachments":[{"name":"t.png","contentType":"image/png","content":"<base64 png>"}]}`
   → expect `{"ok":true,"captureId":"…"}`.
2. Read the row back with the service key:
   `GET /rest/v1/captures?id=eq.<captureId>&select=status,confidence,error,parse_json`
   → a healthy parse is `status='parsed'` with confidence ~0.95, not `rejected`.

Handles for testing live in `profiles.anon_handle`. Note this writes a real
capture into that user's pending queue — dismiss it afterwards.

## 🔴 Migration `0012_fingerprint_cache_privacy.sql` — apply with 0011

Security fix, committed but **not applied**. `vendor_fingerprints` stores whole
capture parses (title, venue, `details[]` like *"seat 12A"*) with no `user_id`
and a `for select using (true)` policy — so any caller with the public anon key
(which ships in the client bundle) can read every user's capture data. Verified
against production: an anonymous read returned **200, not 403**.

**Nothing has leaked** — the table is empty (0 rows) because captures have been
failing on the invalid API key, so nothing was ever cached. That also means
applying this costs no data migration. **Apply it before fixing the Anthropic
key**, otherwise the first successful capture starts populating a
world-readable table.

## 🔴 Marketplace launch blocker — face value is self-declared

The anti-scalper rule is a real DB constraint
(`check (asking_price_cents <= face_value_cents)`, migration 0006 line 112), but
**`face_value_cents` comes straight from the client**. `createListing` verifies
the seller owns the wallet item, that it's a ticket, and that it's still
`going` — it never consults what the ticket actually cost.

So the cap is satisfied by declaring a higher face value. A £50 ticket listed as
*face value £500, asking £500* passes the constraint, under a banner promising
scalping is impossible. **The marketplace's entire differentiator is currently
cosmetic.**

Not exploitable today: the marketplace is behind `SHOW_UNLAUNCHED` and Stripe
Connect isn't wired, so no money can move. But this must be fixed **before** any
launch.

Options, roughly in order of strength:

1. **Derive face value from the capture.** The ticket image usually shows the
   price. The parser doesn't extract it today (`price_total`/`currency` are
   listed as unscored-by-design in `eval/README.md`) — adding them to
   `ParsedCaptureSchema` and the prompt would let the listing cross-check the
   declared value against the artefact it came from.
2. **Cap against a per-event ceiling** sourced from the events pipeline.
3. **Manual review** of listings above a threshold.

Copy was overclaiming and has been corrected: the marketplace page and listing
form now say asking price can't exceed *the face value you enter*, rather than
implying scalping is structurally impossible. Restore the stronger wording once
one of the options above lands.

## Migration `0013_discussion_photos_bucket.sql` — apply before revealing Events

Discussion photo upload is broken two ways (found 2026-07-27, not yet
user-visible because discussions sit behind `SHOW_UNLAUNCHED`):

- The upload is **denied by RLS**. The `captures` policy requires the first path
  segment to be the caller's uid, but the code wrote `discussions/<uid>/…`, so
  the check could never pass.
- The returned URL is **dead**. `captures` is private (correctly — encrypted
  source artefacts), so `getPublicUrl` builds an `/object/public/…` link that
  answers **400**.

0013 adds a public `discussion-photos` bucket mirroring the `avatars` policy
shape, and the code now leads the path with the uid. Apply alongside 0011/0012.

## Migration `0011_event_moderation.sql` still not applied

Confirmed against production: querying `events.status` returns
`{"code":"42703","message":"column events.status does not exist"}`. Harmless
while Events is hidden from nav (`SHOW_UNLAUNCHED = false`), and
`/app/admin/events` detects 42703 and shows a "run the migration" banner rather
than erroring. Must be applied **before** revealing Events — see the Events
section below for the SQL and why it's safe.

## Email forwarding — needs a real domain (tester-reported bounce, 2026-08-20)

A tester forwarded a ticket email and got a Gmail bounce: `capture.gigtrotter.example`
is a reserved-TLD placeholder — it has no DNS and can never receive mail. The UI
no longer shows an address until `FORWARDING_DOMAIN` names a real domain
(`isForwardingConfigured` in `src/lib/env.ts`); it says "coming soon" instead.

To make the feature real:
1. **Buy a domain** (e.g. gigtrotter.app). None is owned today — the site lives on
   gigtrotter.vercel.app.
2. **Inbound email → webhook.** Cheapest: Cloudflare Email Routing (free) → Worker
   → `POST https://gigtrotter.vercel.app/api/inbound` with the `x-webhook-secret`
   header. Or Resend/Postmark inbound, which POST JSON with base64 attachments in
   exactly the shape `/api/inbound` already accepts (it handles both casings).
3. Set `FORWARDING_DOMAIN=capture.<domain>` in Vercel + `.env.local`, redeploy —
   the address cards light up on their own.

The webhook endpoint itself is proven: it has run the full parse pipeline
server-to-server in production repeatedly. Only the email→webhook hop is missing.

## Brand decisions locked in (no action needed)

- **Brand mark:** original violet→cyan map-pin glyph
- **Tone of voice:** H1 "Where your journey lives." / strapline "The wallet that remembers."
- **Hero direction:** the interactive Three.js globe (option A)
- **Pricing model:** GigTrotter+ is a **perks club** (promoter discounts, VIP, prize draws, marketplace fee waiver). Free tier loses nothing. Revenue: subscriptions + face-value resale marketplace booking fees + affiliate commissions

## Hidden from nav until ready (`SHOW_UNLAUNCHED` flag)

Six surfaces are built but empty (no data / no payments), so they're hidden from
the sidebar + bottom nav to keep the beta feeling finished. Their routes still
work — only nav entries are gated.

- **Flip to reveal:** set `SHOW_UNLAUNCHED = true` in `src/components/app-nav.tsx`.
- **Hidden:** Events, Marketplace, Merch Store, Import, Perks (and the promoter
  event-submit surface).
- **Un-hide each only when its blocker below clears** (events pipeline, Stripe
  Connect, partner perks, import OAuth). Don't reveal the whole set at once.

### Before un-hiding **Events** specifically

- **Apply migration `0011_event_moderation.sql`** first, then verify. It adds an
  `events.status` column and narrows the public-read RLS so user-submitted events
  are held as `pending` until approved (stops any user publishing / claiming
  promoter powers on an event). The submit action already writes `status:
  'pending'`; without the migration applied, manual submit will error — which is
  fine while Events is hidden, but must be applied before reveal.
- The **admin approve/reject UI** is built: `/app/admin/events` lists everything
  awaiting review with Approve / Reject buttons (admin-gated, service-role write).
  Until the migration is applied it shows a "migration not applied" notice rather
  than failing, so it's safe to visit now.

## ⚠ iOS signing: shared Apple team, and how it broke (RESOLVED 2026-07-27)

iOS builds failed from **2026-06-25** to **2026-07-27**. Fixed — but the cause
lives in *other repos*, so read this before touching any iOS pipeline.

**Root cause: distribution certificates are team-wide, not per-app.** Apple team
`JQS67937W6` is shared by GigTrotter, Mezo, Klert, ToneScout, Grimoire and
Skyline. Two sibling pipelines — `klert/ios-release.yml` and
`tonescout/ios-build.yml` — had a "Create distribution certificate" step that
issued `DELETE /v1/certificates` for **every** `DISTRIBUTION` cert in the account
before minting a fresh one for themselves. Each of their builds therefore
destroyed GigTrotter's signing identity. Nothing in GigTrotter's own logs could
reveal this.

Symptoms seen here, in order:

1. `[!] Invalid password passed via 'MATCH_PASSWORD'` — a *secondary* effect. A
   ToneScout match run had also overwritten `gigtrotter-certs` with ToneScout's
   assets, encrypted with ToneScout's passphrase.
2. After clearing that repo: `Could not create another Distribution certificate,
   reached the maximum number of available Distribution certificates.`

**What was done:** cleared `gigtrotter-certs` (history preserved), revoked the
orphaned distribution cert in the Apple portal, re-ran → green. The repo now
holds GigTrotter's own cert plus `AppStore_com.gigtrotter.app.mobileprovision`.

**Guarding against recurrence:** PRs raised to stop both siblings revoking —
`marcusverus7/tonescout#2` and `marcusverus7/klert#5`. **Until those merge, any
Klert or ToneScout iOS build will revoke GigTrotter's certificate again.**

**Proper long-term fix:** put every app on fastlane match against one shared
certificates repo, so all six reuse a single distribution certificate (private
key available to each build) with per-app provisioning profiles. Certificates are
team-wide; profiles are per-app.

**Note:** web is never affected by any of this. The Capacitor shell loads the
live site, so web changes reach existing testers without a rebuild — only native
assets (icon, splash) need a successful build.

## Blocks deploy

1. **Supabase project keys** — drop URL + anon + service-role into `.env.local`
2. **Anthropic API key** — capture parsing
3. **Mapbox token** — Travel Board globe + venue autocomplete
4. **Vercel project** — link and pull env

## Marketplace (Phase 9)

5. **Stripe Connect setup** — for the face-value resale marketplace.
   - Stripe Connect platform account (one-time)
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_ACCOUNT` in `.env.local`
   - Settle booking-fee % with finance before launch — currently 7.00% (`fee_bps = 700`)
   - Identity-verification flow for sellers (Stripe handles via Connect)

## Merch Store

The merch store schema, UI, order flow, and gig-linked promotion are all built. To go live:

- **Same Stripe Connect account** as the marketplace — merch payments use the same platform account.
- Artist/promoter onboarding: sellers need Stripe Connect onboarding (same as marketplace sellers).
- **Merch image uploads** — currently `images text[]` stores URLs. Wire to Supabase Storage `captures` bucket under `merch/` prefix when ready.
- **QR code rendering** — the `collection_code` is generated and shown as text. Swap to a proper QR code library (e.g. `qrcode.react`) for scannable venue pickup.
- **Shipping rates** — `shipping_cents` defaults to 0. Integrate a shipping rate API or set flat rates per seller.
- **Drop automation** — `merch_drop_status` is manual. Add a cron/edge function to flip `upcoming→live→ended` based on `opens_at`/`closes_at`.

## Import + integrations (V1)

Each unlocks one source card on `/app/import`. All envs documented in `.env.example`.

6. **Spotify OAuth** — `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`. Register at developer.spotify.com.
7. **Setlist.fm API key** — `SETLISTFM_API_KEY`. Free tier fine.
8. **Songkick API key** — `SONGKICK_API_KEY`. Apply at developers.songkick.com.
9. **Bandsintown app id** — `BANDSINTOWN_APP_ID`. Free tier.
10. **Last.fm API key** — `LASTFM_API_KEY`. Free.
11. **Eventbrite OAuth** — `EVENTBRITE_CLIENT_ID` + `EVENTBRITE_CLIENT_SECRET`. Register at eventbrite.com/platform.

## Pre-launch (per the §14 plan checklist)

12. **The parse corpus** — 50+ real screenshots into `eval/captures/`. The single highest-leverage prep task in v3.
13. **Trademark clearance** on GigTrotter (UK/EU/US, ~£300–800).
14. **Google CASA paperwork** — for Gmail restricted scopes (live inbox sync, V1+).
15. **Forwarding-domain DNS** — point an MX at Resend/Postmark. Domain not picked yet (see decisions below).
16. **Apple/Google OAuth providers** — configure in Supabase Auth.
17. **Launch event pick** — the summer 2026 gig/festival that seeds your twenty users.

## Pricing UI defaults (override anytime)

- "Join the waitlist" CTA + "Coming with V1" labels on every Pro touchpoint. No price displayed yet — we hold pricing until we've signed partner perks worth the number.

## Decisions I defaulted on (override any time)

- **Inbound provider:** Resend (cleaner DX than Postmark) — webhook accepts both shapes
- **Capture encryption:** envelope encryption — per-user HKDF key + master in `CAPTURE_MASTER_KEY`. Rotation noted in `docs/SECURITY.md`
- **Anon handle format:** adjective-noun-NNN (13M combinations)
- **Default circle:** Inner Circle for every new pin
- **Marketplace booking fee:** 7.00% buyer-side (`fee_bps=700` per listing — overridable per listing)

## Social Hub / Events Discovery

The events schema, browse/search UI, detail page, social features (interested/going, friend overlap), ticket provider links with click tracking, and internal admin metrics dashboard are all built. To go live:

- **Event data pipeline** — events are currently an empty table waiting for data. Wire up external API syncs:
  - Songkick, Bandsintown, Eventbrite, RA APIs (keys listed in Import section above)
  - Cron job or edge function to sync events periodically
  - Manual promoter submission form (promoter_id on events table supports this)
- **Geo search** — PostGIS `ST_DWithin` queries need the PostGIS extension enabled in Supabase (`create extension postgis`)
- **Ticket affiliate links** — currently `is_affiliate` is a flag on `event_ticket_links`. Sign affiliate agreements with providers, then set the flag and swap URLs to tracked affiliate links.
- **Admin dashboard** — at `/app/admin/metrics`, gated to markloughran7@gmail.com. Shows clicks by provider (total, 7d, 30d), top events, daily trend. Use this data to pitch partnerships: "We sent X clicks to Ticketmaster last month."

## Down the line

- **Capture pipeline refinement with Fable 5** — the parser prompt (`src/lib/capture/prompt.ts`), pipeline architecture (`src/lib/capture/pipeline.ts`), and complex RLS policies were built with Sonnet. A targeted rewrite of just these files with Fable 5 could improve edge-case handling in vision parsing, PII detection robustness, and encryption flow. Not a full rebuild — only the hard, multi-file capture pipeline work where the premium model adds real value. Do this after testing with real screenshots to learn what actually fails first.

## Still open (lower priority)

- **Forwarding-address domain** — pick one: `capture.gigtrotter.com` / `tickets.gigtrotter.com` / `gt.email` / `wallet.gt`
- **Scope timing** for Group trips / Festival mode / Browser extension — start, defer or drop each
- **Mobile native (Expo) path** — start now / after 20 web users / after cost ceiling kicks in
