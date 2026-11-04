# Owner facts needed before the public notices are final

Prepared 2 November 2026 as part of the pilot-readiness brief (OPS-01). Each
item below is something the public pages currently state as "to be confirmed"
or leave out, because only the owner can supply it. None of these should be
invented; the pages are written so they stay truthful while a line is blank.

| # | Fact | Where it shows | What the page says today |
| --- | --- | --- | --- |
| 1 | ~~Legal entity~~ **Settled 2026-11-04:** sole trader, "Mark Loughran, trading as GigTrotter" | /terms, /privacy | `LEGAL_ENTITY` in `src/lib/support.ts`; swap for the company name + number when one is formed |
| 2 | Registered or trading address | not shown | omitted |
| 3 | Support mailbox that someone actually reads | /support, /privacy, /terms, /sell | "[support contact to be confirmed by the owner]" until `SUPPORT_EMAIL` is set in Vercel |
| 4 | ~~Governing law~~ **Settled 2026-11-04:** Northern Ireland | /terms section 16 | courts of Northern Ireland |
| 5 | ~~Fee on cancellation~~ **Settled 2026-11-04:** the booking fee is KEPT; only the face value is refunded | /terms section 9; migration 0036; `processRefunds` | terms say the fee is not refunded on cancellation; `request_order_refund_tx` refunds `face_cents`; the processor reverses the promoter's transfer for exactly that amount |
| 6 | Promoter refund terms for reasons other than cancellation (change of line-up, postponement) | /terms section 9 | "at the promoter's discretion" |
| 7 | ~~Legal basis per processor~~ **Drafted 2026-11-04** (contract for Supabase/Vercel/Stripe; legitimate interests for Anthropic/Mapbox/analytics; US transfers under the UK IDTA / UK Addendum or the UK-US Data Bridge; database in Supabase EU, Ireland) | /privacy section 4 | standard wording, not legal advice; worth a solicitor's read before scale |
| 8 | Inbound email domain for forwarding (`FORWARDING_DOMAIN`) | landing page, /app/capture, roadmap | forwarding is not advertised on the landing page until configured |
| 9 | Pilot-night responder: who answers the phone when a door scanner fails, and their number | internal runbook only | not published; support page tells buyers to speak to door staff first |
| 10 | Stripe account, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | /sell, event pages | pages say card payments "switch on once our Stripe account is connected" |
| 11 | Which Belfast promoters are in the pilot and the fee concession, if any | /sell | "a small number of Belfast promoters"; no names, no concession |
| 12 | Whether GigTrotter should be described as a UK or EU service for consumer-law purposes | /terms | not stated |

Nothing in this list blocks local development or the test-mode pilot gates.
Items 1, 4 and 5 are settled (2026-11-04); item 3 (support mailbox) is the last one needed before the first real ticket is sold.
