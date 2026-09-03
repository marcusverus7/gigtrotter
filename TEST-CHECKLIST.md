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

## Known-not-ready (don't file these as bugs)

- Push to lock screen — alerts appear on app open only; push needs a native build
- Email forwarding — no domain yet; UI says "coming soon"
- Marketplace payments — Stripe not wired; surface hidden
- On-sale / tour-announce alerts — need an events feed

## Results

| Item | Tester | Platform | Pass/Fail | Notes |
|---|---|---|---|---|
| | | | | |
