# Test checklist — beta round 3 (2026-08-25)

Everything in this round shipped as web deploys, so the current TestFlight
build and the Android shell already serve it — no new native build needed.
Test on **web + the iOS app**; they load the same deploy, but the shell can
differ on safe areas, keyboard, and share-sheet behaviour.

Several checks need **two accounts** (both test profiles survived the August
restore). Security probes marked 🔒 are run from the SQL editor or curl, not
the UI.

## Gate 0 — before anything else

- [x] **Migrations 0014–0020 applied to production 2026-09-02** and verified
      against the catalogue (RPC guards, column grants, indexes, triggers).
- [x] Latest deploy confirmed live: production `/roadmap` shows
      **"Doors tonight, and who else is going"**, and the security headers
      are present on the live origin.

## A — Security fixes (needs 0015 applied) 🔒

| # | Check | Expected |
|---|---|---|
| A1 | `select * from on_this_day('<other user id>')` as user 1 | `forbidden` error, no rows |
| A2 | `select * from who_else_going('<other user id>')` as user 1 | `forbidden` error |
| A3 | `update profiles set plan='plus' where id=auth.uid()` | permission denied |
| A4 | Submit an event as a normal user, then PATCH its `status` to `approved` via REST with the anon key + user JWT | denied; event stays pending |
| A5 | Open `/api/countdown/<any wallet item id>` with **no** `?t=` token | 404 |
| A6 | Press Share on a countdown from the item page, open the link in a private window | PNG renders |
| A7 | Visit `/app/u/<other user's username>` | profile shows, **no** anon handle anywhere on the page |
| A8 | User A sends a friend request to B; A then tries to accept it (tap accept if visible, or call the action) | fails — only B can accept |
| A9 | B accepts normally | friendship works as before |

## B — Capture flow (core product; regression pass)

