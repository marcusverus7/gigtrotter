# GigTrotter

**The wallet that remembers.** A capture-first ticket & travel wallet that builds a private life map automatically.

> Your tickets, flights and bookings live here — and every one of them quietly becomes a pin on a beautiful, private map of your life that you can share on your terms: with your inner circle, with friends, with everyone, or anonymously.

This repo is built from the **Strategic Plan & Build Brief v3.0** (capture-first concept). Manual entry was the silent killer of v2; v3 inverts it — the app earns its place on the home screen by holding the things you already need, and the map assembles itself.

## Concept in one line

Parse anything → confirm attendance → render it beautiful → share it safely. The capture-to-memory pipeline is the moat.

## Stack

- **Next.js 15** (App Router) · TypeScript · Tailwind · shadcn/ui · Framer Motion
- **Supabase** — Postgres + Auth + Storage + RLS + Edge Functions
- **Mapbox GL JS** — the Travel Board globe
- **Claude API (vision)** — the parsing pipeline
- **Resend / Postmark** inbound — the forwarding address
- **Vercel** · **Sentry** · **PostHog**

Design direction: **Dark-Map Premium** — base slate-950, accent violet-600, secondary cyan-500, Inter + Geist Mono. Visit [`/design`](http://localhost:3000/design) for the living system.

## Privacy architecture (not a settings page)

1. **Circles** — every pin carries an audience: `Vault` → `Inner` → `Friends` → `Open`. Default is Inner.
2. **The time-shift rule (safety-critical)** — future events are never visible beyond Inner Circle. Enforced in **row-level security on `ends_at`**, not in the UI. `'I will be at X on date Y'` is stalking fuel; `'my house is empty'` is burglary fuel. This rule removes the worst risk class in the concept.
3. **The anonymous board** — `gigtrotter.com/b/<hash>`. City-fuzzed pins, revocable in one tap, view-counted. Proves the life without exposing the pattern.
4. **The redaction engine** — source captures encrypted at rest; sharing renders a clean branded card from structured data, never the source screenshot. QR codes, booking refs, names and seat numbers physically cannot leak. Identity documents are dropped at parse — GigTrotter is deliberately **not** a document vault.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in keys (see below)
pnpm dev                     # http://localhost:3000
```

The app degrades gracefully without keys: the landing page and `/design` run with nothing configured. Auth needs Supabase; the globe needs a Mapbox token; capture parsing needs an Anthropic key.

### Environment

See [`.env.example`](.env.example). Minimum to run auth + capture locally:

| Var | What it's for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Auth, DB, storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Inbound webhook, server-side parse writes |
| `ANTHROPIC_API_KEY` | Vision parsing pipeline |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | The Travel Board globe |
| `CAPTURE_MASTER_KEY` | Envelope encryption for source captures |
| `INBOUND_WEBHOOK_SECRET` | Auth for the forwarding-address webhook |

### Database

Migrations live in [`supabase/migrations`](supabase/migrations). With the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push       # apply migrations (incl. RLS + the time-shift rule)
```

The schema is RLS-first. See [`docs/SCHEMA.md`](docs/SCHEMA.md) for the table map.

## Build phases

MVP is phases 0–7 (six-to-eight weeks of evenings, twenty users). Each phase ends demoable.

| Ph | Title | Status |
| --- | --- | --- |
| 0 | Foundation — scaffold, design tokens, `/design`, CI | ✅ |
| 1 | Auth, profile, circles + RLS (time-shift rule) | ✅ |
| 2 | Capture pipeline — image → Claude vision → confirm card | ✅ |
| 3 | The Wallet — countdowns, lifecycle, offline ticket | ✅ |
| 4 | The Travel Board — Mapbox globe, pin popover | ✅ |
| 5 | Stats + anonymous board + share cards | ✅ |
| 6 | Backfill scan + rapid manual add | ✅ |
| 7 | Friend connection + polish + ship | ✅ |
| 8–11 | V1 — morning-after, geofence, Night Mode, inbox sync, alerts | planned |

> **Sequencing note.** Phase 2 (the capture pipeline) comes before any map work on purpose: it is the riskiest engineering and the core of the concept. De-risk the moat first.

## What's deliberately not here

No Ticketmaster purchase API (none exists for consumers). No identity-document vault (a honeypot with zero product upside). No banner ads, no selling location/travel data, no paywalled capture — ever.

---

Built with Claude Code. See [`docs/`](docs) for architecture notes.
