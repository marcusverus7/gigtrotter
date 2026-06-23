# GigTrotter — Roadmap

Working roadmap for usability, monetisation, and growth. Status legend:
`✅ done` · `🔨 shell built` (code in place, needs keys/data/partner to go live) · `📋 planned`.

> See [PARKED.md](PARKED.md) for items blocked on Mark's input (keys, accounts, paperwork).

## 0. Validate the core loop (highest leverage)

The scan pipeline was broken in beta (missing `ANTHROPIC_API_KEY`) — now fixed and live.
Before building further, prove the capture → confirm → map loop delights real users.

- 🔨 **Parse-corpus harness** — fixed and runnable via `pnpm eval`. A 36-image synthetic
  starter corpus + answer keys is loaded under `eval/captures/`, the scorer now maps answer-key
  fields to the parser's actual output (was silently scoring a perfect parse at ~14%), and the
  `server-only` import that blocked `tsx` runs is shimmed for the eval. **To run:** add
  `ANTHROPIC_API_KEY` to `.env.local` (rotate the chat-exposed key first).
- 📋 **Real-ticket validation** — drop ~20–30 real (redaction-OK) ticket/boarding-pass/hotel
  screenshots into real-vendor folders, run `pnpm eval`, fix the top failure modes. Synthetic
  proves the plumbing; real layouts are the actual go/no-go signal. (See PARKED #12.)

## 1. Usability

- ✅ **Edit date/time on saved wallet items** — inline editor on item detail page.
- 🔨 **Edit all fields post-confirm** — title, venue, kind editable on a saved item (not just dates).
- 🔨 **Mobile camera capture** — "Take photo" path on the capture dropzone so phone testers can
  shoot a paper ticket directly instead of uploading a file.
- 🔨 **First-run empty state** — a welcoming CTA on an empty wallet that drives the first scan,
  so the "aha" lands in the first session.

## 2. Monetisation

- 🔨 **Affiliate ticket links** — config-driven affiliate URL tagging on outbound "Get tickets"
  clicks. Fastest revenue with no partnership needed — join Skiddle / Ticketmaster / Eventbrite
  affiliate programs solo, drop the IDs into env, done. Click tracking already exists.
  *Go live:* register affiliate accounts, set IDs in env (see `.env.example`).
- 🔨 **Premium share cards / Year-in-review export** — Pro-tier polish that never paywalls capture
  (consistent with the locked perks-club model).
- 📋 **Perks club + marketplace fees** — locked model; needs Stripe Connect + signed perks + scale
  (PARKED #5).

## 3. Growth / popularity

- 🔨 **Shareable cards carry the brand** — watermark + join link on countdown share cards and the
  anonymous board, so every share is an ad with a way back in.
- ✅ **Gig Wrapped (year-in-review cinematic)** — built; schedule a polished push for December
  (Spotify-Wrapped-style organic spike).
- 📋 **Seeded launch event** — seed ~20 users at one summer-2026 gig/festival to reach network
  density for friends + "who else is going" (PARKED #17).
- 📋 **SEO on public venue/artist pages** — let them rank and pull organic traffic.

## Sequencing

1. Ship the usability + growth shells (this batch) — low risk, immediate tester value.
2. Register one affiliate program → flip the affiliate shell live → first revenue.
3. Run the parse-corpus test; fix top failures.
4. Re-test the full loop with testers before opening more surface area.