| # | Check | Expected |
|---|---|---|
| B1 | Screenshot capture → confirm card | parsed fields correct, **time matches the ticket** (we're in BST — a 19:30 gig must show 19:30, not 18:30 or 20:30) |
| B2 | Edit the start time in the confirm card, save, reopen the item | time is exactly what you set — the old bug shifted it an hour on every save |
| B3 | Tap Confirm twice fast on one capture | exactly one wallet item, one map pin |
| B4 | Upload an unreadable image (blurry photo of a wall) | a manual-review card appears in the queue — previously it vanished with no error |
| B5 | Re-upload a byte-identical ticket image | still works; afterwards `vendor_fingerprints` has a row for it (cache now populates — check via SQL) |
| B6 | Manual add with the venue picker | item saves, venue attached, pin on map |
| B7 | Manual add with "I don't have a ticket yet" | lands in **Wishlist**, not Going |
| B8 | Confirm a capture with a venue name typed in | venue geocoded, pin appears on map |

## C — Dates in the wallet

| # | Check | Expected |
|---|---|---|
| C1 | A gig with a real end time | shows a range, end as time-only ("Sat 14 Sep, 19:30 – 23:00") |
| C2 | A hotel stay / multi-day item | end shown with its own date |
| C3 | A ticket where the parser set end = start | **no** range shown (placeholder suppressed) |
| C4 | Item page "Ends" stat | only present when the end is genuinely later |

## D — Alerts (needs 0017 applied)

| # | Check | Expected |
|---|---|---|
| D1 | Have a gig in your wallet starting within 24h, open the app | bell badge lights, "Tonight" alert on `/app/alerts` naming the venue |
| D2 | Two inner-circle accounts add the same gig (same title, ±24h) | each gets a "Friend going" alert naming the other |
| D3 | Close and reopen the app several times | **no duplicate alerts** (dedupe + hourly throttle) |
| D4 | Dismiss an alert | it goes and stays gone |
| D5 | Alerts empty state | copy says "doors tonight / who else is going" — no longer promises on-sale alerts we can't send |

## E — Venue pages (needs 0014 applied)

| # | Check | Expected |
|---|---|---|
| E1 | Open a venue page where you've attended a gig | "Regulars" and "Nights logged" stats show |
| E2 | Both accounts attend the same venue (past events) | attendees = 2 |
| E3 | A **future** gig at a venue | does **not** count in the stats (past-only rule) |

## F — Fixed links & pages

| # | Check | Expected |
|---|---|---|
| F1 | "On this day" / Memories entries | links open the wallet item — every one of these 404'd before |
| F2 | Year in Review tiles | same |
| F3 | Add to wallet from an event page | wallet item **and** map pin created (pin was silently failing) |
| F4 | `/app/admin/feedback` as a non-admin account | redirected to /app — previously any signed-in user could read all feedback |
| F5 | `/app/admin/feedback` as markloughran7 | feedback list loads |
| F6 | Change avatar | new image appears; a failure says so instead of pretending |

## G — Only if you flip `SHOW_UNLAUNCHED` (optional this round)

- [ ] Discussion reply count increments when **someone else** replies (0016 trigger)
- [ ] Merch order form has a country field; an order's line items all save or the order errors
- [ ] Marketplace listing card shows "Face value checked" vs "Seller-declared" correctly

## H — Added 2026-09-02 (improvement pass: security, mobile, performance)

Gate: none — migrations applied.

| # | Check | Expected |
|---|---|---|
| H1 | Tap the avatar in the mobile header | menu opens: Alerts, Wishlist, Trips, People, Settings… and **Sign out** — none of these were reachable on a phone before |
| H2 | Scroll any long page on a phone | bottom tab bar stays pinned (it used to scroll away) |
| H3 | Open a wallet item | the "When" time matches the ticket — server used to print UTC, so 19:30 showed as 06:30 PM |
| H4 | Focus any input on iPhone | page does **not** zoom in and stay zoomed |
| H5 | Submit feedback in airplane mode | an error shows — it used to vanish silently |
| H6 | Friends list → "Map" button | opens the friend's profile (used to 404) |
| H7 | Open Alerts, navigate away and back | bell badge cleared (viewing now marks read) |
| H8 | Upload the same ticket image twice | second confirm appears fast (cache) and storage holds ONE blob for it |
| H9 | 🔒 Script >100 captures in a day | 101st returns 429 "Daily capture limit reached" |
| H10 | 🔒 `curl -sI https://gigtrotter.vercel.app` | shows X-Frame-Options: DENY, nosniff, Referrer-Policy |
| H11 | Navigate between app pages on a phone | noticeably snappier — the layout no longer runs four sequential round trips per navigation |

## I — Events feed (added 2026-09-02; migrations 0021-0022 applied)

| # | Check | Expected |
|---|---|---|
| I1 | Nav (desktop sidebar + phone avatar menu) | **Events** now appears; Marketplace/Merch still hidden |
| I2 | /app/events | real Ticketmaster listings across UK+IE, soonest first |
| I3 | City chips | tapping Manchester shows only Manchester; All resets |
| I4 | Follow an artist (artist page), revisit /app/events | a "For you" rail appears with their dates |
| I5 | Event page → "Get tickets" | opens the Ticketmaster listing |
| I6 | Add to wallet from a feed event | wallet item + map pin created |
| I7 | Follow an artist, then wait for a nightly sync that adds a new date for them (or ask me to insert one), reopen app | ONE tour-announce alert per artist ("X: 3 new dates"), never one per date; nothing for dates that already existed when you followed; no duplicate on re-open |
| I11 | Follow an artist whose name has a comma, e.g. "Leslie Odom, Jr." → /app/events | "For you" rail shows their dates (was silently empty before 2026-09-05) |
| I8 | Follow an artist/venue whose tickets go on sale this week | one on-sale alert; time renders in YOUR timezone |
| I9 | 🔒 `select * from feed_sync_runs order by started_at desc limit 3` | nightly rows, errors=0, upserted>0 |
| I10 | 🔒 curl the cron route without the bearer token | 401 |

## J — Audit fixes (added 2026-09-06)

Everything here was found by a code audit, not by a tester, so these are the
rows most likely to still be wrong.

| # | Check | Expected |
|---|---|---|
| J1 | Sign out, then sign up with a username someone already has | "That username is already taken" — not "Database error saving new user" |
| J2 | New account: at "How should we call you?", leave Display name blank | Continue stays disabled; fill it in, Continue, then "Skip" lands on the wallet and STAYS there (it used to bounce back to step 0 forever) |
| J3 | /app/events city chips | London, Glasgow, Manchester, Dublin, Birmingham… — the real circuit, not Aberdeen/Aylesbury/Watford |
| J4 | Visit `/app/events?city=%25` (a literal `%`) | Shows everything with "All" highlighted, NOT a city chip claiming one city |
| J5 | An event with no image that is sold out | "Sold out" is visible on the CARD, not only after opening it |
| J6 | A festival or unannounced-time event | Shows the date and "time TBA" — never a made-up 19:00 |
| J7 | "N upcoming" badge next to Browse events | The real total (thousands), not always 30 |
| J8 | With a city chip active, search for an artist | Results stay in that city; the chip and the list agree |
| J9 | Phone: tap the avatar in the header | Opens on the first tap — the target is 44px now, not 32 |
| J10 | Phone/keyboard: open the avatar menu, Tab to "Sign out", press Enter | Actually signs out (it used to just close the menu) |
| J11 | Wallet item for a gig that has now passed, open the app | Status becomes Attended within the hour, a map pin appears, and the "how was it?" prompt offers a rating |
| J12 | Wallet item more than 12h away vs less than 12h | Reads Going, then flips to Tonight — the badge and the tab agree |
| J13 | Correct a wrong date on an item from past to future | Pin disappears from the map; correcting it back re-creates it |
| J14 | Night Mode with a wishlist (no-ticket) gig tonight | It does NOT appear as tonight's ticket |
| J15 | Add a flight and a gig in the same week, open /app/trips | Both in ONE trip, without pressing Re-cluster (needs migration 0024) |
| J16 | Backfill 3 screenshots, one of them a photo of nothing | Says how many were read and how many "need filling in by hand" — no bare red X |
| J17 | Alerts page, an on-sale alert | Shows the on-sale TIME in your timezone, not just a date |
| J18 | Dates anywhere (trips, venues, artists, activity, event detail) | Match your phone's clock — no times an hour out |
| J19 | 🔒 `curl -H "Authorization: Bearer $CRON_SECRET" https://gigtrotter.vercel.app/api/health` | 200 with db/storage/feed/anthropic all ok |
| J20 | 🔒 Public board `/b/<your handle>` after adding a feed gig | Pin sits on the CITY, not on the venue building |

## K — November 2026 sweep (added 2026-11-02)

Found by a fresh code review and a real phone-sized walk with a test account.

| # | Check | Expected |
|---|---|---|
| K1 | Accept a friend, then tap the heart on their row on People | They join your Inner Circle; THEY now see your upcoming gigs on your map page (this tier was dead before — nothing ever wrote to it) |
| K2 | Event page where a friend has marked Going | "Friends going" shows them (the RPC it called never existed) |
| K3 | Confirm a ticket whose date has no printed time | Shows 19:00 on the card, stays "Upcoming" until that evening — not "Attended" at 5am |
| K4 | Confirm a FUTURE ticket as Vault, wait for it to pass | The pin is Vault, not Inner |
| K5 | Rate a gig added from Events or by hand | It now counts toward achievements |
| K6 | Open a past gig with no end time | Rating, review and Add photo are there |
| K7 | Take a full-size photo of a paper ticket on a phone | Uploads (it's shrunk client-side); no "Couldn't read this one" for a 6MB photo |
| K8 | Drop the same screenshot twice | One confirm card, not two |
| K9 | Settings → Export my data | Only YOUR rows (it included every user's profile before) |
| K10 | Visit /app/marketplace or /app/merch by URL | Bounced to the wallet |
| K11 | Artist page | A Follow button that works, not "go to Discover and retype the name" |
| K12 | Wallet with upcoming gigs but nothing tonight | Opens on Upcoming, not an empty Tonight tab |
| K13 | Empty wallet | The get-started card, with nothing hidden under the Feedback button |
| K14 | Events grid on 4G | Loads quickly (cards use the 640px image, not the 2048px one) |
| K15 | 🔒 Apply migration 0026, then `GET /rest/v1/event_interests?select=user_id` with the anon key | Only your own and friends' rows |
| K16 | 🔒 iOS: Take photo (needs a NEW native build) | Camera opens with a permission prompt instead of the app being killed |

## L — November build (added 2026-11-02)

| # | Check | Expected |
|---|---|---|
| L1 | Night mode for a Ticketmaster or AXS ticket | No barcode drawn; "Open in Ticketmaster" button and a line saying screenshots don't scan |
| L2 | Night mode for a See Tickets / Skiddle / Eventbrite ticket | Barcode strip shown; "Open my See Tickets ticket" link |
| L3 | Item page for an upcoming DICE ticket | "Getting in · DICE" panel instead of the barcode placeholder |
| L4 | /app/review/2026 → Share | On a phone the system share sheet opens with a 1080×1920 card; on desktop the PNG downloads |
| L5 | Open the card URL with the token changed | 404 |
| L6 | 🔒 Apply 0027. A pin from exactly one year ago today, open the app | "One year ago tonight: …" alert linking to the pin |
| L7 | 🔒 Send a friend request | The other account gets a "wants to be friends" alert; accepting sends one back |
| L8 | A friend overlap on a PAST gig | Alert says "was there too", not "is going too" |

## M — November build, wave two (added 2026-11-02)

| # | Check | Expected |
|---|---|---|
| M1 | /app/import → "Paste a list", two gigs, Add | "Found 2, added 2"; both on the map as Attended; running it again adds 0 |
| M2 | 🔒 With SETLISTFM_API_KEY set: Import → setlist.fm username | Attended shows become pins with setlists attached |
| M3 | 🔒 With SETLISTFM_API_KEY set + 0028 applied: open a past gig's pin | A "Setlist" block appears after a moment, with a setlist.fm credit link and "Relive it" |
| M4 | 🔒 0028 applied: a sold-out feed event | "Want one? Join the list" button; count updates; second account sees the count |
| M5 | Upcoming ticket's item page | "Can't go?" panel routed by issuer (DICE → Return, Ticketmaster → Transfer) |
| M6 | 🔒 With SPOTIFY_CLIENT_ID/SECRET set: Settings → Connect Spotify | Opens Spotify consent in the system browser, returns to Settings with "now following N artists"; those artists are in People → Following |
| M7 | 🔒 With SKIDDLE_API_KEY set: wait for the nightly sync | feed_sync_runs gets a `skiddle` row; grassroots venues appear on Events with "Buy on Skiddle" |
| M8 | Events → Browse, scroll to the bottom | "Load more" fetches the next 30; disappears when exhausted |
| M9 | Capture a ticket on a slow connection | Status reads Preparing → Uploading → "Reading the ticket — usually 5–15 seconds" |
| M10 | Backfill 3+ screenshots, then Capture | "Confirm the N confident ones" button confirms the ≥80% cards in one tap; the rest stay |
| M11 | Public Board page | Share link (phone) and Copy link buttons |

## N — Ticketing (added 2026-11-02; schema live since 2026-11-02; still needs Stripe keys)

| # | Check | Expected |
|---|---|---|
| N1 | As a promoter: submit an event, open it, "Sell tickets for this event" | Sales page with Payouts (Not set up), Ticket types, Guest list, Door |
| N2 | Set up payouts with Stripe (test mode) | Stripe hosted onboarding; back on Settings "Payouts are set up"; badge reads Ready |
| N3 | Add a £15 General ticket, capacity 2 | Shows "Buyer pays £15.95 … You receive £15.00 … On Eventbrite £16.63" |
| N4 | As a buyer: event page | Buy box with +/−, fee shown per ticket, total updates; "Buy tickets" → Stripe Checkout |
| N5 | Pay with test card 4242 4242 4242 4242 | Back on /app/orders/…: "Paid — you're going", two QR codes; both in the wallet with "Your ticket" QR; Night Mode shows the QR on the day |
| N6 | Buy the last ticket, then try again as another account | "has sold out" before checkout; tier shows Sold out |
| N7 | Abandon a checkout, wait 30 minutes | Stock comes back (reserved → 0) |
| N8 | Promoter: Door → type the code | Green IN with tier + name; scan again → red ALREADY USED with the time |
| N9 | Promoter: Guest list → give a ticket to a username | Appears in their wallet as a comp; scans at the door |
| N10 | Buyer: item page → Send this ticket to a friend | Friend gets a new QR; the sender's QR scans as CANCELLED |
| N11 | Promoter sales page after a sale | Sold / Orders / You're owed update; Stripe dashboard shows the transfer of face value |
| N12 | 🔒 POST junk to /api/stripe/webhook | 400 bad signature; nothing changes |
| N13 | Abandon checkout, then run the nightly cron (or wait for 04:00) | Pending orders past their window flip to expired and stock returns, even if the Stripe webhook never fired |
| N14 | (offline, already green) `pnpm test:logic` ticketing block | Fulfilment issues one signed ticket per admission, replay is a no-op, expiry releases stock once, signed webhook verifies and tampered/wrong-secret/unsigned are refused |
| N15 | Buyer A: item page of a bought ticket -> Sell at face value | Listing appears; Send this ticket hides; anyone on the want-one list gets a Resale alert (needs migration 0030) |
| N16 | Buyer B: event page -> Fan resale -> Buy, pay with 4242 | B's order page shows a fresh QR; A's wallet item archived and A's old code scans CANCELLED; Stripe shows A refunded face value with the promoter transfer reversed by the same amount |
| N17 | Buyer B abandons the resale checkout, wait 30 min | Listing back to open on the event page; A can still withdraw it |

## Known-not-ready (don't file these as bugs)

- Push to lock screen — alerts appear on app open only; push needs a native build
- Email forwarding — no domain yet; UI says "coming soon"
- Marketplace payments — Stripe not wired; surface hidden
- Bandsintown "For you" dates only appear for artists someone follows — follow-driven by design

## O — Pilot hardening (added 2026-11-02; needs 0031 + 0032 applied)

| ID | Steps | Expected |
|---|---|---|
| O1 | 🔒 Anonymous `GET /rest/v1/achievements` and `/rest/v1/admin_provider_clicks` with the anon key | 401/403 for all four views; signed-in user gets only their own achievements row |
| O2 | 🔒 Anonymous `POST /rest/v1/rpc/trip_assemble` with a nil uuid | Error `forbidden`, not 204 |
| O3 | User A marks "going" on a future event; check as B (inner circle), C (plain friend), D (stranger), signed-out | Only A and B see it; after the event ends C sees it too; D and signed-out never |
| O4 | `pnpm test:db` against staging | All db gates pass: 100 concurrent buyers → exactly 10 reservations; concurrent duplicate fulfilment → exactly N tickets; racing scanners admit one |
| O5 | Promoter sales page → Door staff → add a test user; open `/app/events/<id>/scan` as them; remove them | Scanner opens for staff, no sales/payout data visible; after removal the scanner redirects away |
| O6 | Scanner with Wi-Fi off, type a valid code | Amber "couldn't reach the server, retry"; never red; retry after reconnect shows IN (or "already in (your scan)" if the first attempt landed) |
| O7 | Night mode / item page for an imported Ticketmaster, Eventbrite and unknown-seller ticket | Issuer instructions only; no barcode-looking block anywhere |
| O8 | `/app/admin/orders` as the admin; `curl` the reconcile endpoint with `CRON_SECRET` | Page says Clean; endpoint 200 `"ok":true`; as a non-admin the page redirects |
| O9 | After Stripe keys: buy 2 tickets, then kill the webhook (wrong secret) and buy again; wait for the 15-min workflow or press Reconcile now | Second order is fulfilled by the reconciler from Stripe's paid status; no duplicate tickets; stock exact |
| O10 | After Stripe keys: resale a ticket; check `/app/admin/orders` and the Stripe dashboard | One seller refund of face with the transfer reversed; refund row succeeded with the Stripe id; seller order still paid; buyer has one valid ticket, seller's scans CANCELLED |
| O11 | After Stripe keys: admin → Refund whole order | Tickets scan CANCELLED immediately; order shows refunded only once Stripe accepts; one refund in Stripe |
| O12 | Signed out: open `/events`, an event page, click Sign in to buy, sign in | Lands back on that event in the app |
| O13 | 🔒 After 0033: anonymous `GET /rest/v1/profiles?select=username,anon_handle&limit=1` | 42501 permission denied; `select=username` still 200; signed-in Settings page still shows your own board handle and plan |

## Results

| Item | Tester | Platform | Pass/Fail | Notes |
|---|---|---|---|---|
| O4 | 2026-11-03 | Pass | Staging (hhjjlyizrryjttxtjvcu), all 33 migrations applied: `pnpm test:db` 74/74 (role isolation, NULL-caller guards, future-plans matrix, 100 buyers → 10 seats, concurrent fulfilment, resale tx, transfers, scanner race, door-staff rights). |
| O1 | 2026-11-03 | Pass (staging) | Anonymous key on staging: achievements and admin views 401; production re-check after 0031 is applied. |
| O2 | 2026-11-03 | Pass (staging) | Anonymous `trip_assemble` → 42501 permission denied on staging. |
| O13 | 2026-11-03 | Pass (staging) | `profiles?select=username,anon_handle` 401; `select=username` 200; `bump_anon_view` 401; `are_friends` false for anon. |
| N5 | 2026-11-02 | Pass (fallback) | Re-run after cd01d4e: guest list issues through the stepwise fallback while 0033 is absent; the transactional path needs 0033 applied. |
| O4 | 2026-11-02 | Partial | Live races on the production DB, test tier only (`pnpm test:race-live`): 100 buyers for 2 seats → exactly 2; 10 scanners on one code → exactly 1. Full staging run (fulfilment, roles) still pending. |
| N5 | 2026-11-02 | Pass | Guest list → ticket issued to @sweeptester; item page shows the real QR and code (local dev server, production data). |
| N6 | 2026-11-02 | Pass (after fix) | First attempt read NOT FOUND for a valid code (invalid profiles embed; fixed 2026-11-02). Now: IN with holder name; second scan ALREADY USED; junk NOT A TICKET; row used once. |
| O6 | 2026-11-02 | Partial | Same-operator retry within two minutes shows amber ALREADY IN "your scan … not a second entry". Network-loss branch still needs a device with Wi-Fi off. |
| O7 | 2026-11-02 | Pass (partial) | Item page for an RA ticket on the local dev server: issuer instructions, no barcode block. Night mode had nothing within 12h to check. |
| O8 | 2026-11-02 | Pass (pre-0031) | Admin orders page renders Clean as the dev admin; reconcile endpoint 200 with CRON_SECRET, 401 without. Re-check after 0031. |
| O5 | 2026-11-02 | Partial | Door staff section renders with its empty state; adding/removing needs 0031 in production. |
| N1 | Claude (test account sweeptester) | Web, Chrome, local dev against prod DB | Pass | 2026-11-02: promoter sees Sell tickets; non-promoter is redirected to the event page |
| N3 | Claude | Web, Chrome | Pass | 2026-11-02: General admission GBP 15 cap 2 created; page shows Buyer pays GBP 15.95, You receive GBP 15.00, Eventbrite GBP 16.63; row in ticket_tiers |
| N4 | Claude | Web, Chrome | Pass (to the Stripe wall) | 2026-11-02: buy box renders GBP 15.00 + GBP 0.95 fee, 2 left, Buy disabled with Payments are not switched on yet; Stripe keys still absent |
| N12 | Claude | curl | Pass | 2026-11-02: unsigned POST to /api/stripe/webhook is 503 while unconfigured; signed/tampered cases covered by eval tests |
