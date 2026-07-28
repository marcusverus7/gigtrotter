# GigTrotter ticket parser — synthetic eval set

Fully synthetic event tickets for the GigTrotter parse harness (`eval/run.ts`).
**No real brands, logos, artists or venues** — every platform, act and venue is
invented. This keeps the set clear of trademark/IP issues while giving the parser
the layout variety it needs.

## Layout (matches eval/run.ts)

```
eval/captures/
  <vendor>/                     vendor folder name = vendor label in the report
    ticket_NNN_<style>.png
    ticket_NNN_<style>.expected.json   <- scored against parser output
  edge-cases/                   weird crops, multi-ticket, rotated, glare, dark mode
  manifest.json
```

Vendors are fictional: tickethub, eventwave, livepass, gatezero, stagely, rowseat,
opendoor. The harness only uses the folder name as a label string, so these slot
straight in. Rename folders to your own real-vendor labels if/when you add real
redacted screenshots alongside.

## Run it

```bash
pnpm eval            # all vendors
pnpm eval tickethub  # one vendor folder only
```

Needs `ANTHROPIC_API_KEY` in `.env.local` (the parser calls Claude directly).
`pnpm eval` runs via `eval/tsconfig.json`, which aliases the parser's
`server-only` guard to a no-op shim (`eval/_shims/server-only.ts`) so the harness
runs under `tsx` outside Next's bundler. The app build is unaffected.

## API corpus eval — 2026-07-27

Full 36-sample corpus, `claude-fable-5`: **166/175 fields (94.9%)**, **35/36 parsed
cleanly**, avg 7.8s/parse. Consistent with the 25-field session baseline in
`fable-session-parses.json` (92%). Adding the show-vs-doors and support-act rules to
the system prompt moved this from 81.7% → 94.9% in the same session.

Weak spots, both worth knowing before trusting the number:

- **`starts_at` is the only mismatching field** — all 9 misses. The prompt fix stopped
  the parser emitting the *doors* time as `starts_at`; it now sometimes drops the time
  entirely and returns a date-only value instead. 6 of the 9 are clean (non-degraded)
  images that render both times, and they come back at 90–92% confidence — i.e. above
  the 0.7 manual-review threshold, so a missing time can land unreviewed.
- **`edge_crop_bottom.png` is the one schema failure**: the title is cropped off the
  image, the parser correctly declines to invent one and returns `title: null`, and
  `ParsedCaptureSchema` requires a string. Arguably the schema should allow a null
  title rather than fail the whole parse.

Per-vendor: gatezero, livepass, tickethub 100%; opendoor 24/25; stagely 28/30;
eventwave 14/15; rowseat 18/20; edge-cases 22/25. Reports land in `eval/reports/`
(gitignored).

## .expected.json schema

Sidecars carry only the fields visible on each image, matching run.ts's convention
(`{"title": "...", "starts_at": "2026-06-26T20:00"}`):

```
title, artist, venue, city,
starts_at   (ISO local datetime, from show time)
doors_at    (ISO local datetime, from doors time)
ticket_type, order_ref, barcode, price_total, currency
section, row, seat   (seated tickets only)
```

The harness scores per-field accuracy; you only need the fields you care about, so
trim sidecars freely.

**Scoring maps sidecar fields → parser output** (`eval/score.ts`): the parser
emits a smaller `ParsedCapture` shape than these sidecars carry, so `venue` is
scored against `destination.name`, `city` against `destination.city`, `barcode`
against `barcode_present` (presence), and `price_total` against
`price_total_cents` (sidecars are decimal major units, the parser emits minor
units, so the scorer converts). Fields the parser doesn't extract by design
(`artist`, `doors_at`, `ticket_type`, `order_ref`, `section`, `row`, `seat`) are
reported as **unscored**, not counted as failures — otherwise a perfect parse
would score ~14%. With the mapping, a perfect parse scores 100% on the fields the
parser is designed to produce.

`price_total` and `currency` were unscored until 2026-07-27. They're now
extracted because the resale marketplace needs them: its anti-scalper constraint
(`asking <= face_value`) was satisfiable by declaring a higher face value, since
face value came from the seller. `createListing` now cross-checks the declared
value against the price printed on the captured ticket.

## Render styles

