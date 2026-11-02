# Owner facts needed before the public notices are final

Prepared 2 November 2026 as part of the pilot-readiness brief (OPS-01). Each
item below is something the public pages currently state as "to be confirmed"
or leave out, because only the owner can supply it. None of these should be
invented; the pages are written so they stay truthful while a line is blank.

| # | Fact | Where it shows | What the page says today |
| --- | --- | --- | --- |
| 1 | Legal entity that operates GigTrotter (company name and number, or sole trader) | /terms (sections 1, 5, 11, 13, 14), /privacy section 1 | "GigTrotter (legal entity to be confirmed by the owner)" via `LEGAL_ENTITY` in `src/lib/support.ts` |
| 2 | Registered or trading address | not shown | omitted |
| 3 | Support mailbox that someone actually reads | /support, /privacy, /terms, /sell | "[support contact to be confirmed by the owner]" until `SUPPORT_EMAIL` is set in Vercel |
| 4 | Governing law: England and Wales as written, or Northern Ireland | /terms section 16 | England and Wales, flagged "[owner to confirm]" |
| 5 | Whether the booking fee is refunded when a promoter cancels an event | /terms section 9 | "[owner to confirm]" |
| 6 | Promoter refund terms for reasons other than cancellation (change of line-up, postponement) | /terms section 9 | "at the promoter's discretion" |
| 7 | Legal basis and transfer mechanism for each processor (Vercel, Supabase EU, Anthropic, Stripe, Mapbox) | /privacy section 4 | listed factually; legal basis "[owner to confirm]" |
| 8 | Inbound email domain for forwarding (`FORWARDING_DOMAIN`) | landing page, /app/capture, roadmap | forwarding is not advertised on the landing page until configured |
| 9 | Pilot-night responder: who answers the phone when a door scanner fails, and their number | internal runbook only | not published; support page tells buyers to speak to door staff first |
| 10 | Stripe account, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | /sell, event pages | pages say card payments "switch on once our Stripe account is connected" |
| 11 | Which Belfast promoters are in the pilot and the fee concession, if any | /sell | "a small number of Belfast promoters"; no names, no concession |
| 12 | Whether GigTrotter should be described as a UK or EU service for consumer-law purposes | /terms | not stated |

Nothing in this list blocks local development or the test-mode pilot gates.
Items 1, 3, 4 and 5 should be settled before the first real ticket is sold.
