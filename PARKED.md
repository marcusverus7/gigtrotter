# Parked — needs Mark's input

Things I can't decide or do without you. Ranked by what blocks the most downstream work.

> **Repo:** https://github.com/marcusverus7/gigtrotter (private). CI green on `main`.

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

## ⚠ iOS builds are currently failing — `MATCH_PASSWORD`

Every `iOS Build & Upload` run since **2026-06-25** has failed at the signing step:

```
[!] Invalid password passed via 'MATCH_PASSWORD'
```

The `MATCH_PASSWORD` GitHub secret doesn't match the passphrase the fastlane
match certificates repo was encrypted with, so signing never starts.

- **Last successful build: 2026-06-17 → TestFlight build 14.** That is still the
  only binary testers have.
- **Consequence:** the branded **app icon** (25 Jun) and **splash screen** (1 Jul)
  are committed but have *never* shipped to a device. They land on the next
  successful build.
- **Not affected:** anything web. The Capacitor shell loads the live site, so all
  web changes reach existing testers on build 14 without a rebuild.
- **Fix:** update the `MATCH_PASSWORD` repo secret to the match repo's real
  passphrase, then re-run the workflow. (Only Mark can set this.)

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
