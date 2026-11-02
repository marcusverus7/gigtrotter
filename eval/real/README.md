# Held-out real-ticket fixtures (CAP-02)

The synthetic corpus in `eval/captures/` measures layout coverage. It does **not**
measure how the parser does on tickets fans actually hold, so this folder is a
separate, held-out set of **permissioned, redacted real tickets** from the
issuers the pilot actually uses. Nothing here is committed: everything except
this README and `answers.example.json` is gitignored.

## Rules for adding a fixture

- The ticket holder has agreed to it being used for testing.
- **Redact before saving**: barcode / QR, order reference, name, email, seat if
  it identifies a person, payment details. A black box is fine; the parser is
  scored on title / date / venue / entry mode, not on the barcode.
- Never put a usable admission code in this folder, redacted or not.
- Keep the original issuer's layout otherwise intact; that is the point.

## Layout

```
eval/real/
  README.md                 (committed)
  answers.example.json      (committed, documents the answer-key shape)
  answers.json              (gitignored: the real answer key)
  <issuer>/<n>.png|jpg|pdf  (gitignored: e.g. ticketmaster/01.png, skiddle/02.jpg)
```

`<issuer>` is the canonical key used by `src/lib/tickets/issuer.ts`
(`ticketmaster`, `axs`, `dice`, `seetickets`, `skiddle`, `eventbrite`,
`gigantic`, `ticketweb`, `twickets`, `residentadvisor`) or `unknown`.

## answers.json

```json
{
  "provenance": "one sentence: where these came from and who agreed",
  "items": [
    {
      "file": "ticketmaster/01.png",
      "split": "heldout",
      "issuer": "ticketmaster",
      "expected": {
        "title": "Headliner + Support",
        "starts_at": "2026-11-20T19:30",
        "venue": "Limelight 1",
        "city": "Belfast",
        "vendor": "ticketmaster",
        "entry_mode": "rotating"
      },
      "critical": ["starts_at", "venue", "entry_mode"]
    }
  ]
}
```

- `split` is `"dev"` (you may look at it while tuning the prompt) or
  `"heldout"` (never used for tuning; reported separately). Do not promote a
  held-out item to dev once you have looked at its parse.
- `expected` takes any subset of: `title`, `starts_at` (ISO local, minute
  precision), `ends_at`, `venue`, `city`, `country`, `vendor`, `kind`,
  `entry_mode` (`static` | `rotating` | `app_locked` | `unknown`). Only the
  fields you give are scored.
- `critical` lists the fields whose failure would send someone to the wrong
  place, at the wrong time, or with a code that will not scan. Those are
  reported on their own line, because one of them matters more than ten
  cosmetic misses.

## Run

```bash
pnpm exec tsx --tsconfig eval/tsconfig.json eval/score-real.ts
```

Needs `ANTHROPIC_API_KEY` in `.env.local`. Without it the script prints
`blocked: no ANTHROPIC_API_KEY` and exits 2; it never invents a result. Each
run calls the paid model once per fixture, so keep the set small and run it
deliberately. The report lands in `eval/reports/real-<stamp>.md` (gitignored)
and prints: field coverage, critical failures, complete-item correctness,
latency, and correction burden, with `dev` and `heldout` reported separately.
