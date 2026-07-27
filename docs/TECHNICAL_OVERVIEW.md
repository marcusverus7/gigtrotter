# GigTrotter — Technical Architecture Overview

> **A capture-first live-music wallet with an AI vision pipeline.**
> A cross-platform product built on one Next.js codebase: screenshots of tickets
> become structured, validated records and pins on a private life map — parsed by
> a multimodal LLM behind a schema, an evaluation harness, and a human
> confirmation step.

| | |
|---|---|
| **Surface** | Web · iOS · Android (one codebase) |
| **Stage** | Closed TestFlight beta |
| **Core loop** | Capture → Wallet → Map |
| **AI role** | Vision extraction + evaluation |
| **Stack** | Next.js 15 · React 19 · TypeScript 5.7 · Supabase (Postgres + RLS) · Claude vision · Capacitor · Vercel + GitHub Actions |

---

## Contents

1. [System overview & product thesis](#1-system-overview--product-thesis)
2. [Cross-platform architecture](#2-cross-platform-architecture)
3. [Technology stack](#3-technology-stack)
4. [The AI capture pipeline](#4-the-ai-capture-pipeline)
5. [Model evaluation harness](#5-model-evaluation-harness)
6. [Data model & the RLS security boundary](#6-data-model--the-rls-security-boundary)
7. [Privacy & data governance](#7-privacy--data-governance)
8. [Platform compliance](#8-platform-compliance)
9. [Delivery, CI/CD & quality gates](#9-delivery-cicd--quality-gates)
10. [Review methodology & auditor lens](#10-review-methodology--auditor-lens)

---

## 1. System overview & product thesis

GigTrotter is *"the wallet that remembers."* A user forwards or screenshots a
ticket, flight, or booking; the app extracts the details automatically and turns
each confirmed item into a private map of everywhere they've been. The product
bet is that **capture friction is the whole game** — if adding a memory costs one
screenshot instead of a form, the collection compounds on its own.

The engineering consequence of that bet is an **AI extraction pipeline that has
to be trustworthy**: a model reads an arbitrary image and its output becomes
durable user data. That single requirement drove most of the architecture below
— structured output, schema validation, a typed failure taxonomy, a reproducible
evaluation corpus, and a mandatory human confirmation step before anything is
written.

> **Why this doc leads with the AI system.** The parser is the one place where a
> probabilistic model touches a system of record. Everything an AI auditor would
> ask — how is output constrained, how is accuracy measured, what happens on
> failure, where is the human — is answered by design here rather than bolted on.

---

## 2. Cross-platform architecture

There is **one codebase** — the Next.js web application. The iOS and Android apps
are thin **Capacitor shells** that load the live production site in a native web
view. A single web deploy therefore ships to all three platforms simultaneously,
and they stay behaviourally identical for free.

This is a deliberate trade: it collapses three build targets into one, at the
cost of a documented set of exceptions where the app stores *require* native
divergence (payments, offline barcode display, anti-steering). Those exceptions
are written into the repo's contributor rules so parity is the enforced default,
not an accident.

- **Rendering & mutation.** React Server Components render on the server against
  Supabase; all writes go through typed **Server Actions**, so there is no
  hand-rolled REST layer to keep in sync and auth travels with every call.
- **Native capability boundary.** Anything needing a native plugin — camera,
  push, in-app purchase — is called out as requiring a **new binary**, not just a
  web deploy. Runtime detection of the Capacitor shell gates store-sensitive UI.

---

## 3. Technology stack

Chosen for a small team optimising for type-safety end-to-end and a single deploy
target.

| Layer | Technology | Version | Why |
|---|---|---|---|
| Framework | Next.js (App Router, RSC, Server Actions) | 15.1 | Server-first rendering; one framework for UI + backend |
| Language / UI | TypeScript · React | 5.7 · 19 | Strict typing across data, actions, and components |
| AI | `@anthropic-ai/sdk` — Claude vision | 0.32 | Multimodal extraction; model swappable via env var |
| Data / Auth | Supabase (Postgres, Auth, Storage) via `@supabase/ssr` | 2.47 | Postgres + Row-Level Security as the authz boundary |
| Validation | Zod | 3.24 | Runtime schema validation of model & user input |
| Maps / 3D | Mapbox GL · Three.js / react-three-fiber | 3.9 · 0.171 | Travel-board globe and geospatial pins |
| UI system | Tailwind · Radix UI · CVA · Framer Motion | 3.4 | Token-driven dark design system, accessible primitives |
| Mobile | Capacitor (iOS + Android) | 8.4 | Native shells loading the live site |
| Analytics | PostHog | 1.20 | Product analytics |
| Tooling | pnpm · ESLint 9 · Prettier · tsx | 11 | Typecheck + lint gates; tsx runs the eval harness |

---

## 4. The AI capture pipeline

A capture enters from one of three paths — a shared screenshot, a forwarded
confirmation email, or a camera-roll backfill — and converges on a single
deterministic pipeline. The model call is **one multimodal request constrained to
emit JSON only**; everything around it exists to make that output safe to persist.

```
[ Ingest & sniff ] → [ Vision call ] → [ Parse & coerce ] → [ Schema validate ] → [ Human confirm ] → [ Persist ]
     guardrail          Claude           guardrail             guardrail            human loop        wallet item
   magic-number       image + JSON       fence-strip +        Zod safeParse,      editable confirm    + experience
   MIME typing        contract, capped   JSON.parse           fail closed         card, user approves  (or rejected row)
```

| Step | Stage | What it does |
|---|---|---|
| 01 | **Ingest & sniff** | Bytes typed by magic-number MIME detection (PNG/JPEG/WebP/PDF). Unsupported types rejected before any spend. |
| 02 | **Vision call** | Single Claude request: image + a system prompt and instruction that pin the output to a fixed JSON contract. `max_tokens` capped. |
| 03 | **Parse & coerce** | Defensive code-fence stripping, then `JSON.parse`. Non-JSON output is caught, not crashed. |
| 04 | **Schema validate** | Zod `safeParse` against a typed capture schema. Shape mismatches fail closed with a reason. |
| 05 | **Human confirm** | Extracted fields surface as an editable confirm card. Nothing is written until the user approves. |
| 06 | **Persist** | On approval → a wallet item + experience. On failure → a `rejected` capture row carrying the reason. |

### A typed failure taxonomy, not a boolean

Every failure mode is a named, first-class outcome rather than a generic error.
This is what makes the pipeline auditable — each rejected capture records *why*
the model output could not be trusted:

| Reason | Meaning |
|---|---|
| `model_error` | The provider call itself failed (network, provider-side, rate). |
| `invalid_json` | Output was not parseable JSON after fence-stripping. |
| `schema_mismatch` | Parsed, but did not satisfy the Zod contract. |
| `low_confidence` | Reserved signal for outputs the model itself is unsure of. |

> **Guardrail principle.** The model is treated as an **untrusted input source**.
> Its output passes the same validation posture as any external data: constrain
> the contract, validate at runtime, fail closed with a reason, and never let a
> probabilistic result reach the system of record without a human in the loop.

---

## 5. Model evaluation harness

Extraction accuracy is measured, not assumed. A standalone harness (`pnpm eval`)
runs the parser over a labelled corpus and produces field-level scores —
deliberately decoupled from the server runtime so the scoring logic runs and
unit-tests under plain `tsx`.

**Labelled corpus**
- Synthetic tickets across multiple fictional vendor brands, each with an
  `.expected.json` answer key.
- An **adversarial edge-case set**: top/bottom crops, dark mode, low resolution,
  rotated-with-glare, and multi-ticket images.

**Scoring methodology**
- A field map aligns the rich answer-key schema to the parser's normalised output.
- Dates compared at minute precision; strings compared case- and
  accent-normalised.
- Fields the parser deliberately doesn't extract are marked *unscored*, not
  counted as failures.

> **Privacy-aware metric.** The barcode field is scored on **presence only** —
> the harness checks that the parser detected a barcode exists, never the value.
> That is a data-minimisation decision expressed directly in the evaluation
> contract: the system is measured on doing the privacy-preserving thing correctly.

---

## 6. Data model & the RLS security boundary

Authorization lives in the database. Supabase Postgres **Row-Level Security** is
the primary boundary — not application middleware — so a query is safe by virtue
of the policy, regardless of which code path issues it.

### Audience tiers enforced in SQL

Every shareable record carries an audience tier, and read visibility is a policy,
not a filter the app remembers to apply:

| Tier | Who can see it | Enforced by |
|---|---|---|
| Vault | Owner only — fully private | RLS policy |
| Inner | Closest circle; sees even future items | RLS + time-shift |
| Friends | Mutual friends | RLS policy |
| Open | Public / anonymous board (fuzzed) | RLS policy |

### Least-privilege client separation

Two Supabase clients exist by design. The **session client** honours the caller's
RLS and is used everywhere by default. The **service-role client** bypasses RLS
and is confined to trusted server-only contexts (an inbound email webhook, an
admin surface) — never reachable from a user-driven code path.

### Migrations & correctness patterns

- Schema ships as **versioned SQL migrations** (`0001`→`0011`), reviewable and
  replayable.
- Mutations are ownership-scoped and use `.select()` guards to catch
  silently-blocked writes (the classic silent-RLS-failure trap).
- **Server-side input trust:** outbound-click metrics derive their fields from the
  database and verify the link belongs to the event, rather than trusting
  client-supplied strings — closing a metric-spoofing gap.
- User-submitted events are held `pending` behind a moderation policy before they
  can appear publicly.

---

## 7. Privacy & data governance

The product holds sensitive personal history — where someone was, when, and with
whom — so data minimisation is a design constraint, not a policy page.

- **Barcode never stored.** The parser records only *that* a barcode exists, so a
  scannable ticket code can't leak through a share surface.
- **Fuzzed public identity.** The anonymous board shows city-level, past-only
  pins and is not search-indexed.
- **Time-shifted visibility.** Future plans are visible only to the inner circle;
  the wider graph sees history, not live location.
- **Verifiability without spoofing.** The "verified attendance" badge is driven by
  a server-set flag (geofence / ticket scan / manual), never client-settable.
- **GDPR flows.** Self-serve data export and account deletion; capture payloads
  encrypted at rest.

---

## 8. Platform compliance

Shipping a web-view app to the Apple and Google stores carries specific policy
risk, handled deliberately rather than discovered at review.

- **Anti-steering.** Runtime detection of the native shell hides external-payment
  steering; digital subscriptions route to StoreKit / Play Billing on device,
  Stripe on web — same price, different mechanism.
- **Guideline 4.2.** The app keeps a genuine native capability so it isn't
  rejected as "just a website."
- **Barcode display.** Offline ticket barcodes are intentionally native-only; the
  web shows a placeholder.

---

## 9. Delivery, CI/CD & quality gates

- **Web — continuous deploy.** Vercel deploys from `main` on push. Because the
  mobile apps load the live site, that one deploy reaches web, iOS, and Android at
  once.
- **iOS — built without a Mac.** A GitHub Actions macOS runner builds the
  Capacitor shell and signs via **fastlane match**, uploading to TestFlight with
  an ES256-signed App Store Connect API token.

Every change clears two gates before it ships: `tsc --noEmit` typecheck and
`next lint`. The type system spans the model output, the database access, the
server actions, and the components — so a contract change surfaces as a compile
error, not a runtime surprise.

---

## 10. Review methodology & auditor lens

The codebase is maintained with an audit-first posture. A recent full review ran
across three independent dimensions — **feature/UX inventory**, **design-system
consistency**, and **monetization & logic/security** — with findings triaged by
severity and every remediation verified against the typecheck and lint gates
before merge.

That pass produced concrete, verifiable fixes: a metric-spoofing input-trust
boundary closed server-side, a moderation policy added for user-generated
content, a race-prone counter made self-healing, an App-Store anti-steering gate
added for the native shell, and unfinished surfaces hidden behind a single
feature flag so the beta reflects only what actually works.

### How this maps to an AI-assurance skill set

| Auditor concern | Demonstrated in this system | Status |
|---|---|---|
| LLM output safety | Constrained JSON contract, runtime schema validation, typed failure taxonomy, human-in-the-loop before persistence | ✅ Shipped |
| Model evaluation | Reproducible harness, labelled + adversarial corpus, field-level accuracy, privacy-aware scoring | ✅ Shipped |
| Authorization | Database-enforced RLS, audience tiers, least-privilege service-role isolation | ✅ Shipped |
| Input-trust boundaries | Server-side derivation of trusted fields; spoofability analysis and remediation | ✅ Shipped |
| Data minimisation | Barcode presence-only, fuzzed public identity, time-shifted visibility, encryption at rest | ✅ Shipped |
| Content governance | Moderation policy for user-submitted records (RLS + status) | 🟡 Staged |
| Regulatory / platform | GDPR export & delete; Apple/Google anti-steering compliance | ✅ Shipped |

> **In one line.** A system where a probabilistic model feeds a system of record —
> and every control an assurance reviewer would look for (constraint, validation,
> evaluation, human oversight, least-privilege authz, data minimisation) is
> present and verifiable in the code.

---

*GigTrotter · Technical Architecture Overview · Next.js 15 · Supabase RLS · Claude vision · Capacitor*