| style      | mimics                              | degradation                          |
|------------|-------------------------------------|--------------------------------------|
| `mobile`   | in-app wallet-pass **screenshot**   | status bar, app chrome, mild blur    |
| `physical` | thermal **stub** (photo of paper)   | rotation, lighting gradient, noise   |
| `pdf`      | print-at-home **e-ticket**          | clean or light phone-photo skew      |

Edge cases add: top/bottom hard crops, ~18° rotation + glare, two-ticket sheet
(sidecar = top ticket), low-res/compressed, dark-mode screenshot.

## Regenerate / scale up

```bash
pip install pillow qrcode numpy
python3 generate_tickets.py --count 200 --out eval/captures --layout vendor --seed 7
python3 make_edge_cases.py            # adds eval/captures/edge-cases/
```

`--layout flat` instead gives a single folder + labels.jsonl if you ever want that.

## Measured accuracy — live API, 2026-07-27

Full corpus (36 images: 30 vendor tickets + 6 edge cases) against live Claude
vision, scored per-field by `eval/score.ts`:

| Run | Clean parses | Field accuracy | Avg latency |
|-----|--------------|----------------|-------------|
| Baseline prompt | 36/36 | 147/180 (81.7%) | 7.8 s |
| After prompt fix | 35/36 | 166/175 (94.9%) | 7.8 s |
| **+ price extraction** | **36/36** | **187/200 (93.5%)** | 9.1 s |

The third run scores two extra fields (`price_total`, `currency`), so its
denominator is larger — it is not a regression. Price and currency are **20/20**
on every image that actually prints a total. `starts_at` is now the dominant
remaining miss (10 of 13).

The 33 baseline misses collapsed into two systematic prompt gaps, not vision
failures:

- **Support acts dropped from `title`** (~19): returned `"Dust Republic"` where
  the ticket reads `"Dust Republic + Coral Static"`.
- **Doors time used as `starts_at`** (~10): every wrong timestamp was 1–1.5 h
  early, i.e. the doors time rather than the show time.

Two rules in `src/lib/capture/prompt.ts` fixed both (+13.2 pts). PDFs and
physical stubs now score ~5/5 consistently; remaining misses are mobile
screenshots that crop the support act off-screen.

Confidence is well calibrated: clean parses report 93–95%, and the one
deliberately-destroyed sample (`edge_crop_bottom`, title cropped away) reports
45% or returns `title: null` → `schema_mismatch`, so it fails closed to manual
review instead of writing a junk title. That single rejection is why clean parses
read 35/36 rather than 36/36 — arguably the safer behaviour, since the baseline
prompt "passed" it by inventing the title
`"Unknown event (name not visible in crop)"`.

### Two harness defects this exposed

Adding price scoring surfaced problems in the corpus and the runner, not the
parser:

- **Sidecars claimed prices that were never rendered.** `expected_sidecar` always
  wrote `price_total = total_gbp` (price + booking fee), but only `render_pdf`
  prints a Total line. `render_physical` shows the base price and
  `render_mobile` shows no price at all, so a correct parse was marked wrong on
  26 of 36 samples. The generator now emits price only for the `pdf` style.
  **`eval/captures/` is gitignored**, so a corpus generated before 2026-07-28
  still carries the bad labels — regenerate it (or strip `price_total` and
  `currency` from every non-`_pdf` sidecar) before trusting a price score.
- **A corrupted answer key made the score go UP.** `loadExpected` swallowed
  JSON.parse failures and returned `undefined`, which removes that sample's
  checks from the denominator rather than failing. A BOM written by
  `Set-Content -Encoding utf8` silently invalidated 26 sidecars and produced a
  healthy-looking **94.3%** computed over just 10 samples. The loader now strips
  BOMs and logs unreadable sidecars loudly.

The second one is the more important lesson: an eval that degrades quietly is
worse than one that crashes, because the number it reports still looks fine.

## Honest limitations

- Layouts are *plausible*, not pixel-copies of real platforms. A parser tuned only
  on this set may still miss real-world quirks — keep your ~20–30 real redacted
  captures as a separate held-out set. This synthetic set is for bulk coverage and
  labelled regression testing, not a replacement.
- All GBP, all UK/IE venues. Extend the pools in generate_tickets.py for other
  regions/currencies.
