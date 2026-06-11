# Parked — needs Mark's input

Things I can't decide or do without you. Ranked by what blocks the most downstream work.

## Now (blocks deploy)

1. **GitHub repo name.** Default I'm going with: `gigtrotter`. Says it's fine or rename before I push. Visibility: I'll create **private** by default — flip with `gh repo edit --visibility public` later.
2. **Supabase project.** I can write migrations but can't provision a project for you. Create at https://supabase.com/dashboard → drop the URL + anon + service-role keys into `.env.local`. Then `supabase link --project-ref <ref>` and `supabase db push`.
3. **Anthropic API key.** Drop into `ANTHROPIC_API_KEY`. Phase 2 capture parsing is dead without it. Pricing: ~£0.01 per parse with Sonnet 4.6.
4. **Mapbox token.** Free tier is fine. Drop into `NEXT_PUBLIC_MAPBOX_TOKEN`. The Travel Board renders a static placeholder without it.
5. **Vercel project.** `vercel link` from the repo root, then `vercel env pull` to sync. Or use the dashboard import-from-GitHub flow.

## Pre-launch (per the plan §14 checklist)

6. **The parse corpus.** Collect 50+ real screenshots from your own phone/inbox — Ticketmaster, Ryanair, EasyJet, Booking, Airbnb, DICE, Eventbrite. Drop into `eval/captures/` (I created the folder + README). This is the highest-leverage prep task in v3.
7. **Trademark clearance** on GigTrotter (UK/EU/US, ~£300–800). Before any domain purchase.
8. **Google CASA paperwork** — start reading now even though inbox sync is V1. Lead time is the constraint.
9. **Forwarding-domain DNS.** When ready, point an MX for `capture.gigtrotter.com` (or whatever subdomain you pick) at Resend or Postmark and stash the inbound webhook URL in `INBOUND_WEBHOOK_SECRET`.
10. **Apple/Google sign-in.** Configure providers in Supabase Auth. Avoid the word "Wallet" in the App Store product name (it's an in-app surface, not the brand).
11. **Launch event.** Pick the summer 2026 event your twenty users will attend — it seeds day-one density.

## Decisions I defaulted on (override any time)

- **Inbound provider:** assumed Resend (cleaner DX than Postmark) but coded the webhook to accept the common shape both use. Easy to swap.
- **Capture encryption:** envelope encryption — per-user key wrapped by `CAPTURE_MASTER_KEY`. Master key rotation is documented in `docs/SECURITY.md`.
- **Anon handle format:** adjective-noun-NNN (e.g. `midnight-fox-204`). 13M combinations. Regenerable per the plan.
- **Default circle:** `Inner Circle` for every new pin. The plan calls this out explicitly.
- **Pricing:** Free tier stays genuinely good. Premium (£4.99/mo) is wired in the schema but not paywalled — the network phase must not be paywalled.
